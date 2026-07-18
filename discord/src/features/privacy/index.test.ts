/**
 * Covers the privacy-policy reply shape and its Components V2 size budget.
 */
import { readFile } from "node:fs/promises";
import type { ChatInputCommandInteraction } from "discord.js";
import { describe, expect, it } from "vitest";
import type { RequestContext } from "../../platform/discord/context.js";
import type { FeatureDependencies } from "../../types.js";
import { createPrivacyFeature } from "./index.js";

const COMPONENTS_V2_TEXT_LIMIT = 4_000;

function findCommand(name: string) {
  const feature = createPrivacyFeature({} as FeatureDependencies);
  const command = feature.slashCommands?.find(
    (candidate) => candidate.data.name === name,
  );
  if (command === undefined) {
    throw new Error(`missing /${name}`);
  }
  return command;
}

describe("privacy-policy command", () => {
  it("fits the policy document within the Components V2 text budget", async () => {
    const policy = await readFile(
      new URL("../../../config/privacy-policy.md", import.meta.url),
      "utf8",
    );
    expect(policy.length).toBeLessThanOrEqual(COMPONENTS_V2_TEXT_LIMIT);
  });

  it("replies with a Components V2 text display, not plain content", async () => {
    const command = findCommand("privacy-policy");
    const outgoing = await command.execute(
      {} as ChatInputCommandInteraction,
      { locale: "en", userId: "user" } as RequestContext,
    );
    expect(outgoing?.kind).toBe("components-v2");
  });
});
