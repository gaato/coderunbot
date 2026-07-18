import {
  AttachmentBuilder,
  type Client,
  DiscordAPIError,
  RESTJSONErrorCodes,
} from "discord.js";
import { getFixedT } from "../../shared/i18n.js";
import type { AppLogger } from "../../shared/logger.js";
import type { OutgoingReply } from "../../types.js";
import { failureContainer } from "./components.js";
import type { RequestContext } from "./context.js";

export class InvalidInputError extends Error {}

export interface ErrorPresenterOptions {
  readonly client: Client;
  readonly logger: AppLogger;
  readonly logChannelId: string;
  readonly supportServerLink: string;
}

export class ErrorPresenter {
  readonly #client: Client;
  readonly #logger: AppLogger;
  readonly #logChannelId: string;
  readonly #supportServerLink: string;

  constructor(options: ErrorPresenterOptions) {
    this.#client = options.client;
    this.#logger = options.logger;
    this.#logChannelId = options.logChannelId;
    this.#supportServerLink = options.supportServerLink;
  }

  async present(
    error: unknown,
    context: RequestContext,
    invocation: string,
  ): Promise<OutgoingReply> {
    const normalized =
      error instanceof Error ? error : new Error(String(error));
    await this.#logToDiscord(invocation, normalized);

    const t = getFixedT(context.locale);
    const message =
      error instanceof InvalidInputError
        ? `## ${t("errors.invalidInput")}\n${error.message}`
        : `## ${t("errors.unhandled")}\n${t("errors.report", {
            supportLink: this.#supportServerLink,
          })}`;

    return {
      kind: "components-v2",
      components: [failureContainer(message)],
    };
  }

  async #logToDiscord(invocation: string, error: Error): Promise<void> {
    const stack = error.stack ?? `${error.name}: ${error.message}`;
    let channel = this.#client.channels.cache.get(this.#logChannelId);

    if (channel === undefined) {
      try {
        channel =
          (await this.#client.channels.fetch(this.#logChannelId)) ?? undefined;
      } catch (fetchError) {
        this.#logger.error(
          {
            error: fetchError,
            originalError: stack,
            channelId: this.#logChannelId,
          },
          "Unable to fetch Discord log channel",
        );
        return;
      }
    }

    if (channel === undefined || !channel.isSendable()) {
      this.#logger.error(
        { originalError: stack, channelId: this.#logChannelId },
        "Discord log channel is not sendable",
      );
      return;
    }

    const content = `\`\`\`\n${invocation.slice(0, 1_900)}\n\`\`\``;
    try {
      await channel.send({
        content,
        files: [
          new AttachmentBuilder(Buffer.from(stack), {
            name: "error.txt",
          }),
        ],
      });
    } catch (sendError) {
      const forbidden =
        sendError instanceof DiscordAPIError &&
        sendError.code === RESTJSONErrorCodes.MissingPermissions;
      this.#logger.error(
        {
          error: sendError,
          originalError: stack,
          channelId: this.#logChannelId,
        },
        forbidden
          ? "Bot is missing access to Discord log channel"
          : "Failed to send error to Discord log channel",
      );
    }
  }
}
