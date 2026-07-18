import { randomUUID } from "node:crypto";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  type ContainerBuilder,
  type Message,
  MessageFlags,
} from "discord.js";
import type { AppLogger } from "../../shared/logger.js";
import type { OutgoingReply } from "../../types.js";
import { deleteButtonRow } from "./components.js";

export const PAGINATOR_TIMEOUT_MS = 10 * 60 * 1_000;

interface StoppableCollector {
  stop(reason?: string): void;
}

const activeCollectors = new WeakMap<Message, StoppableCollector>();

export function cancelPaginator(message: Message): void {
  activeCollectors.get(message)?.stop("replaced");
  activeCollectors.delete(message);
}

export interface PaginatorOptions {
  readonly pages: readonly ContainerBuilder[];
  readonly userId: string;
  readonly logger: AppLogger;
  readonly timeoutMs?: number;
}

function navigationRow(
  token: string,
  pageIndex: number,
  pageCount: number,
  disabled = false,
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`pg:${token}:previous`)
      .setLabel("◀")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || pageIndex === 0),
    new ButtonBuilder()
      .setCustomId(`pg:${token}:page`)
      .setLabel(`${pageIndex + 1} / ${pageCount}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`pg:${token}:next`)
      .setLabel("▶")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || pageIndex === pageCount - 1),
  );
}

export function paginatedReply(options: PaginatorOptions): OutgoingReply {
  if (options.pages.length === 0) {
    throw new Error("paginator requires at least one page");
  }

  const token = randomUUID();
  let pageIndex = 0;
  const messageComponents = (disabled = false) => [
    options.pages[pageIndex] as ContainerBuilder,
    navigationRow(token, pageIndex, options.pages.length, disabled),
    deleteButtonRow(options.userId),
  ];

  return {
    kind: "components-v2",
    components: [
      options.pages[0] as ContainerBuilder,
      navigationRow(token, 0, options.pages.length),
    ],
    async onDelivered(message) {
      const collector = message.createMessageComponentCollector({
        componentType: ComponentType.Button,
        filter: (interaction) =>
          interaction.customId.startsWith(`pg:${token}:`),
        time: options.timeoutMs ?? PAGINATOR_TIMEOUT_MS,
      });
      activeCollectors.set(message, collector);

      collector.on("collect", (interaction) => {
        void (async () => {
          if (interaction.user.id !== options.userId) {
            await interaction.deferUpdate();
            return;
          }

          if (interaction.customId.endsWith(":previous")) {
            pageIndex = Math.max(0, pageIndex - 1);
          } else if (interaction.customId.endsWith(":next")) {
            pageIndex = Math.min(options.pages.length - 1, pageIndex + 1);
          }
          await interaction.update({ components: messageComponents() });
        })().catch((error: unknown) => {
          options.logger.warn({ error }, "Paginator interaction failed");
        });
      });

      collector.on("end", (_collected, reason) => {
        if (reason === "replaced") {
          return;
        }
        if (activeCollectors.get(message) === collector) {
          activeCollectors.delete(message);
        }
        void message
          .edit({
            components: messageComponents(true),
            flags: MessageFlags.IsComponentsV2,
          })
          .catch((error: unknown) => {
            options.logger.debug(
              { error },
              "Unable to disable expired paginator",
            );
          });
      });
    },
  };
}
