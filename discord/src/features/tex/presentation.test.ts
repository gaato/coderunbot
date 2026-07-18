/**
 * Verifies TeX input cleanup, hints, and Discord presentation payloads.
 */
import { ContainerBuilder } from "discord.js";
import { describe, expect, it } from "vitest";
import { getFixedT } from "../../shared/i18n.js";
import type { OutgoingReply } from "../../types.js";
import {
  shouldShowMultilineHint,
  stripTexFences,
  texSuccessReply,
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

describe("stripTexFences", () => {
  it.each([
    ["```tex\nx^2\n```", "x^2"],
    ["```\nx^2\n```", "x^2"],
    ["  x^2  ", "x^2"],
  ])("removes an optional TeX or plain code fence", (input, expected) => {
    expect(stripTexFences(input)).toBe(expected);
  });
});

describe("shouldShowMultilineHint", () => {
  it("suggests an environment for bare line breaks", () => {
    expect(shouldShowMultilineHint("x \\\\ y")).toBe(true);
  });

  it.each([
    "x + y",
    "\\begin{align}x \\\\ y\\end{align}",
    "\\begin{gather}x \\\\ y",
    "x \\\\ y\\end{gather}",
  ])("does not suggest one when inappropriate", (latex) => {
    expect(shouldShowMultilineHint(latex)).toBe(false);
  });
});

describe("texSuccessReply", () => {
  it("marks the media-gallery item itself as a spoiler", () => {
    const reply = texSuccessReply(
      "x^2",
      Buffer.from("png"),
      true,
      getFixedT("en"),
    );

    expect(containerJson(reply)).toMatchObject({
      type: 17,
      components: expect.arrayContaining([
        {
          type: 12,
          items: [
            {
              media: { url: "attachment://tex.png" },
              spoiler: true,
            },
          ],
        },
      ]),
    });
  });

  it("uses a text attachment when the source is over the display limit", () => {
    const reply = texSuccessReply(
      "x".repeat(1_001),
      Buffer.from("png"),
      false,
      getFixedT("en"),
    );

    expect(reply.files).toHaveLength(2);
    expect(containerJson(reply)).toMatchObject({
      components: expect.arrayContaining([
        { file: { url: "attachment://tex-source.txt" }, type: 13 },
      ]),
    });
  });
});
