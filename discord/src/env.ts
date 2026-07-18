/**
 * Loads and validates process configuration at the application's environment boundary.
 * No other source file reads process.env, as enforced by Biome's noProcessEnv rule.
 */
import "dotenv/config";

export type BotName = "coderunbot" | "gaato-bot";

export interface LocalStateEnv {
  readonly backend: "local";
  readonly filePath: "data/opt-out-users.txt";
}

export interface S3StateEnv {
  readonly backend: "s3";
  readonly endpoint: string;
  readonly region: string;
  readonly bucket: string;
  readonly key: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
}

export type StateEnv = LocalStateEnv | S3StateEnv;

export interface Env {
  readonly botName: BotName;
  readonly token: string;
  readonly tokenEnvName: "CODERUNBOT_TOKEN" | "GAATO_BOT_TOKEN";
  readonly logChannelId: string;
  readonly developerId: string;
  readonly supportServerLink: string;
  readonly wolframAppId?: string;
  readonly openAIApiKey?: string;
  readonly openAIChatModel: string;
  readonly openAIChatModelLite: string;
  readonly openAITranslateModel: string;
  readonly state: StateEnv;
}

const DEFAULT_LOG_CHANNEL_ID = "1118867011448078417";
const DEFAULT_DEVELOPER_ID = "572432137035317249";
const DEFAULT_SUPPORT_SERVER_LINK = "discord.gg/qRpYRTgvXM";
const DEFAULT_OPENAI_CHAT_MODEL = "gpt-5.2";
const DEFAULT_OPENAI_CHAT_MODEL_LITE = "gpt-5-mini";
const DEFAULT_OPENAI_TRANSLATE_MODEL = "gpt-5-mini";

function nonEmpty(value: string | undefined): string | undefined {
  // Empty strings count as unset, matching the Python bot's truthiness check for GAATO_BOT.
  return value === undefined || value.trim().length === 0 ? undefined : value;
}

function loadStateEnv(source: NodeJS.ProcessEnv): StateEnv {
  const backend = nonEmpty(source.BOT_STATE_BACKEND) ?? "local";
  if (backend === "local") {
    return { backend, filePath: "data/opt-out-users.txt" };
  }
  if (backend !== "s3") {
    throw new Error('BOT_STATE_BACKEND must be either "local" or "s3"');
  }

  const required = {
    S3_ENDPOINT: nonEmpty(source.S3_ENDPOINT),
    S3_REGION: nonEmpty(source.S3_REGION),
    S3_BUCKET: nonEmpty(source.S3_BUCKET),
    S3_ACCESS_KEY_ID: nonEmpty(source.S3_ACCESS_KEY_ID),
    S3_SECRET_ACCESS_KEY: nonEmpty(source.S3_SECRET_ACCESS_KEY),
  };
  const missing = Object.entries(required)
    .filter(([, value]) => value === undefined)
    .map(([name]) => name);
  if (missing.length > 0) {
    throw new Error(
      `${missing.join(", ")} must be set when BOT_STATE_BACKEND=s3`,
    );
  }

  const prefix = (nonEmpty(source.BOT_STATE_PREFIX) ?? "").replace(
    /^\/+|\/+$/gu,
    "",
  );
  return {
    backend,
    endpoint: required.S3_ENDPOINT as string,
    region: required.S3_REGION as string,
    bucket: required.S3_BUCKET as string,
    key:
      prefix.length > 0 ? `${prefix}/opt-out-users.txt` : "opt-out-users.txt",
    accessKeyId: required.S3_ACCESS_KEY_ID as string,
    secretAccessKey: required.S3_SECRET_ACCESS_KEY as string,
  };
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
    wolframAppId: nonEmpty(source.WOLFRAM_APPID),
    openAIApiKey: nonEmpty(source.OPENAI_API_KEY),
    openAIChatModel:
      nonEmpty(source.OPENAI_CHAT_MODEL) ?? DEFAULT_OPENAI_CHAT_MODEL,
    openAIChatModelLite:
      nonEmpty(source.OPENAI_CHAT_MODEL_LITE) ?? DEFAULT_OPENAI_CHAT_MODEL_LITE,
    openAITranslateModel:
      nonEmpty(source.OPENAI_TRANSLATE_MODEL) ?? DEFAULT_OPENAI_TRANSLATE_MODEL,
    state: loadStateEnv(source),
  };
}
