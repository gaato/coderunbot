import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LocalFileState, OptOutUsers, type StateBackend } from "./state.js";

class MemoryState implements StateBackend {
  readonly writes: string[] = [];

  constructor(readonly value = "") {}

  async read(): Promise<string> {
    return this.value;
  }

  async write(value: string): Promise<void> {
    this.writes.push(value);
  }
}

describe("OptOutUsers", () => {
  it("parses newline-delimited string snowflakes and ignores blank lines", async () => {
    const state = new MemoryState(
      " 123456789012345678\r\n\n987654321098765432\n",
    );
    const users = new OptOutUsers(state);

    await users.init();

    expect(users.has("123456789012345678")).toBe(true);
    expect(users.has("987654321098765432")).toBe(true);
    expect(users.has("123456789012345679")).toBe(false);
  });

  it("serializes sorted IDs with a trailing newline", async () => {
    const state = new MemoryState();
    const users = new OptOutUsers(state);
    await users.init();

    await users.add("9");
    await users.add("10");
    await users.remove("9");

    expect(state.writes).toEqual(["9\n", "10\n9\n", "10\n"]);
  });

  it("serializes concurrent writes in call order", async () => {
    const writes: string[] = [];
    let releaseFirstWrite: (() => void) | undefined;
    const firstWriteBlocked = new Promise<void>((resolve) => {
      releaseFirstWrite = resolve;
    });
    let writeCount = 0;
    const state: StateBackend = {
      async read() {
        return "";
      },
      async write(value) {
        writeCount += 1;
        if (writeCount === 1) {
          await firstWriteBlocked;
        }
        writes.push(value);
      },
    };
    const users = new OptOutUsers(state);
    await users.init();

    const first = users.add("2");
    const second = users.add("1");
    await Promise.resolve();
    expect(writeCount).toBe(1);

    releaseFirstWrite?.();
    await Promise.all([first, second]);

    expect(writes).toEqual(["2\n", "1\n2\n"]);
  });
});

describe("LocalFileState", () => {
  it("returns an empty string for a missing file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "coderunbot-state-"));
    const state = new LocalFileState(join(directory, "missing", "state.txt"));

    await expect(state.read()).resolves.toBe("");
  });

  it("creates parent directories and writes UTF-8 text", async () => {
    const directory = await mkdtemp(join(tmpdir(), "coderunbot-state-"));
    const filePath = join(directory, "nested", "state.txt");
    const state = new LocalFileState(filePath);

    await state.write("123\n");

    await expect(readFile(filePath, "utf8")).resolves.toBe("123\n");
    await expect(state.read()).resolves.toBe("123\n");
  });
});
