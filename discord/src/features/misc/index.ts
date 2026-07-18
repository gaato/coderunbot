/**
 * Implements the miscellaneous mention-response feature over Discord and OpenAI.
 */
import type { Message } from "discord.js";
import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { OptOutUsers } from "../../shared/state.js";
import type { Feature, FeatureDependencies } from "../../types.js";

export const DEVELOPER_SYSTEM_PROMPT =
  "これはDiscordでのチャットです。" +
  "以下の様々なユーザーによる直近のメッセージ履歴を参考に、" +
  "あなたがメンションされている最後のメッセージに返信してください。";

export const SHORT_REPLY_SYSTEM_PROMPT =
  "これはDiscordのチャットです。" +
  "以下は直近のメッセージ履歴です。" +
  "一言で返信してください。";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_COUNT = 3;

export class MentionRateLimiter {
  readonly #mentions = new Map<string, number[]>();

  allow(userId: string, now = Date.now()): boolean {
    const recent = (this.#mentions.get(userId) ?? []).filter(
      (timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS,
    );
    if (recent.length >= RATE_LIMIT_COUNT) {
      this.#mentions.set(userId, recent);
      return false;
    }
    recent.push(now);
    this.#mentions.set(userId, recent);
    return true;
  }
}

export interface ChatCompletionClient {
  create(options: {
    readonly model: string;
    readonly messages: readonly ChatCompletionMessageParam[];
  }): Promise<{
    readonly choices: readonly {
      readonly message: { readonly content: string | null };
    }[];
  }>;
}

export async function fetchRecentHistory(
  message: Message,
  botUserId: string,
  optOutUsers: Pick<OptOutUsers, "has">,
  limit = 10,
): Promise<ChatCompletionMessageParam[]> {
  const fetched = await message.channel.messages.fetch({ limit });
  // Opted-out users' messages must never enter the OpenAI conversation context.
  return [...fetched.values()]
    .reverse()
    .filter((entry) => !optOutUsers.has(entry.author.id))
    .map((entry) => ({
      role: entry.author.id === botUserId ? "assistant" : "user",
      content: entry.content,
    }));
}

export function createMiscFeature(
  dependencies: FeatureDependencies,
  completionClient?: ChatCompletionClient,
): Feature | undefined {
  if (dependencies.env.openAIApiKey === undefined) {
    return undefined;
  }
  const completion =
    completionClient ??
    new OpenAI({ apiKey: dependencies.env.openAIApiKey }).chat.completions;
  const limiter = new MentionRateLimiter();

  return {
    id: "misc",
    async onMessage(message) {
      const botUser = dependencies.client.user;
      if (
        message.author.bot ||
        botUser === null ||
        // Parsed mentions avoid the old bot's false positives from substring-matching its ID.
        !message.mentions.has(botUser) ||
        !limiter.allow(message.author.id)
      ) {
        return undefined;
      }

      if ("sendTyping" in message.channel) {
        // Messages use typing for feedback; interactions must ack within three seconds instead.
        await message.channel.sendTyping();
      }
      const history = await fetchRecentHistory(
        message,
        botUser.id,
        dependencies.optOutUsers,
      );
      const isDeveloper = message.author.id === dependencies.env.developerId;
      const response = await completion.create({
        model: isDeveloper
          ? dependencies.env.openAIChatModel
          : dependencies.env.openAIChatModelLite,
        messages: [
          {
            role: "system",
            content: isDeveloper
              ? DEVELOPER_SYSTEM_PROMPT
              : SHORT_REPLY_SYSTEM_PROMPT,
          },
          ...history,
        ],
      });
      // Replies directly instead of returning an OutgoingReply, matching the old bot:
      // chat responses get no Delete button and no edit-follow tracking.
      await message.reply({
        content: response.choices[0]?.message.content ?? "",
        allowedMentions: { parse: [], repliedUser: true },
      });
      dependencies.usageStats.recordCommand("mention", "misc", "ok");
      return undefined;
    },
  };
}
