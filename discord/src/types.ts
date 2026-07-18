/**
 * Defines contracts shared across features, platform code, and the composition root.
 */
import type {
  AutocompleteInteraction,
  BaseMessageOptions,
  ButtonInteraction,
  ChatInputCommandInteraction,
  ContextMenuCommandBuilder,
  ContextMenuCommandInteraction,
  Message,
  ModalSubmitInteraction,
  SlashCommandBuilder,
} from "discord.js";
import type { Env } from "./env.js";
import type { RequestContext } from "./platform/discord/context.js";
import type { AppLogger } from "./shared/logger.js";
import type { OptOutUsers } from "./shared/state.js";

export type FeatureId =
  | "tex"
  | "code"
  | "privacy"
  | "wolfram"
  | "misc"
  | "translate"
  | "ping";

type HandlerResult = Promise<OutgoingReply | undefined>;

export interface SlashCommand {
  readonly data: SlashCommandBuilder | ContextMenuCommandBuilder;
  execute(
    interaction: ChatInputCommandInteraction | ContextMenuCommandInteraction,
    context: RequestContext,
  ): HandlerResult;
  autocomplete?(interaction: AutocompleteInteraction): Promise<void>;
}

export interface PrefixCommand {
  readonly name: string;
  readonly aliases?: readonly string[];
  execute(
    message: Message,
    args: string,
    context: RequestContext,
  ): HandlerResult;
}

export type ModalHandler = (
  interaction: ModalSubmitInteraction,
  context: RequestContext,
) => HandlerResult;

export type ComponentHandler = (
  interaction: ButtonInteraction,
  context: RequestContext,
) => HandlerResult;

export interface Feature {
  readonly id: FeatureId;
  readonly slashCommands?: readonly SlashCommand[];
  readonly prefixCommands?: readonly PrefixCommand[];
  readonly modalHandlers?: Readonly<Record<string, ModalHandler>>;
  readonly componentHandlers?: Readonly<Record<string, ComponentHandler>>;
  onMessage?(message: Message, context: RequestContext): HandlerResult;
  init?(): Promise<void>;
}

export interface FeatureDependencies {
  readonly optOutUsers: OptOutUsers;
  readonly logger: AppLogger;
  readonly env: Env;
  readonly client: import("discord.js").Client;
}

export type FeatureFactory = (
  dependencies: FeatureDependencies,
) => Feature | undefined;

interface ReplyBase {
  readonly files?: BaseMessageOptions["files"];
  readonly ephemeral?: boolean;
  readonly onDelivered?: (message: Message) => void | Promise<void>;
}

export interface ComponentsV2Reply extends ReplyBase {
  readonly kind: "components-v2";
  readonly components: NonNullable<BaseMessageOptions["components"]>;
}

export interface PlainContentReply extends ReplyBase {
  readonly kind: "plain";
  readonly content: string;
}

export type OutgoingReply = ComponentsV2Reply | PlainContentReply;
