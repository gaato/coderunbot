/**
 * Registers feature routes and dispatches Discord events in the platform layer.
 */
import {
  ApplicationIntegrationType,
  type AutocompleteInteraction,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Client,
  type ContextMenuCommandInteraction,
  Events,
  type Interaction,
  InteractionContextType,
  type Message,
  type ModalSubmitInteraction,
  type PartialMessage,
  type REST,
  Routes,
} from "discord.js";
import type { BotProfile } from "../../config.js";
import type { AppLogger } from "../../shared/logger.js";
import type {
  ComponentHandler,
  Feature,
  FeatureId,
  ModalHandler,
  PrefixCommand,
  SlashCommand,
} from "../../types.js";
import {
  contextForInteraction,
  contextForMessage,
  type RequestContext,
} from "./context.js";
import type { ErrorPresenter } from "./errorPresenter.js";
import type { ReplyCoordinator } from "./replyCoordinator.js";

interface RegisteredSlash {
  readonly featureId: FeatureId;
  readonly command: SlashCommand;
}

interface RegisteredPrefix {
  readonly featureId: FeatureId;
  readonly command: PrefixCommand;
}

type CustomRoute =
  | {
      readonly kind: "modal";
      readonly featureId: FeatureId;
      readonly handler: ModalHandler;
    }
  | {
      readonly kind: "component";
      readonly featureId: FeatureId;
      readonly handler: ComponentHandler;
    };

export interface RouteRegistry {
  readonly slash: ReadonlyMap<string, RegisteredSlash>;
  readonly prefix: ReadonlyMap<string, RegisteredPrefix>;
  readonly custom: ReadonlyMap<string, CustomRoute>;
}

function addUnique<Value>(
  map: Map<string, Value>,
  route: string,
  value: Value,
  routeType: string,
): void {
  // Registry construction happens in the router constructor, so duplicates fail at startup.
  if (map.has(route)) {
    throw new Error(`duplicate ${routeType} route: ${route}`);
  }
  map.set(route, value);
}

export function buildRouteRegistry(
  features: readonly Feature[],
): RouteRegistry {
  const slash = new Map<string, RegisteredSlash>();
  const prefix = new Map<string, RegisteredPrefix>();
  // customIds use namespace:...; the first colon-delimited segment selects the route.
  const custom = new Map<string, CustomRoute>();
  const featureIds = new Set<FeatureId>();

  for (const feature of features) {
    if (featureIds.has(feature.id)) {
      throw new Error(`duplicate feature id: ${feature.id}`);
    }
    featureIds.add(feature.id);

    for (const command of feature.slashCommands ?? []) {
      addUnique(
        slash,
        command.data.name,
        { featureId: feature.id, command },
        "application command",
      );
    }

    for (const command of feature.prefixCommands ?? []) {
      for (const name of [command.name, ...(command.aliases ?? [])]) {
        addUnique(
          prefix,
          name.toLowerCase(),
          { featureId: feature.id, command },
          "prefix command",
        );
      }
    }

    for (const [namespace, handler] of Object.entries(
      feature.modalHandlers ?? {},
    )) {
      addUnique(
        custom,
        namespace,
        { kind: "modal", featureId: feature.id, handler },
        "customId namespace",
      );
    }

    for (const [namespace, handler] of Object.entries(
      feature.componentHandlers ?? {},
    )) {
      addUnique(
        custom,
        namespace,
        { kind: "component", featureId: feature.id, handler },
        "customId namespace",
      );
    }
  }

  // Delete handling and collector-based pagination own these platform namespaces.
  for (const reserved of ["delete", "pg"]) {
    if (custom.has(reserved)) {
      throw new Error(`customId namespace is reserved: ${reserved}`);
    }
  }

  return { slash, prefix, custom };
}

export interface ParsedPrefixCommand {
  readonly name: string;
  readonly args: string;
}

export function parsePrefixCommand(
  content: string,
  prefix: string,
): ParsedPrefixCommand | undefined {
  if (!content.startsWith(prefix)) {
    return undefined;
  }

  const input = content.slice(prefix.length);
  const separator = input.search(/\s/u);
  const name = (
    separator === -1 ? input : input.slice(0, separator)
  ).toLowerCase();
  if (name.length === 0) {
    return undefined;
  }

  return {
    name,
    // Remove only the command separator. The rest remains byte-for-byte intact.
    args: separator === -1 ? "" : input.slice(separator + 1),
  };
}

