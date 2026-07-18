import "dotenv/config";

export type BotName = "coderunbot" | "gaato-bot";

export interface Env {
  readonly botName: BotName;
  readonly token: string;
  readonly tokenEnvName: "CODERUNBOT_TOKEN" | "GAATO_BOT_TOKEN";
  readonly logChannelId: string;
  readonly developerId: string;
  readonly supportServerLink: string;
}

const DEFAULT_LOG_CHANNEL_ID = "1118867011448078417";
const DEFAULT_DEVELOPER_ID = "572432137035317249";
const DEFAULT_SUPPORT_SERVER_LINK = "discord.gg/qRpYRTgvXM";

function nonEmpty(value: string | undefined): string | undefined {
  return value === undefined || value.length === 0 ? undefined : value;
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const gaatoBot = nonEmpty(source.GAATO_BOT) !== undefined;
  const tokenEnvName = gaatoBot ? "GAATO_BOT_TOKEN" : "CODERUNBOT_TOKEN";
  const token = nonEmpty(source[tokenEnvName]);

  if (token === undefined) {
    throw new Error(`${tokenEnvName} must be set to a non-empty value`);
  }

  return {
    botName: gaatoBot ? "gaato-bot" : "coderunbot",
    token,
    tokenEnvName,
    logChannelId: nonEmpty(source.LOG_CHANNEL_ID) ?? DEFAULT_LOG_CHANNEL_ID,
    developerId: nonEmpty(source.DEVELOPER_ID) ?? DEFAULT_DEVELOPER_ID,
    supportServerLink:
      nonEmpty(source.SUPPORT_SERVER_LINK) ?? DEFAULT_SUPPORT_SERVER_LINK,
  };
}
