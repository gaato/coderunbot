/**
 * Stores anonymous monthly usage counters through the shared state backend.
 * The collector is discord.js-free and keeps no invocation-level identifiers or content.
 */
import type { AppLogger } from "./logger.js";
import type { StateBackend } from "./state.js";

interface CommandCounts {
  ok: number;
  error: number;
}

interface MonthStats {
  commands: Record<string, CommandCounts>;
  runLanguages: Record<string, number>;
  guilds: Record<string, number>;
}

interface UsageStatsDocument {
  version: 1;
  months: Record<string, MonthStats>;
}

export interface UsageStatsOptions {
  readonly flushIntervalMs?: number;
  readonly now?: () => Date;
  readonly logger?: AppLogger;
}

const DEFAULT_FLUSH_INTERVAL_MS = 300_000;

export class UsageStats {
  readonly #backend: StateBackend;
  readonly #flushIntervalMs: number;
  readonly #now: () => Date;
  readonly #logger?: AppLogger;
  #state: UsageStatsDocument = emptyDocument();
  #dirty = false;
  #flushTimer?: NodeJS.Timeout;
  // This promise-chain mutex serializes writes within the bot's single writer process.
  #writeChain: Promise<void> = Promise.resolve();

  constructor(backend: StateBackend, options: UsageStatsOptions = {}) {
    this.#backend = backend;
    this.#flushIntervalMs =
      options.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS;
    this.#now = options.now ?? (() => new Date());
    this.#logger = options.logger;
  }

  async init(): Promise<void> {
    const value = await this.#backend.read();
    if (value.trim().length === 0) {
      this.#state = emptyDocument();
    } else {
      try {
        this.#state = parseDocument(value);
      } catch (error) {
        this.#logger?.warn(
          { error },
          "Usage statistics state is corrupt; starting with empty counters",
        );
        this.#state = emptyDocument();
      }
    }
    this.#dirty = false;
    this.#flushTimer = setInterval(() => {
      void this.flush().catch((error) => {
        this.#logger?.error(
          { error },
          "Failed to flush usage statistics state",
        );
      });
    }, this.#flushIntervalMs);
    this.#flushTimer.unref();
  }

  recordCommand(kind: string, name: string, outcome: "ok" | "error"): void {
    const month = this.#currentMonth();
    const key = `${kind}/${name}`;
    let counts = month.commands[key];
    if (counts === undefined) {
      counts = { ok: 0, error: 0 };
      month.commands[key] = counts;
    }
    counts[outcome] += 1;
    this.#dirty = true;
  }

  recordRunLanguage(languageKey: string): void {
    const month = this.#currentMonth();
    month.runLanguages[languageKey] =
      (month.runLanguages[languageKey] ?? 0) + 1;
    this.#dirty = true;
  }

  recordGuildCount(count: number): void {
    const now = this.#now();
    const month = this.#month(now);
    month.guilds[now.toISOString().slice(0, 10)] = count;
    this.#dirty = true;
  }

  async flush(): Promise<void> {
    if (!this.#dirty) {
      await this.#writeChain;
      return;
    }

    this.#dirty = false;
    const value = `${JSON.stringify(this.#state, null, 2)}\n`;
    const write = this.#enqueueWrite(value);
    try {
      await write;
    } catch (error) {
      this.#dirty = true;
      throw error;
    }
  }

  async dispose(): Promise<void> {
    if (this.#flushTimer !== undefined) {
      clearInterval(this.#flushTimer);
      this.#flushTimer = undefined;
    }
    await this.flush();
  }

  #currentMonth(): MonthStats {
    return this.#month(this.#now());
  }

  #month(now: Date): MonthStats {
    const key = now.toISOString().slice(0, 7);
    let month = this.#state.months[key];
    if (month === undefined) {
      month = emptyMonth();
      this.#state.months[key] = month;
    }
    return month;
  }

  #enqueueWrite(value: string): Promise<void> {
    const write = this.#writeChain.then(() => this.#backend.write(value));
    this.#writeChain = write.catch(() => undefined);
    return write;
  }
}

function emptyDocument(): UsageStatsDocument {
  return { version: 1, months: {} };
}

function emptyMonth(): MonthStats {
  return { commands: {}, runLanguages: {}, guilds: {} };
}

function parseDocument(value: string): UsageStatsDocument {
  const parsed: unknown = JSON.parse(value);
  if (!isRecord(parsed) || parsed.version !== 1 || !isRecord(parsed.months)) {
    throw new Error("usage statistics state has an unsupported shape");
  }

  for (const month of Object.values(parsed.months)) {
    if (
      !isRecord(month) ||
      !isRecord(month.commands) ||
      !isRecord(month.runLanguages) ||
      !isRecord(month.guilds)
    ) {
      throw new Error("usage statistics month has an unsupported shape");
    }
    for (const counts of Object.values(month.commands)) {
      if (
        !isRecord(counts) ||
        !isCounter(counts.ok) ||
        !isCounter(counts.error)
      ) {
        throw new Error("usage statistics command counts are invalid");
      }
    }
    if (
      !Object.values(month.runLanguages).every(isCounter) ||
      !Object.values(month.guilds).every(isCounter)
    ) {
      throw new Error("usage statistics aggregate counts are invalid");
    }
  }

  return parsed as unknown as UsageStatsDocument;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCounter(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}
