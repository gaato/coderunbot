/**
 * Covers mention throttling, parsed-mention gating, and private-history filtering.
 */
import type { Message } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import type { FeatureDependencies } from "../../types.js";
import {
  type ChatCompletionClient,
  createMiscFeature,
  MentionRateLimiter,
  SHORT_REPLY_SYSTEM_PROMPT,
} from "./index.js";

describe("MentionRateLimiter", () => {
  it("allows three messages per user in sixty seconds", () => {
    const limiter = new MentionRateLimiter();
    expect(limiter.allow("user", 0)).toBe(true);
    expect(limiter.allow("user", 1)).toBe(true);
    expect(limiter.allow("user", 2)).toBe(true);
    expect(limiter.allow("user", 3)).toBe(false);
    expect(limiter.allow("user", 60_000)).toBe(true);
  });
});

describe("misc mention response", () => {
  it("filters opted-out history and uses the mocked completion", async () => {
    const fetched = new Map([
      ["3", { author: { id: "caller" }, content: "<@bot> hello" }],
      ["2", { author: { id: "opted-out" }, content: "private" }],
      ["1", { author: { id: "bot" }, content: "earlier reply" }],
    ]);
    const fetch = vi.fn().mockResolvedValue(fetched);
    const sendTyping = vi.fn().mockResolvedValue(undefined);
    const reply = vi.fn().mockResolvedValue(undefined);
    const hasMention = vi.fn().mockReturnValue(true);
    const message = {
      author: { id: "caller", bot: false },
      mentions: { has: hasMention },
      channel: { messages: { fetch }, sendTyping },
      reply,
    } as unknown as Message;
    const create = vi.fn().mockResolvedValue({
      choices: [{ message: { content: "short answer" } }],
    });
    const completion = { create } as ChatCompletionClient;
    const recordCommand = vi.fn();
    const dependencies = {
      client: { user: { id: "bot" } },
      optOutUsers: { has: (id: string) => id === "opted-out" },
      usageStats: { recordCommand },
      env: {
        openAIApiKey: "key",
        developerId: "developer",
        openAIChatModel: "full-model",
        openAIChatModelLite: "lite-model",
      },
    } as unknown as FeatureDependencies;

    const feature = createMiscFeature(dependencies, completion);
    await feature?.onMessage?.(message, {} as never);

    expect(hasMention).toHaveBeenCalledWith(dependencies.client.user);
    expect(fetch).toHaveBeenCalledWith({ limit: 10 });
    expect(create).toHaveBeenCalledWith({
      model: "lite-model",
      messages: [
        { role: "system", content: SHORT_REPLY_SYSTEM_PROMPT },
        { role: "assistant", content: "earlier reply" },
        { role: "user", content: "<@bot> hello" },
      ],
    });
    expect(reply).toHaveBeenCalledWith({
      content: "short answer",
      allowedMentions: { parse: [], repliedUser: true },
    });
    expect(recordCommand).toHaveBeenCalledWith("mention", "misc", "ok");
  });
});
