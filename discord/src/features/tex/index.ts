/**
 * Defines TeX feature commands and delegates rendering to the Discord-free adapter.
 */
import {
  ActionRowBuilder,
  ModalBuilder,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { getFixedT } from "../../shared/i18n.js";
import type {
  Feature,
  FeatureDependencies,
  OutgoingReply,
} from "../../types.js";
import {
  stripTexFences,
  texFailureReply,
  texSuccessReply,
} from "./presentation.js";
import { renderTexToPng, TexRenderError } from "./renderer.js";

type TexEnvironment = "align" | "gather";

export function createTexFeature(_dependencies: FeatureDependencies): Feature {
  const slashCommand = new SlashCommandBuilder()
    .setName("tex")
    .setDescription("Render TeX as an image")
    .setDescriptionLocalizations({
      ja: "TeX を画像としてレンダリングします",
    });
  slashCommand.addStringOption((option) =>
    option
      .setName("env")
      .setDescription("The environment to use")
      .setDescriptionLocalizations({ ja: "使用する環境" })
      .addChoices(
        { name: "align", value: "align" },
        { name: "gather", value: "gather" },
      ),
  );
  slashCommand.addBooleanOption((option) =>
    option
      .setName("spoiler")
      .setDescription("Mark the rendered image as a spoiler")
      .setDescriptionLocalizations({
        ja: "レンダリング画像をスポイラーとして隠します",
      }),
  );

  return {
    id: "tex",
    prefixCommands: [
      {
        name: "tex",
        async execute(_message, args, context) {
          return renderReply(stripTexFences(args), false, context.locale);
        },
      },
      {
        name: "stex",
        async execute(_message, args, context) {
          return renderReply(stripTexFences(args), true, context.locale);
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
          const environment = parseEnvironment(
            interaction.options.getString("env"),
          );
          const spoiler = interaction.options.getBoolean("spoiler") ?? false;
          const t = getFixedT(context.locale);
          const input = new TextInputBuilder()
            .setCustomId("latex")
            .setLabel(t("tex.modal.codeLabel"))
            .setPlaceholder(t("tex.modal.codePlaceholder"))
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true);
          if (environment !== undefined) {
            input.setValue(`\\begin{${environment}}\n\n\\end{${environment}}`);
          }

          const modal = new ModalBuilder()
            .setCustomId(
              `texModal:${spoiler}:${environment === undefined ? "" : environment}`,
            )
            .setTitle(t("tex.modal.title"))
            .addComponents(
              new ActionRowBuilder<TextInputBuilder>().addComponents(input),
            );
          // Discord accepts a modal only as the interaction's first response.
          await interaction.showModal(modal);
          return undefined;
        },
      },
    ],
    modalHandlers: {
      texModal: async (interaction, context) => {
        const [, spoilerValue] = interaction.customId.split(":");
        const spoiler = spoilerValue === "true";
        const latex = interaction.fields.getTextInputValue("latex");
        // Acknowledge within Discord's three-second interaction window before rendering.
        await interaction.deferReply();
        return renderReply(latex, spoiler, context.locale);
      },
    },
  };
}

async function renderReply(
  latex: string,
  spoiler: boolean,
  locale: string,
): Promise<OutgoingReply> {
  const t = getFixedT(locale);
  try {
    const png = await renderTexToPng(latex);
    return texSuccessReply(latex, png, spoiler, t);
  } catch (error) {
    if (error instanceof TexRenderError) {
      return texFailureReply(error.message, t);
    }
    throw error;
  }
}

function parseEnvironment(value: string | null): TexEnvironment | undefined {
  return value === "align" || value === "gather" ? value : undefined;
}
