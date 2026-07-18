/**
 * Covers the escape context-menu reply for empty, normal, and oversized targets.
 */
import { describe, expect, it } from "vitest";
import { escapeMentions, escapeReply } from "./index.js";

describe("escapeMentions", () => {
  it("neutralizes mentions with a zero-width space", () => {
    expect(escapeMentions("@everyone")).toBe("@​everyone");
  });
});

describe("escapeReply", () => {
  it("explains instead of failing when the target has no text", () => {
    const reply = escapeReply("", "en");
    expect(reply.kind).toBe("plain");
    if (reply.kind === "plain") {
      expect(reply.content).toBe("That message has no text to escape.");
    }
    expect(reply.ephemeral).toBe(true);
  });

  it("returns escaped markdown as plain ephemeral content", () => {
    const reply = escapeReply("*hi* @everyone", "en");
    expect(reply.kind).toBe("plain");
    if (reply.kind === "plain") {
      expect(reply.content).toBe("\\*hi\\* @​everyone");
    }
  });

  it("falls back to a file when escaping outgrows the content limit", () => {
    // 1,500 asterisks escape to 3,000 characters, past the 2,000 limit.
    const reply = escapeReply("*".repeat(1_500), "en");
    expect(reply.kind).toBe("components-v2");
    expect(reply.files).toHaveLength(1);
    expect(reply.ephemeral).toBe(true);
  });
});