export type MessageGate = (message: Message) => boolean | Promise<boolean>;

export interface DiscordRouterOptions {
  readonly client: Client;
  readonly rest: REST;
  readonly profile: BotProfile;
  readonly features: readonly Feature[];
  readonly replyCoordinator: ReplyCoordinator;
  readonly errorPresenter: ErrorPresenter;
  readonly logger: AppLogger;
  readonly messageGate?: MessageGate;
}

export class DiscordRouter {
  readonly #client: Client;
  readonly #rest: REST;
  readonly #profile: BotProfile;
  readonly #features: readonly Feature[];
  readonly #routes: RouteRegistry;
  readonly #replyCoordinator: ReplyCoordinator;
  readonly #errorPresenter: ErrorPresenter;
  readonly #logger: AppLogger;
  readonly #messageGate: MessageGate;

  constructor(options: DiscordRouterOptions) {
    this.#client = options.client;
    this.#rest = options.rest;
    this.#profile = options.profile;
    this.#features = options.features;
    this.#routes = buildRouteRegistry(options.features);
    this.#replyCoordinator = options.replyCoordinator;
    this.#errorPresenter = options.errorPresenter;
    this.#logger = options.logger;
    this.#messageGate = options.messageGate ?? (() => true);
  }

  bind(): void {
    this.#client.once(Events.ClientReady, (client) => {
      void this.#onReady(client);
    });
    this.#client.on(Events.InteractionCreate, (interaction) => {
      void this.#onInteraction(interaction);
    });
    this.#client.on(Events.MessageCreate, (message) => {
      void this.#onMessage(message);
    });
    this.#client.on(Events.MessageUpdate, (before, after) => {
      void this.#onMessageUpdate(before, after);
    });
    this.#client.on(Events.MessageDelete, (message) => {
      void this.#replyCoordinator.deleteReplies(message.id);
    });
  }

  async #onReady(client: Client<true>): Promise<void> {
    const body = [...this.#routes.slash.values()].map(({ command }) => ({
      ...command.data.toJSON(),
      // User-installable apps require both install types and all supported invocation contexts.
      integration_types: [
        ApplicationIntegrationType.GuildInstall,
        ApplicationIntegrationType.UserInstall,
      ],
      contexts: [
        InteractionContextType.Guild,
        InteractionContextType.BotDM,
        InteractionContextType.PrivateChannel,
      ],
    }));

    try {
      // ClientReady provides the application ID; REST.put bulk-overwrites commands idempotently.
      await this.#rest.put(Routes.applicationCommands(client.application.id), {
        body,
      });
      this.#logger.info(
        { commandCount: body.length, bot: this.#profile.name },
        "Registered Discord application commands",
      );
    } catch (error) {
      this.#logger.error({ error }, "Failed to register application commands");
    }
  }

  async #onInteraction(interaction: Interaction): Promise<void> {
    if (interaction.isAutocomplete()) {
      await this.#onAutocomplete(interaction);
      return;
    }

    if (
      interaction.isChatInputCommand() ||
      interaction.isContextMenuCommand()
    ) {
      await this.#onApplicationCommand(interaction);
      return;
    }

    if (interaction.isButton()) {
      await this.#onButton(interaction);
      return;
    }

    if (interaction.isModalSubmit()) {
      await this.#onModal(interaction);
    }
  }

  async #onApplicationCommand(
    interaction: ChatInputCommandInteraction | ContextMenuCommandInteraction,
  ): Promise<void> {
    const route = this.#routes.slash.get(interaction.commandName);
    if (route === undefined) {
      return;
    }
    const context = contextForInteraction(
      interaction,
      this.#profile.defaultLocale,
    );
    await this.#invoke(route.featureId, context, interaction.toString(), () =>
      route.command.execute(interaction, context),
    );
  }

  async #onAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
    const route = this.#routes.slash.get(interaction.commandName);
    if (route?.command.autocomplete === undefined) {
      return;
    }

    try {
      await route.command.autocomplete(interaction);
    } catch (error) {
      const context = contextForInteraction(
        interaction as unknown as ChatInputCommandInteraction,
        this.#profile.defaultLocale,
      );
      await this.#errorPresenter.present(
        error,
        context,
        interaction.toString(),
      );
      if (!interaction.responded) {
        await interaction.respond([]);
      }
    }
  }

  async #onButton(interaction: ButtonInteraction): Promise<void> {
    const namespace = interaction.customId.split(":", 1)[0] ?? "";
    if (namespace === "pg") {
      return;
    }
    if (namespace === "delete") {
      const ownerId = interaction.customId.slice("delete:".length);
      if (ownerId === interaction.user.id) {
        await interaction.deferUpdate();
        await interaction.message.delete();
      } else if (!interaction.deferred && !interaction.replied) {
        await interaction.deferUpdate();
      }
      return;
    }

    const route = this.#routes.custom.get(namespace);
    if (route?.kind !== "component") {
      return;
    }
    const context = contextForInteraction(
      interaction,
      this.#profile.defaultLocale,
    );
    await this.#invoke(route.featureId, context, interaction.customId, () =>
      route.handler(interaction, context),
    );
  }

  async #onModal(interaction: ModalSubmitInteraction): Promise<void> {
    const namespace = interaction.customId.split(":", 1)[0] ?? "";
    const route = this.#routes.custom.get(namespace);
    if (route?.kind !== "modal") {
      return;
    }
    const context = contextForInteraction(
      interaction,
      this.#profile.defaultLocale,
    );
    await this.#invoke(route.featureId, context, interaction.customId, () =>
      route.handler(interaction, context),
    );
  }

  async #onMessage(message: Message): Promise<void> {
    if (message.author.bot || !(await this.#messageGate(message))) {
      return;
    }

    const context = contextForMessage(message, this.#profile.defaultLocale);
    const handledFeatures = new Set<FeatureId>();
    const parsed = parsePrefixCommand(message.content, this.#profile.prefix);
    const prefixRoute = parsed && this.#routes.prefix.get(parsed.name);

    if (prefixRoute !== undefined && parsed !== undefined) {
      handledFeatures.add(prefixRoute.featureId);
      try {
        // Messages have no defer API; typing gives feedback while interactions must
        // acknowledge within three seconds.
        if ("sendTyping" in message.channel) {
          await message.channel.sendTyping();
        }
      } catch (error) {
        this.#logger.debug({ error }, "Unable to send typing indicator");
      }
      await this.#invokeMessage(
        prefixRoute.featureId,
        context,
        message.content,
        () => prefixRoute.command.execute(message, parsed.args, context),
      );
    }

    for (const feature of this.#features) {
      if (feature.onMessage === undefined || handledFeatures.has(feature.id)) {
        continue;
      }
      const onMessage = feature.onMessage;
      await this.#invokeMessage(feature.id, context, message.content, () =>
        onMessage(message, context),
      );
    }
  }

  async #onMessageUpdate(
    before: Message | PartialMessage,
    after: Message | PartialMessage,
  ): Promise<void> {
    if (before.partial || after.partial || before.content === after.content) {
      return;
    }
    await this.#onMessage(after);
  }

  async #invokeMessage(
    featureId: FeatureId,
    context: RequestContext,
    invocation: string,
    handler: () => ReturnType<PrefixCommand["execute"]>,
  ): Promise<void> {
    const sourceMessageId = (context.replyTarget as Message).id;
    const generation = this.#replyCoordinator.begin(featureId, sourceMessageId);
    await this.#invoke(featureId, context, invocation, handler, {
      sourceMessageId,
      generation,
    });
  }

  async #invoke(
    featureId: FeatureId,
    context: RequestContext,
    invocation: string,
    handler: () => ReturnType<PrefixCommand["execute"]>,
    tracking?: {
      readonly sourceMessageId: string;
      readonly generation: number;
    },
  ): Promise<void> {
    try {
      const outgoing = await handler();
      if (outgoing === undefined) {
        return;
      }
      await this.#replyCoordinator.deliver({
        featureId,
        target: context.replyTarget,
        userId: context.userId,
        outgoing,
        ...tracking,
      });
    } catch (error) {
      try {
        const outgoing = await this.#errorPresenter.present(
          error,
          context,
          invocation,
        );
        await this.#replyCoordinator.deliver({
          featureId,
          target: context.replyTarget,
          userId: context.userId,
          outgoing,
          ...tracking,
        });
      } catch (presentationError) {
        this.#logger.error(
          { error: presentationError, originalError: error },
          "Failed to present handler error",
        );
      }
    }
  }
}
