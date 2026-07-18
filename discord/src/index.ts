import { Client, GatewayIntentBits, Partials, REST } from "discord.js";
import { getBotProfile } from "./config.js";
import { loadEnv } from "./env.js";
import { createPingFeature } from "./features/ping/index.js";
import { createPrivacyFeature } from "./features/privacy/index.js";
import { createTexFeature } from "./features/tex/index.js";
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
import type { FeatureFactory, FeatureId } from "./types.js";

function pendingFeature(id: FeatureId): FeatureFactory {
  return (_dependencies) => ({ id });
}

// This is the only FeatureId -> concrete factory mapping. The no-op entries are
// replaced by real factories in subsequent migration steps.
const featureFactories: Record<FeatureId, FeatureFactory> = {
  tex: createTexFeature,
  code: pendingFeature("code"),
  privacy: createPrivacyFeature,
  wolfram: pendingFeature("wolfram"),
  misc: pendingFeature("misc"),
  translate: pendingFeature("translate"),
  ping: createPingFeature,
};

export async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const profile = getBotProfile(env.botName);
  const logger = createLogger();
  getFixedT(profile.defaultLocale);

  let stateBackend: StateBackend;
  if (env.state.backend === "local") {
    stateBackend = new LocalFileState(env.state.filePath);
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
  }
  const optOutUsers = new OptOutUsers(stateBackend);
  await optOutUsers.init();
  const featureDependencies = { optOutUsers };

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel, Partials.Message],
  });
  const rest = new REST({ version: "10" }).setToken(env.token);
  const features = [
    ...profile.features.map((id) => featureFactories[id](featureDependencies)),
    featureFactories.ping(featureDependencies),
  ];

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
