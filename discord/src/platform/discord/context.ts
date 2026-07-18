import type {
  ButtonInteraction,
  ChatInputCommandInteraction,
  ContextMenuCommandInteraction,
  Message,
  ModalSubmitInteraction,
} from "discord.js";

export type ReplyTarget =
  | Message
  | ChatInputCommandInteraction
  | ContextMenuCommandInteraction
  | ButtonInteraction
  | ModalSubmitInteraction;

export interface RequestContext {
  readonly userId: string;
  readonly locale: string;
  readonly inGuild: boolean;
  readonly replyTarget: ReplyTarget;
}

type RequestInteraction = Exclude<ReplyTarget, Message>;

export function contextForInteraction(
  interaction: RequestInteraction,
  defaultLocale: string,
): RequestContext {
  return {
    userId: interaction.user.id,
    locale:
      interaction.locale || interaction.guild?.preferredLocale || defaultLocale,
    inGuild: interaction.inGuild(),
    replyTarget: interaction,
  };
}

export function contextForMessage(
  message: Message,
  defaultLocale: string,
): RequestContext {
  return {
    userId: message.author.id,
    locale: message.guild?.preferredLocale ?? defaultLocale,
    inGuild: message.inGuild(),
    replyTarget: message,
  };
}
