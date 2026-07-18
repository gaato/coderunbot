import type { MessageEditOptions } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import type { ReplyTarget } from "./context.js";
import {
  type EditableReply,
  ReplyCoordinator,
  type ReplyTransport,
} from "./replyCoordinator.js";

function editableReply(): EditableReply {
  return {
    edit: vi.fn(async (_options: MessageEditOptions) => undefined),
    delete: vi.fn(async () => undefined),
  };
}

describe("ReplyCoordinator generations", () => {
  it("drops late results from older generations and edits the tracked reply", async () => {
    const reply = editableReply();
    const transport: ReplyTransport = {
      send: vi.fn(async () => reply),
      edit: vi.fn(async (target, payload) => {
        await target.edit({ content: payload.content });
      }),
      delete: vi.fn(async (target) => {
        await target.delete();
      }),
    };
    const coordinator = new ReplyCoordinator(100, transport);
    const target = {} as ReplyTarget;
    const firstGeneration = coordinator.begin("code", "source");
    const latestGeneration = coordinator.begin("code", "source");

    await expect(
      coordinator.deliver({
        featureId: "code",
        target,
        userId: "user",
        outgoing: { kind: "plain", content: "old" },
        sourceMessageId: "source",
        generation: firstGeneration,
      }),
    ).resolves.toBe("stale");
    expect(transport.send).not.toHaveBeenCalled();

    await expect(
      coordinator.deliver({
        featureId: "code",
        target,
        userId: "user",
        outgoing: { kind: "plain", content: "latest" },
        sourceMessageId: "source",
        generation: latestGeneration,
      }),
    ).resolves.toBe("sent");

    const editedGeneration = coordinator.begin("code", "source");
    await expect(
      coordinator.deliver({
        featureId: "code",
        target,
        userId: "user",
        outgoing: { kind: "plain", content: "edited" },
        sourceMessageId: "source",
        generation: editedGeneration,
      }),
    ).resolves.toBe("edited");

    expect(transport.send).toHaveBeenCalledTimes(1);
    expect(transport.edit).toHaveBeenCalledTimes(1);
  });

  it("removes tracked replies when the invocation is deleted", async () => {
    const reply = editableReply();
    const transport: ReplyTransport = {
      send: vi.fn(async () => reply),
      edit: vi.fn(async () => undefined),
      delete: vi.fn(async () => undefined),
    };
    const coordinator = new ReplyCoordinator(100, transport);
    const generation = coordinator.begin("tex", "source");
    await coordinator.deliver({
      featureId: "tex",
      target: {} as ReplyTarget,
      userId: "user",
      outgoing: { kind: "plain", content: "result" },
      sourceMessageId: "source",
      generation,
    });

    await coordinator.deleteReplies("source");

    expect(transport.delete).toHaveBeenCalledWith(reply);
    expect(coordinator.isTracked("tex", "source")).toBe(false);
  });
});
