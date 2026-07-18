import { describe, expect, it, vi } from "vitest";
import {
  languageChoices,
  parseCompilerList,
  resolveCompilerFromList,
  WandboxClient,
  WandboxNonJsonError,
  WandboxSchemaError,
} from "./wandbox.js";

const silentLogger = {
  error: vi.fn(),
  warn: vi.fn(),
};

describe("resolveCompilerFromList", () => {
  it("uses a pinned compiler when it is present", () => {
    expect(
      resolveCompilerFromList("python", [
        { name: "cpython-head", language: "Python" },
        { name: "cpython-3.14.0", language: "Python" },
      ]),
    ).toEqual({ compiler: "cpython-3.14.0", source: "pinned" });
  });

  it("uses the first stable compiler for an unpinned language", () => {
    expect(
      resolveCompilerFromList(
        "brainfuck",
        [
          { name: "brainfuck-git", language: "Brainfuck" },
          { name: "bfc-stable", language: "Brainfuck" },
        ],
        {},
      ),
    ).toEqual({ compiler: "bfc-stable", source: "heuristic" });
  });

  it("falls back to the first compiler if no stable compiler exists", () => {
    expect(
      resolveCompilerFromList(
        "future",
        [
          { name: "future-head", language: "Future" },
          { name: "future-git", language: "Future" },
        ],
        {},
      ),
    ).toEqual({ compiler: "future-head", source: "heuristic" });
  });

  it("falls back heuristically when a pinned compiler disappears", () => {
    expect(
      resolveCompilerFromList("python", [
        { name: "cpython-head", language: "Python" },
        { name: "cpython-3.15.0", language: "Python" },
      ]),
    ).toEqual({
      compiler: "cpython-3.15.0",
      source: "heuristic",
      missingPinnedCompiler: "cpython-3.14.0",
    });
  });
});

describe("parseCompilerList", () => {
  it("accepts entries containing the required fields", () => {
    expect(
      parseCompilerList([
        { name: "compiler", language: "Language", extra: true },
      ]),
    ).toEqual([{ name: "compiler", language: "Language" }]);
  });

  it.each([
    {},
    [null],
    [{ name: "compiler" }],
    [{ name: 1, language: "Language" }],
  ])("rejects a malformed response", (value) => {
    expect(() => parseCompilerList(value)).toThrow(WandboxSchemaError);
  });
});

describe("languageChoices", () => {
  it("preserves display names and uses normalized keys without alias hacks", () => {
    expect(
      languageChoices([
        { name: "gcc", language: "C++" },
        { name: "clang", language: "C++" },
        { name: "bfc", language: "Brain Fuck" },
      ]),
    ).toEqual([
      { name: "C++", value: "c++" },
      { name: "Brain Fuck", value: "brainfuck" },
    ]);
  });
});

describe("WandboxClient.compile", () => {
  it("filters Nim compiler CC lines and sends the hint-suppression flags", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "0",
          compiler_error: "CC: stdlib_system.nim\nwarning\nCC: main.nim\n",
        }),
        { status: 200 },
      ),
    );
    const client = new WandboxClient({
      logger: silentLogger,
      fetch: fetchMock,
    });

    await expect(client.compile("nim-2.2.10", "echo 1", "")).resolves.toEqual({
      status: "0",
      compiler_error: "warning\n",
    });
    const body = JSON.parse(
      String(fetchMock.mock.calls[0]?.[1]?.body),
    ) as Record<string, string>;
    expect(body["compiler-option-raw"]?.split("\n")).toHaveLength(4);
  });

  it("retains the response text when JSON parsing fails", async () => {
    const client = new WandboxClient({
      logger: silentLogger,
      fetch: vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          new Response("service unavailable", { status: 200 }),
        ),
    });

    const error = await client
      .compile("compiler", "code", "")
      .catch((value: unknown) => value);
    expect(error).toBeInstanceOf(WandboxNonJsonError);
    expect((error as WandboxNonJsonError).responseText).toBe(
      "service unavailable",
    );
  });
});

describe("WandboxClient compiler-list cache", () => {
  it("keeps stale compilers when a TTL refresh fails", async () => {
    let now = 0;
    const logger = { error: vi.fn(), warn: vi.fn() };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([{ name: "cpython-3.14.0", language: "Python" }]),
        ),
      )
      .mockRejectedValueOnce(new TypeError("offline"));
    const client = new WandboxClient({
      logger,
      fetch: fetchMock,
      now: () => now,
      cacheTtlMs: 100,
    });

    await client.init();
    now = 101;

    await expect(client.resolveCompiler("python")).resolves.toMatchObject({
      compiler: "cpython-3.14.0",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ staleCompilerCount: 1 }),
      expect.stringContaining("retaining stale cache"),
    );
  });

  it("logs a schema error and starts with an empty list", async () => {
    const logger = { error: vi.fn(), warn: vi.fn() };
    const client = new WandboxClient({
      logger,
      fetch: vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(JSON.stringify({ changed: true }))),
    });

    await expect(client.init()).resolves.toBeUndefined();
    expect(client.getLanguageChoices()).toEqual([]);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.any(WandboxSchemaError) }),
      expect.stringContaining("expected schema"),
    );
  });
});
