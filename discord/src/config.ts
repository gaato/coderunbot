/**
 * Defines bot profiles used by the composition root to select features and defaults.
 */
import type { BotName } from "./env.js";
import type { FeatureId } from "./types.js";

export interface BotProfile {
  readonly name: BotName;
  readonly prefix: string;
  readonly defaultLocale: "en" | "ja";
  readonly features: readonly FeatureId[];
}

export const BOT_PROFILES = {
  coderunbot: {
    name: "coderunbot",
    prefix: "]",
    defaultLocale: "en",
    features: ["tex", "code", "privacy"],
  },
  "gaato-bot": {
    name: "gaato-bot",
    prefix: ")",
    defaultLocale: "ja",
    features: ["tex", "code", "privacy", "wolfram", "misc", "translate"],
  },
} as const satisfies Record<BotName, BotProfile>;

export function getBotProfile(name: BotName): BotProfile {
  return BOT_PROFILES[name];
}
