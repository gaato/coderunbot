import {
  type AttachmentBuilder,
  ContainerBuilder,
  FileBuilder,
  TextDisplayBuilder,
} from "discord.js";
import type { TFunction } from "i18next";
import {
  FAILURE_ACCENT,
  SUCCESS_ACCENT,
  textComponent,
} from "../../platform/discord/components.js";
import type { OutgoingReply } from "../../types.js";
import type { LanguageChoice, WandboxCompileResult } from "./wandbox.js";
import { normalizeLanguageKey, type WandboxError } from "./wandbox.js";

export interface PrefixRunInput {
  readonly languageKey: string;
  readonly code: string;
}

export function parsePrefixRunInput(args: string): PrefixRunInput {
  const input = args.trimStart();
  const separator = input.search(/\s/u);
  if (separator === -1) {
    return { languageKey: normalizeLanguageKey(input), code: "" };
  }
  return {
    languageKey: normalizeLanguageKey(input.slice(0, separator)),
    code: stripRunFences(input.slice(separator).trimStart()),
  };
}

export function stripRunFences(code: string): string {
  return code.replace(/^```.*$/gmu, "").trim();
}

function safeCodeBlock(text: string): string {
  return text.replaceAll("```", "`\u200b``");
}

function safeFilename(field: string): string {
  const safe = field.replace(/[^a-z0-9_-]/giu, "-");
  return `${safe.length === 0 ? "output" : safe}.txt`;
}

function addTextSection(
  container: ContainerBuilder,
  files: AttachmentBuilder[],
  heading: string,
  text: string,
  filename: string,
  language = "",
): void {
  const rendered = textComponent(text, filename);
  if (rendered.component instanceof FileBuilder) {
    container
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`### ${heading}`),
      )
      .addFileComponents(rendered.component);
  } else {
    rendered.component.setContent(
      `### ${heading}\n\`\`\`${language}\n${safeCodeBlock(text)}\n\`\`\``,
    );
    container.addTextDisplayComponents(rendered.component);
  }
  files.push(...rendered.files);
}

export function supportedLanguagesReply(
  choices: readonly LanguageChoice[],
  t: TFunction,
): OutgoingReply {
  const container = new ContainerBuilder().setAccentColor(FAILURE_ACCENT);
  const languages = choices.map(({ value }) => value).join(", ");
  const rendered = textComponent(languages, "supported-languages.txt");
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `### ${t("code.supportedLanguagesHeading")}`,
    ),
  );
  if (rendered.component instanceof FileBuilder) {
    container.addFileComponents(rendered.component);
  } else if (languages.length > 0) {
    container.addTextDisplayComponents(rendered.component);
  } else {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(t("code.noLanguagesAvailable")),
    );
  }
  return {
    kind: "components-v2",
    components: [container],
    files: rendered.files,
  };
}

export function runResultReply(
  compiler: string,
  languageKey: string,
  code: string,
  result: WandboxCompileResult,
  t: TFunction,
): OutgoingReply {
  const succeeded = result.status === "0";
  const container = new ContainerBuilder()
    .setAccentColor(succeeded ? SUCCESS_ACCENT : FAILURE_ACCENT)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${t("code.resultHeading", { compiler })}`,
      ),
    );
  const files: AttachmentBuilder[] = [];

  for (const [field, value] of Object.entries(result)) {
    if (
      value === undefined ||
      value === "" ||
      field === "program_message" ||
      field === "compiler_message"
    ) {
      continue;
    }
    addTextSection(container, files, field, value, safeFilename(field));
  }
  addTextSection(
    container,
    files,
    t("code.codeHeading"),
    code,
    "code.txt",
    languageKey,
  );

  return {
    kind: "components-v2",
    components: [container],
    files,
  };
}

export function wandboxErrorReply(
  error: WandboxError,
  t: TFunction,
): OutgoingReply {
  const description =
    error.code === "non_json"
      ? t("code.errors.nonJson")
      : error.code === "http" && "status" in error
        ? t("code.errors.http", { status: error.status })
        : t("code.errors.connection");
  const container = new ContainerBuilder()
    .setAccentColor(FAILURE_ACCENT)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### ${t("code.errors.heading")}\n${description}`,
      ),
    );

  if (error.code === "non_json" && "responseText" in error) {
    const preview = String(error.responseText).slice(0, 750);
    if (preview.length > 0) {
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `### ${t("code.errors.responsePreview")}\n\`\`\`\n${safeCodeBlock(preview)}\n\`\`\``,
        ),
      );
    }
  }
  return { kind: "components-v2", components: [container] };
}
