/**
 * Covers environment parsing at the composition boundary, including local and S3 state modes.
 */
import { describe, expect, it } from "vitest";
import { loadEnv } from "./env.js";

const baseEnv = { CODERUNBOT_TOKEN: "token" };

describe("loadEnv state configuration", () => {
  it("uses current default OpenAI models", () => {
    expect(loadEnv(baseEnv)).toMatchObject({
      openAIChatModel: "gpt-5.2",
      openAIChatModelLite: "gpt-5-mini",
      openAITranslateModel: "gpt-5-mini",
    });
  });

  it("loads optional gaato feature credentials", () => {
    expect(
      loadEnv({
        GAATO_BOT: "1",
        GAATO_BOT_TOKEN: "token",
        WOLFRAM_APPID: "wolfram",
        OPENAI_API_KEY: "openai",
      }),
    ).toMatchObject({
      botName: "gaato-bot",
      wolframAppId: "wolfram",
      openAIApiKey: "openai",
    });
  });

  it("uses the local state file by default", () => {
    expect(loadEnv(baseEnv).state).toEqual({
      backend: "local",
      filePath: "data/opt-out-users.txt",
    });
  });

  it("builds a normalized S3 object key", () => {
    expect(
      loadEnv({
        ...baseEnv,
        BOT_STATE_BACKEND: "s3",
        BOT_STATE_PREFIX: "/bots/coderunbot/",
        S3_ENDPOINT: "https://example.invalid",
        S3_REGION: "test-region-1",
        S3_BUCKET: "state",
        S3_ACCESS_KEY_ID: "access-key",
        S3_SECRET_ACCESS_KEY: "secret-key",
      }).state,
    ).toEqual({
      backend: "s3",
      endpoint: "https://example.invalid",
      region: "test-region-1",
      bucket: "state",
      key: "bots/coderunbot/opt-out-users.txt",
      accessKeyId: "access-key",
      secretAccessKey: "secret-key",
    });
  });

  it("fails fast when an S3 setting is missing", () => {
    expect(() =>
      loadEnv({
        ...baseEnv,
        BOT_STATE_BACKEND: "s3",
        S3_ENDPOINT: "https://example.invalid",
      }),
    ).toThrow(
      "S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY must be set when BOT_STATE_BACKEND=s3",
    );
  });
});
