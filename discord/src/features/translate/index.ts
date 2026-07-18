/**
 * Implements the translation feature and its Discord presentation over OpenAI.
 */
import {
  type AttachmentBuilder,
  ContainerBuilder,
  FileBuilder,
  SlashCommandBuilder,
  TextDisplayBuilder,
} from "discord.js";
import ISO6391 from "iso-639-1";
import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import {
  SUCCESS_ACCENT,
  textComponent,
} from "../../platform/discord/components.js";
import { getFixedT } from "../../shared/i18n.js";
import type {
  Feature,
  FeatureDependencies,
  OutgoingReply,
} from "../../types.js";

export interface LanguageChoice {
  readonly name: string;
  readonly value: string;
}

export interface ResolvedLanguage {
  readonly code: string;
  readonly name: string;
}

export function autocompleteLanguages(
  input: string,
  languageNames: readonly string[] = ISO6391.getAllNames(),
): LanguageChoice[] {
  const normalized = input.trim().toLowerCase();
  if (normalized.length <= 1) {
    return [];
  }
  if (normalized.length === 2) {
    const name = ISO6391.getName(normalized);
    return name.length === 0 ? [] : [{ name, value: normalized }];
  }

  // Discord caps autocomplete responses at 25 choices.
  return languageNames
    .filter((name) => name.toLowerCase().startsWith(normalized))
    .sort(
      (left, right) => left.length - right.length || left.localeCompare(right),
    )
    .slice(0, 25)
    .map((name) => ({ name, value: ISO6391.getCode(name) }));
}

export function resolveLanguage(input: string): ResolvedLanguage | undefined {
  const normalized = input.trim().toLowerCase();
  const code = ISO6391.validate(normalized)
    ? normalized
    : ISO6391.getCode(input.trim());
  if (code.length === 0) {
    return undefined;
  }
  return { code, name: ISO6391.getName(code) };
}

interface TranslationCompletionClient {
  create(options: {
    readonly model: string;
    readonly messages: readonly ChatCompletionMessageParam[];
  }): Promise<{
    readonly choices: readonly {
      readonly message: { readonly content: string | null };
    }[];
  }>;
}

export function createTranslateFeature(
  dependencies: FeatureDependencies,
  completionClient?: TranslationCompletionClient,
): Feature | undefined {
  if (dependencies.env.openAIApiKey === undefined) {
    return undefined;
  }
  const completion =
    completionClient ??
    new OpenAI({ apiKey: dependencies.env.openAIApiKey }).chat.completions;
  const command = new SlashCommandBuilder()
    .setName("translate")
    .setDescription("Translate text")
    .setDescriptionLocalizations({ ja: "テキストを翻訳します" });
  command.addStringOption((option) =>
    option
      .setName("text")
      .setDescription("Text to translate")
      .setDescriptionLocalizations({ ja: "翻訳するテキスト" })
      .setRequired(true),
  );
  command.addStringOption((option) =>
    option
      .setName("to")
      .setDescription("Language to translate to")
      .setDescriptionLocalizations({ ja: "翻訳先の言語" })
      .setRequired(true)
      .setAutocomplete(true),
  );

  return {
    id: "translate",
    slashCommands: [
      {
        data: command,
        async autocomplete(interaction) {
          await interaction.respond(
            autocompleteLanguages(String(interaction.options.getFocused())),
          );
        },
        async execute(interaction, context) {
          if (!interaction.isChatInputCommand()) {
            return undefined;
          }
          const t = getFixedT(context.locale);
          const language = resolveLanguage(
            interaction.options.getString("to", true),
          );
          if (language === undefined) {
            return {
              kind: "plain",
              content: t("translate.invalidLanguage"),
              ephemeral: true,
            };
          }

          const original = interaction.options.getString("text", true);
          // Acknowledge within Discord's three-second interaction window before the API call.
          await interaction.deferReply();
          const response = await completion.create({
            model: dependencies.env.openAITranslateModel,
            messages: [
              {
                role: "system",
                content:
                  "This is a direct translation task. " +
                  `Translate the following text to ${language.name}. ` +
                  "Do not add any additional comments or language indicators.",
              },
              { role: "user", content: original },
            ],
          });
          return translationReply(
            original,
            response.choices[0]?.message.content ?? "",
            language.name,
            context.locale,
          );
        },
      },
    ],
  };
}

function addSection(
  container: ContainerBuilder,
  files: AttachmentBuilder[],
  heading: string,
  content: string,
  filename: string,
): void {
  const rendered = textComponent(content, filename);
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`### ${heading}`),
  );
  if (rendered.component instanceof FileBuilder) {
    container.addFileComponents(rendered.component);
  } else {
    rendered.component.setContent(content.length === 0 ? "\u200b" : content);
    container.addTextDisplayComponents(rendered.component);
  }
  files.push(...rendered.files);
}

function translationReply(
  original: string,
  translated: string,
  languageName: string,
  locale: string,
): OutgoingReply {
  const t = getFixedT(locale);
  const container = new ContainerBuilder().setAccentColor(SUCCESS_ACCENT);
  const files: AttachmentBuilder[] = [];
  addSection(
    container,
    files,
    t("translate.originalHeading"),
    original,
    "original.txt",
  );
  addSection(
    container,
    files,
    t("translate.translatedHeading", { language: languageName }),
    translated,
    "translated.txt",
  );
  return { kind: "components-v2", components: [container], files };
}
