/**
 * Builds reusable Discord Components V2 presentation primitives for the platform layer.
 */
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  FileBuilder,
  TextDisplayBuilder,
} from "discord.js";

export const SUCCESS_ACCENT = 0x2ecc71;
export const FAILURE_ACCENT = 0xe74c3c;
export const TEXT_FILE_CHARACTER_LIMIT = 1_000;
export const TEXT_FILE_LINE_LIMIT = 100;

export function successContainer(text: string): ContainerBuilder {
  return new ContainerBuilder()
    .setAccentColor(SUCCESS_ACCENT)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(text));
}

export function failureContainer(text: string): ContainerBuilder {
  return new ContainerBuilder()
    .setAccentColor(FAILURE_ACCENT)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(text));
}

export function deleteButton(userId: string): ButtonBuilder {
  return new ButtonBuilder()
    .setCustomId(`delete:${userId}`)
    .setLabel("Delete")
    .setStyle(ButtonStyle.Danger);
}

export function deleteButtonRow(
  userId: string,
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    deleteButton(userId),
  );
}

export interface TextComponentResult {
  readonly component: TextDisplayBuilder | FileBuilder;
  readonly files: readonly AttachmentBuilder[];
  readonly isFile: boolean;
}

export function textComponent(
  text: string,
  filename = "output.txt",
): TextComponentResult {
  const lineCount = text.length === 0 ? 0 : text.split("\n").length;
  // Components V2 caps total text at 4,000 characters, so >1,000 chars or >100 lines use a file.
  if (
    text.length > TEXT_FILE_CHARACTER_LIMIT ||
    lineCount > TEXT_FILE_LINE_LIMIT
  ) {
    return {
      component: new FileBuilder().setURL(`attachment://${filename}`),
      files: [new AttachmentBuilder(Buffer.from(text), { name: filename })],
      isFile: true,
    };
  }

  return {
    component: new TextDisplayBuilder().setContent(text),
    files: [],
    isFile: false,
  };
}
