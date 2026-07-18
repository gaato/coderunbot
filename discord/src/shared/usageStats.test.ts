/**
 * Tests anonymous usage aggregation, recovery, serialization, and restart persistence.
 */
import { describe, expect, it, vi } from "vitest";
import type { AppLogger } from "./logger.js";
import type { StateBackend } from "./state.js";
import { UsageStats } from "./usageStats.js";

class MemoryState implements StateBackend {
  readonly writes: string[] = [];

  constructor(public value = "") {}

  async read(): Promise<string> {
    return this.value;
  }

  async write(value: string): Promise<void> {
    this.value = value;
    this.writes.push(value);
  }
}

describe("UsageStats", () => {
  it("buckets command outcomes and languages by UTC month", async () => {
    const state = new MemoryState();
    let now = new Date("2026-07-31T23:59:59.000Z");
    const stats = new UsageStats(state, { now: () => now });
    await stats.init();

    stats.recordCommand("slash", "tex", "ok");
    stats.recordCommand("slash", "tex", "error");
    stats.recordCommand("slash", "tex", "ok");
    stats.recordRunLanguage("python");
    now = new Date("2026-08-01T00:00:00.000Z");
    stats.recordCommand("prefix", "run", "ok");
    stats.recordRunLanguage("cpp");
    await stats.flush();

    expect(JSON.parse(state.value)).toEqual({
      version: 1,
      months: {
        "2026-07": {
          commands: { "slash/tex": { ok: 2, error: 1 } },
          runLanguages: { python: 1 },
          guilds: {},
        },
        "2026-08": {
          commands: { "prefix/run": { ok: 1, error: 0 } },
          runLanguages: { cpp: 1 },
          guilds: {},
        },
      },
    });
    await stats.dispose();
  });

  it("overwrites the guild snapshot within a UTC day", async () => {
    const state = new MemoryState();
    let now = new Date("2026-07-18T00:00:01.000Z");
    const stats = new UsageStats(state, { now: () => now });
    await stats.init();

    stats.recordGuildCount(40);
    now = new Date("2026-07-18T23:59:59.000Z");
    stats.recordGuildCount(42);
    now = new Date("2026-07-19T00:00:00.000Z");
    stats.recordGuildCount(41);
    await stats.flush();

    expect(JSON.parse(state.value).months["2026-07"].guilds).toEqual({
      "2026-07-18": 42,
      "2026-07-19": 41,
    });
    await stats.dispose();
  });

  it("recovers from corrupt JSON and warns through the optional logger", async () => {
    const state = new MemoryState("{not json");
    const warn = vi.fn();
    const logger = { warn } as unknown as AppLogger;
    const stats = new UsageStats(state, {
      now: () => new Date("2026-07-18T12:00:00.000Z"),
      logger,
    });

    await stats.init();
    stats.recordCommand("slash", "run", "ok");
    await stats.flush();

    expect(warn).toHaveBeenCalledOnce();
    expect(JSON.parse(state.value)).toEqual({
      version: 1,
      months: {
        "2026-07": {
          commands: { "slash/run": { ok: 1, error: 0 } },
          runLanguages: {},
          guilds: {},
        },
      },
    });
    await stats.dispose();
  });

  it("writes pretty-printed JSON with a trailing newline only when dirty", async () => {
    const state = new MemoryState();
    const stats = new UsageStats(state, {
      now: () => new Date("2026-07-18T12:00:00.000Z"),
    });
    await stats.init();

    await stats.flush();
    expect(state.writes).toEqual([]);
    stats.recordRunLanguage("python");
    await stats.flush();

    expect(state.writes).toEqual([
      `${JSON.stringify(
        {
          version: 1,
          months: {
            "2026-07": {
              commands: {},
              runLanguages: { python: 1 },
              guilds: {},
            },
          },
        },
        null,
        2,
      )}\n`,
    ]);
    await stats.dispose();
  });

  it("loads persisted counters and continues them after a restart", async () => {
    const state = new MemoryState();
    const now = () => new Date("2026-07-18T12:00:00.000Z");
    const first = new UsageStats(state, { now });
    await first.init();
    first.recordCommand("slash", "tex", "ok");
    first.recordRunLanguage("python");
    await first.dispose();

    const second = new UsageStats(state, { now });
    await second.init();
    second.recordCommand("slash", "tex", "error");
    second.recordRunLanguage("python");
    await second.dispose();

    expect(JSON.parse(state.value)).toEqual({
      version: 1,
      months: {
        "2026-07": {
          commands: { "slash/tex": { ok: 1, error: 1 } },
          runLanguages: { python: 2 },
          guilds: {},
        },
      },
    });
  });
});
