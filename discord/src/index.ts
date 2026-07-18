/**
 * Composes the selected bot profile, shared services, features, and Discord platform router.
 * This is the application's single composition root.
 */
import { Client, GatewayIntentBits, Partials, REST } from "discord.js";
import { getBotProfile } from "./config.js";
import { loadEnv } from "./env.js";
import { createCodeFeature } from "./features/code/index.js";
import { createMiscFeature } from "./features/misc/index.js";
import { createPingFeature } from "./features/ping/index.js";
import { createPrivacyFeature } from "./features/privacy/index.js";
import { createTexFeature } from "./features/tex/index.js";
import { createTranslateFeature } from "./features/translate/index.js";
import { createWolframFeature } from "./features/wolfram/index.js";
import { ErrorPresenter } from "./platform/discord/errorPresenter.js";
import { ReplyCoordinator } from "./platform/discord/replyCoordinator.js";
import { DiscordRouter } from "./platform/discord/router.js";
import { getFixedT } from "./shared/i18n.js";
import { createLogger } from "./shared/logger.js";
import {
  LocalFileState,
  OptOutUsers,
  S3ObjectState,
  type StateBackend,
} from "./shared/state.js";
import { UsageStats } from "./shared/usageStats.js";
import type { Feature, FeatureFactory, FeatureId } from "./types.js";

const featureFactories: Record<FeatureId, FeatureFactory> = {
  tex: createTexFeature,
  code: createCodeFeature,
  privacy: createPrivacyFeature,
  wolfram: createWolframFeature,
  misc: createMiscFeature,
  translate: createTranslateFeature,
  ping: createPingFeature,
};

export async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const profile = getBotProfile(env.botName);
  const logger = createLogger();
  getFixedT(profile.defaultLocale);

  let stateBackend: StateBackend;
  let usageStatsBackend: StateBackend;
  if (env.state.backend === "local") {
    stateBackend = new LocalFileState(env.state.filePath);
    usageStatsBackend = new LocalFileState(env.state.usageStatsFilePath);
  } else {
    stateBackend = new S3ObjectState({
      endpoint: env.state.endpoint,
      region: env.state.region,
      bucket: env.state.bucket,
      key: env.state.key,
      credentials: {
        accessKeyId: env.state.accessKeyId,
        secretAccessKey: env.state.secretAccessKey,
      },
    });
    usageStatsBackend = new S3ObjectState({
      endpoint: env.state.endpoint,
      region: env.state.region,
      bucket: env.state.bucket,
      key: env.state.usageStatsKey,
      credentials: {
        accessKeyId: env.state.accessKeyId,
        secretAccessKey: env.state.secretAccessKey,
      },
    });
  }
  const optOutUsers = new OptOutUsers(stateBackend);
  await optOutUsers.init();
  const usageStats = new UsageStats(usageStatsBackend, { logger });
  await usageStats.init();
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel, Partials.Message],
  });
  let shuttingDown = false;
  const shutdown = async (): Promise<void> => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    try {
      await usageStats.dispose();
    } catch (error) {
      logger.error({ error }, "Failed to flush usage statistics on shutdown");
    }
    // destroy() is async in discord.js v14; await it so the gateway close frame is sent.
    await client.destroy().catch(() => undefined);
    process.exit(0);
  };
  process.once("SIGTERM", () => {
    void shutdown();
  });
  process.once("SIGINT", () => {
    void shutdown();
  });

  const featureDependencies = {
    optOutUsers,
    usageStats,
    logger,
    env,
    client,
  };
  if (env.botName === "gaato-bot") {
    if (env.wolframAppId === undefined) {
      logger.warn(
        { envName: "WOLFRAM_APPID", feature: "wolfram" },
        "gaato-bot feature disabled because an environment variable is missing",
      );
    }
    if (env.openAIApiKey === undefined) {
      logger.warn(
        {
          envName: "OPENAI_API_KEY",
          features: ["misc", "translate"],
        },
        "gaato-bot features disabled because an environment variable is missing",
      );
    }
  }
  const rest = new REST({ version: "10" }).setToken(env.token);
  const features = [
    ...profile.features.map((id) => featureFactories[id](featureDependencies)),
    featureFactories.ping(featureDependencies),
  ].filter((feature): feature is Feature => feature !== undefined);

  for (const feature of features) {
    await feature.init?.();
  }

  const replyCoordinator = new ReplyCoordinator(100);
  const errorPresenter = new ErrorPresenter({
    client,
    logger,
    logChannelId: env.logChannelId,
    supportServerLink: env.supportServerLink,
  });
  const router = new DiscordRouter({
    client,
    rest,
    profile,
    features,
    replyCoordinator,
    errorPresenter,
    logger,
    usageStats,
    messageGate: (message) => !optOutUsers.has(message.author.id),
  });
  router.bind();

  try {
    await client.login(env.token);
  } catch (error) {
    logger.error(
      { error, tokenEnvName: env.tokenEnvName },
      "Discord login failed",
    );
    throw error;
  }
}

await bootstrap();
