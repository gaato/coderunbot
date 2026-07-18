/**
 * Defines the code-execution feature and its Discord command entry points.
 */
import {
  ActionRowBuilder,
  ApplicationCommandType,
  ContextMenuCommandBuilder,
  escapeMarkdown,
  ModalBuilder,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { getFixedT } from "../../shared/i18n.js";
import type { UsageStats } from "../../shared/usageStats.js";
import type {
  Feature,
  FeatureDependencies,
  OutgoingReply,
} from "../../types.js";
import {
  parsePrefixRunInput,
  runResultReply,
  supportedLanguagesReply,
  wandboxErrorReply,
} from "./presentation.js";
import {
  normalizeLanguageKey,
  WandboxClient,
  WandboxError,
} from "./wandbox.js";

export function escapeMentions(content: string): string {
  return content.replaceAll("@", "@\u200b");
}

export function createCodeFeature(dependencies: FeatureDependencies): Feature {
  const wandbox = new WandboxClient({ logger: dependencies.logger });
  const runCommand = new SlashCommandBuilder()
    .setName("run")
    .setDescription("Run code on Wandbox")
    .setDescriptionLocalizations({ ja: "Wandbox でコードを実行します" });
  runCommand.addStringOption((option) =>
    option
      .setName("language")
      .setNameLocalizations({ ja: "言語" })
      .setDescription("Programming language")
      .setDescriptionLocalizations({ ja: "プログラミング言語" })
      .setRequired(true)
      .setAutocomplete(true),
  );
  const escapeCommand = new ContextMenuCommandBuilder()
    .setName("escape")
    .setNameLocalizations({ ja: "エスケープ" })
    .setType(ApplicationCommandType.Message);

  return {
    id: "code",
    init: () => wandbox.init(),
    prefixCommands: [
      {
        name: "run",
        async execute(_message, args, context) {
          const input = parsePrefixRunInput(args);
          return runCode(
            wandbox,
            dependencies.usageStats,
            input.languageKey,
            input.code,
            "",
            context.locale,
          );
        },
      },
    ],
    slashCommands: [
      {
        data: runCommand,
        async execute(interaction, context) {
          if (!interaction.isChatInputCommand()) {
            return undefined;
          }
          const languageKey = normalizeLanguageKey(
            interaction.options.getString("language", true),
          );
          const t = getFixedT(context.locale);
          const code = new TextInputBuilder()
            .setCustomId("code")
            .setLabel(t("code.modal.codeLabel"))
            .setPlaceholder(t("code.modal.codePlaceholder"))
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true);
          const stdin = new TextInputBuilder()
            .setCustomId("stdin")
            .setLabel(t("code.modal.stdinLabel"))
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false);
          const modal = new ModalBuilder()
            .setCustomId(`runModal:${languageKey}`)
            .setTitle(t("code.modal.title"))
            .addComponents(
              new ActionRowBuilder<TextInputBuilder>().addComponents(code),
              new ActionRowBuilder<TextInputBuilder>().addComponents(stdin),
            );
          // Discord accepts a modal only as the interaction's first response.
          await interaction.showModal(modal);
          return undefined;
        },
        async autocomplete(interaction) {
          const focused = normalizeLanguageKey(
            String(interaction.options.getFocused()),
          );
          await interaction.respond(
            wandbox
              .getLanguageChoices()
              .filter(({ value }) => value.startsWith(focused))
              // Discord caps autocomplete responses at 25 choices.
              .slice(0, 25),
          );
        },
      },
      {
        data: escapeCommand,
        async execute(interaction) {
          if (!interaction.isMessageContextMenuCommand()) {
            return undefined;
          }
          return {
            kind: "plain",
            content: escapeMentions(
              escapeMarkdown(interaction.targetMessage.content),
            ),
            ephemeral: true,
          };
        },
      },
    ],
    modalHandlers: {
      runModal: async (interaction, context) => {
        const languageKey = normalizeLanguageKey(
          interaction.customId.slice("runModal:".length),
        );
        const code = interaction.fields.getTextInputValue("code");
        const stdin = interaction.fields.getTextInputValue("stdin");
        // Acknowledge within Discord's three-second interaction window before remote work.
        await interaction.deferReply();
        return runCode(
          wandbox,
          dependencies.usageStats,
          languageKey,
          code,
          stdin,
          context.locale,
        );
      },
    },
  };
}

async function runCode(
  wandbox: WandboxClient,
  usageStats: Pick<UsageStats, "recordRunLanguage">,
  languageKey: string,
  code: string,
  stdin: string,
  locale: string,
): Promise<OutgoingReply> {
  const t = getFixedT(locale);
  const resolution = await wandbox.resolveCompiler(languageKey);
  if (resolution === undefined) {
    return supportedLanguagesReply(wandbox.getLanguageChoices(), t);
  }
  usageStats.recordRunLanguage(languageKey);

  try {
    const result = await wandbox.compile(resolution.compiler, code, stdin);
    return runResultReply(resolution.compiler, languageKey, code, result, t);
  } catch (error) {
    if (
      error instanceof WandboxError &&
      (error.code === "connection" ||
        error.code === "http" ||
        error.code === "non_json")
    ) {
      return wandboxErrorReply(error, t);
    }
    throw error;
  }
}
