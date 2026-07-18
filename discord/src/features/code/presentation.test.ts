import { ContainerBuilder } from "discord.js";
import { describe, expect, it } from "vitest";
import { getFixedT } from "../../shared/i18n.js";
import type { OutgoingReply } from "../../types.js";
import {
  parsePrefixRunInput,
  runResultReply,
  supportedLanguagesReply,
} from "./presentation.js";

function containerJson(reply: OutgoingReply) {
  if (reply.kind !== "components-v2") {
    throw new Error("expected a Components V2 reply");
  }
  const container = reply.components[0];
  if (!(container instanceof ContainerBuilder)) {
    throw new Error("expected a ContainerBuilder");
  }
  return container.toJSON();
}

describe("parsePrefixRunInput", () => {
  it("extracts the language key and removes complete fence lines", () => {
    expect(
      parsePrefixRunInput(" Python ```python\nprint('hello')\n```"),
    ).toEqual({ languageKey: "python", code: "print('hello')" });
  });

  it("does not rewrite language aliases", () => {
    expect(parsePrefixRunInput("cpp code").languageKey).toBe("cpp");
  });
});

describe("runResultReply", () => {
  it("uses the status color and omits message fields", () => {
    const reply = runResultReply(
      "compiler",
      "python",
      "print(1)",
      {
        status: "0",
        program_output: "1\n",
        program_message: "duplicate output",
        compiler_message: "ignored",
      },
      getFixedT("en"),
    );
    const json = containerJson(reply);

    expect(json.accent_color).toBe(0x2ecc71);
    expect(JSON.stringify(json)).not.toContain("duplicate output");
    expect(JSON.stringify(json)).not.toContain("ignored");
    expect(JSON.stringify(json)).toContain("print(1)");
  });

  it("uses a File component for output over 1000 characters", () => {
    const reply = runResultReply(
      "compiler",
      "python",
      "print(1)",
      { status: "1", compiler_error: "x".repeat(1_001) },
      getFixedT("en"),
    );

    expect(reply.files).toHaveLength(1);
    expect(containerJson(reply)).toMatchObject({
      accent_color: 0xe74c3c,
      components: expect.arrayContaining([
        { file: { url: "attachment://compiler_error.txt" }, type: 13 },
      ]),
    });
  });
});

describe("supportedLanguagesReply", () => {
  it("moves a long language list into a text attachment", () => {
    const reply = supportedLanguagesReply(
      Array.from({ length: 200 }, (_, index) => ({
        name: `Language ${index}`,
        value: `language-${index}`,
      })),
      getFixedT("en"),
    );

    expect(reply.files).toHaveLength(1);
    expect(JSON.stringify(containerJson(reply))).toContain(
      "supported-languages.txt",
    );
  });
});
