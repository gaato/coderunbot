import "dotenv/config";

import { Client, Events, GatewayIntentBits, Partials } from "discord.js";
import pino from "pino";

const logger = pino();
const isGaatoBot = process.env.GAATO_BOT !== undefined;
const tokenName = isGaatoBot ? "GAATO_BOT_TOKEN" : "CODERUNBOT_TOKEN";
const token = process.env[tokenName];

if (!token) {
  logger.error({ tokenName }, "Discord bot token is not configured");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel, Partials.Message],
});

client.once(Events.ClientReady, (readyClient) => {
  logger.info(
    {
      tag: readyClient.user.tag,
      botName: readyClient.user.username,
    },
    "Discord bot logged in",
  );
});

try {
  await client.login(token);
} catch (error) {
  logger.error({ error }, "Discord bot login failed");
  process.exit(1);
}
