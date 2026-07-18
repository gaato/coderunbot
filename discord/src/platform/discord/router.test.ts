/**
 * Tests startup route validation, prefix parsing, and anonymous dispatch instrumentation.
 */
import {
  type Client,
  Events,
  type REST,
  SlashCommandBuilder,
} from "discord.js";
import { describe, expect, it, vi } from "vitest";
import type { BotProfile } from "../../config.js";
import type { AppLogger } from "../../shared/logger.js";
import type { UsageStats } from "../../shared/usageStats.js";
import type { Feature } from "../../types.js";
import type { ErrorPresenter } from "./errorPresenter.js";
import type { ReplyCoordinator } from "./replyCoordinator.js";
import {
  buildRouteRegistry,
  DiscordRouter,
  parsePrefixCommand,
} from "./router.js";

describe("buildRouteRegistry", () => {
  it("fails fast when customId namespaces overlap across handler kinds", () => {
    const modalFeature: Feature = {
      id: "code",
      modalHandlers: {
        shared: async () => undefined,
      },
    };
    const componentFeature: Feature = {
      id: "tex",
      componentHandlers: {
        shared: async () => undefined,
      },
    };

    expect(() => buildRouteRegistry([modalFeature, componentFeature])).toThrow(
      "duplicate customId namespace route: shared",
    );
  });

  it("rejects central and collector-owned namespaces", () => {
    const feature: Feature = {
      id: "code",
      componentHandlers: {
        pg: async () => undefined,
      },
    };

    expect(() => buildRouteRegistry([feature])).toThrow(
      "customId namespace is reserved: pg",
    );
  });
});

describe("parsePrefixCommand", () => {
  it("preserves the raw rest argument after one separator", () => {
    expect(parsePrefixCommand("]run  python\nprint(1)", "]")).toEqual({
      name: "run",
      args: " python\nprint(1)",
    });
  });
});

describe("DiscordRouter usage statistics", () => {
  it("records successful slash, prefix, modal, and button dispatches", async () => {
    const slashExecute = vi.fn().mockResolvedValue(undefined);
    const prefixExecute = vi.fn().mockResolvedValue(undefined);
    const modalHandler = vi.fn().mockResolvedValue(undefined);
    const buttonHandler = vi.fn().mockResolvedValue(undefined);
    const feature: Feature = {
      id: "code",
      slashCommands: [
        {
          data: new SlashCommandBuilder()
            .setName("test")
            .setDescription("Test command"),
          execute: slashExecute,
        },
      ],
      prefixCommands: [
        {
          name: "run",
          aliases: ["r"],
          execute: prefixExecute,
        },
      ],
      modalHandlers: { form: modalHandler },
      componentHandlers: { action: buttonHandler },
    };
    const harness = createHarness([feature]);

    harness.dispatch(
      Events.InteractionCreate,
      interaction({
        commandName: "test",
        isChatInputCommand: () => true,
        toString: () => "/test",
      }),
    );
    await waitForCalls(harness.recordCommand, 1);

    harness.dispatch(Events.MessageCreate, {
      id: "message",
      content: "]r python print(1)",
      author: { id: "user", bot: false },
      guild: null,
      inGuild: () => false,
      channel: { sendTyping: vi.fn().mockResolvedValue(undefined) },
    });
    await waitForCalls(harness.recordCommand, 2);

    harness.dispatch(
      Events.InteractionCreate,
      interaction({
        customId: "form:value",
        isModalSubmit: () => true,
      }),
    );
    await waitForCalls(harness.recordCommand, 3);

    harness.dispatch(
      Events.InteractionCreate,
      interaction({
        customId: "action:value",
        isButton: () => true,
      }),
    );
    await waitForCalls(harness.recordCommand, 4);

    expect(harness.recordCommand.mock.calls).toEqual([
      ["slash", "test", "ok"],
      ["prefix", "run", "ok"],
      ["modal", "form", "ok"],
      ["button", "action", "ok"],
    ]);
  });

  it("records a slash handler failure even when the error is presented", async () => {
    const error = new Error("handler failed");
    const feature: Feature = {
      id: "code",
      slashCommands: [
        {
          data: new SlashCommandBuilder()
            .setName("test")
            .setDescription("Test command"),
          execute: vi.fn().mockRejectedValue(error),
        },
      ],
    };
    const harness = createHarness([feature]);

    harness.dispatch(
      Events.InteractionCreate,
      interaction({
        commandName: "test",
        isChatInputCommand: () => true,
        toString: () => "/test",
      }),
    );

    await vi.waitFor(() => {
      expect(harness.presentError).toHaveBeenCalledOnce();
      expect(harness.deliver).toHaveBeenCalledOnce();
    });
    expect(harness.recordCommand).toHaveBeenCalledOnce();
    expect(harness.recordCommand).toHaveBeenCalledWith(
      "slash",
      "test",
      "error",
    );
  });

  it("does not record reserved delete or pagination buttons", async () => {
    const harness = createHarness([]);
    const deleteMessage = vi.fn().mockResolvedValue(undefined);
    const deferUpdate = vi.fn().mockResolvedValue(undefined);

    harness.dispatch(
      Events.InteractionCreate,
      interaction({
        customId: "pg:next",
        isButton: () => true,
      }),
    );
    harness.dispatch(
      Events.InteractionCreate,
      interaction({
        customId: "delete:user",
        isButton: () => true,
        deferUpdate,
        message: { delete: deleteMessage },
      }),
    );

    await vi.waitFor(() => expect(deleteMessage).toHaveBeenCalledOnce());
    expect(deferUpdate).toHaveBeenCalledOnce();
    expect(harness.recordCommand).not.toHaveBeenCalled();
  });

  it("records guild counts on ready, join, and leave events", async () => {
    const harness = createHarness([]);
    harness.guildCache.set("one", {});
    harness.guildCache.set("two", {});

    harness.dispatch(Events.ClientReady, harness.client);
    await vi.waitFor(() => expect(harness.put).toHaveBeenCalledOnce());
    harness.guildCache.set("three", {});
    harness.dispatch(Events.GuildCreate, {});
    harness.guildCache.delete("three");
    harness.dispatch(Events.GuildDelete, {});

    expect(harness.recordGuildCount.mock.calls).toEqual([[2], [3], [2]]);
  });
});

