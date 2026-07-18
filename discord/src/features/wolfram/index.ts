/**
 * Implements the Wolfram feature and paginates adapter results for Discord.
 */
import {
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  SlashCommandBuilder,
  TextDisplayBuilder,
} from "discord.js";
import {
  FAILURE_ACCENT,
  SUCCESS_ACCENT,
} from "../../platform/discord/components.js";
import { paginatedReply } from "../../platform/discord/paginator.js";
import { getFixedT } from "../../shared/i18n.js";
import type {
  Feature,
  FeatureDependencies,
  OutgoingReply,
} from "../../types.js";
import { WolframClient, type WolframQueryResult } from "./wolframClient.js";

export function createWolframFeature(
  dependencies: FeatureDependencies,
): Feature | undefined {
  if (dependencies.env.wolframAppId === undefined) {
    return undefined;
  }
  const client = new WolframClient(dependencies.env.wolframAppId);
  const slashCommand = new SlashCommandBuilder()
    .setName("wolf")
    .setDescription("Query Wolfram|Alpha")
    .setDescriptionLocalizations({ ja: "Wolfram|Alpha に問い合わせます" });
  slashCommand.addStringOption((option) =>
    option
      .setName("query")
      .setDescription("Query to send to Wolfram|Alpha")
      .setDescriptionLocalizations({
        ja: "Wolfram|Alpha に送信するクエリ",
      })
      .setRequired(true),
  );

  const execute = async (
    query: string,
    userId: string,
    locale: string,
  ): Promise<OutgoingReply> => {
    const result = await client.query(query);
    return wolframReply(result, userId, locale, dependencies);
  };

  return {
    id: "wolfram",
    prefixCommands: [
      {
        name: "wolf",
        aliases: ["wolfram"],
        execute(_message, args, context) {
          return execute(args, context.userId, context.locale);
        },
      },
    ],
    slashCommands: [
      {
        data: slashCommand,
        async execute(interaction, context) {
          if (!interaction.isChatInputCommand()) {
            return undefined;
          }
          // Acknowledge within Discord's three-second interaction window before the API call.
          await interaction.deferReply();
          return execute(
            interaction.options.getString("query", true),
            context.userId,
            context.locale,
          );
        },
      },
    ],
  };
}

function wolframReply(
  result: WolframQueryResult,
  userId: string,
  locale: string,
  dependencies: Pick<FeatureDependencies, "logger">,
): OutgoingReply {
  const t = getFixedT(locale);
  if (!result.success) {
    return {
      kind: "components-v2",
      components: [
        new ContainerBuilder()
          .setAccentColor(FAILURE_ACCENT)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `### ${t("wolfram.errorHeading")}\n${t("wolfram.notUnderstood")}`,
            ),
          ),
      ],
    };
  }

  const pages = result.pods.flatMap((pod) =>
    pod.subpods.map((subpod) => {
      const container = new ContainerBuilder()
        .setAccentColor(SUCCESS_ACCENT)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`## ${pod.title}`),
        );
      if (subpod.plaintext.length > 0) {
        container.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(subpod.plaintext),
        );
      }
      if (subpod.img !== undefined) {
        container.addMediaGalleryComponents(
          new MediaGalleryBuilder().addItems(
            new MediaGalleryItemBuilder().setURL(subpod.img.src),
          ),
        );
      }
      return container;
    }),
  );

  if (pages.length === 0) {
    return {
      kind: "components-v2",
      components: [
        new ContainerBuilder()
          .setAccentColor(FAILURE_ACCENT)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(t("wolfram.noResults")),
          ),
      ],
    };
  }
  return paginatedReply({
    pages,
    userId,
    logger: dependencies.logger,
  });
}