type Listener = (...args: never[]) => void;

function createHarness(features: readonly Feature[]) {
  const listeners = new Map<string, Listener>();
  const guildCache = new Map<string, unknown>();
  const client = {
    application: { id: "application" },
    guilds: { cache: guildCache },
    once: vi.fn((event: string, listener: Listener) => {
      listeners.set(event, listener);
    }),
    on: vi.fn((event: string, listener: Listener) => {
      listeners.set(event, listener);
    }),
  };
  const put = vi.fn().mockResolvedValue(undefined);
  const deliver = vi.fn().mockResolvedValue("sent");
  const presentError = vi.fn().mockResolvedValue({
    kind: "plain",
    content: "error",
  });
  const recordCommand = vi.fn();
  const recordGuildCount = vi.fn();
  const profile: BotProfile = {
    name: "coderunbot",
    prefix: "]",
    defaultLocale: "en",
    features: [],
  };
  const router = new DiscordRouter({
    client: client as unknown as Client,
    rest: { put } as unknown as REST,
    profile,
    features,
    replyCoordinator: {
      begin: vi.fn().mockReturnValue(1),
      deliver,
      deleteReplies: vi.fn().mockResolvedValue(undefined),
    } as unknown as ReplyCoordinator,
    errorPresenter: { present: presentError } as unknown as ErrorPresenter,
    logger: {
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as unknown as AppLogger,
    usageStats: {
      recordCommand,
      recordGuildCount,
    } as unknown as UsageStats,
  });
  router.bind();

  return {
    client,
    deliver,
    dispatch(event: string, ...args: unknown[]) {
      const listener = listeners.get(event);
      if (listener === undefined) {
        throw new Error(`event is not bound: ${event}`);
      }
      listener(...(args as never[]));
    },
    guildCache,
    presentError,
    put,
    recordCommand,
    recordGuildCount,
  };
}

function interaction(overrides: Record<string, unknown>): unknown {
  return {
    user: { id: "user" },
    locale: "en-US",
    guild: null,
    deferred: false,
    replied: false,
    inGuild: () => false,
    isAutocomplete: () => false,
    isChatInputCommand: () => false,
    isContextMenuCommand: () => false,
    isButton: () => false,
    isModalSubmit: () => false,
    toString: () => "interaction",
    ...overrides,
  };
}

async function waitForCalls(mock: ReturnType<typeof vi.fn>, count: number) {
  await vi.waitFor(() => expect(mock).toHaveBeenCalledTimes(count));
}
