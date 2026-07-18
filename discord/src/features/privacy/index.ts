/**
 * Implements privacy-policy and opt-out commands in the feature layer.
 */
import { readFile } from "node:fs/promises";
import { SlashCommandBuilder } from "discord.js";
import { getFixedT } from "../../shared/i18n.js";
import type { Feature, FeatureDependencies } from "../../types.js";

const privacyPolicyUrl = new URL(
  "../../../config/privacy-policy.md",
  import.meta.url,
);

export function createPrivacyFeature({
  optOutUsers,
}: FeatureDependencies): Feature {
  return {
    id: "privacy",
    slashCommands: [
      {
        data: new SlashCommandBuilder()
          .setName("privacy-policy")
          .setDescription("Show the privacy policy")
          .setDescriptionLocalizations({
            ja: "プライバシーポリシーを表示します",
          }),
        async execute() {
          return {
            kind: "plain",
            content: await readFile(privacyPolicyUrl, "utf8"),
          };
        },
      },
      {
        data: new SlashCommandBuilder()
          .setName("opt-out")
          .setDescription("Stop the bot from processing your message content")
          .setDescriptionLocalizations({
            ja: "ボットによるメッセージ内容の処理を停止します",
          }),
        async execute(_interaction, context) {
          const t = getFixedT(context.locale);
          if (optOutUsers.has(context.userId)) {
            return { kind: "plain", content: t("privacy.optOut.already") };
          }

          await optOutUsers.add(context.userId);
          return { kind: "plain", content: t("privacy.optOut.success") };
        },
      },
      {
        data: new SlashCommandBuilder()
          .setName("opt-in")
          .setDescription("Allow the bot to process your message content again")
          .setDescriptionLocalizations({
            ja: "ボットによるメッセージ内容の処理を再開します",
          }),
        async execute(_interaction, context) {
          const t = getFixedT(context.locale);
          if (!optOutUsers.has(context.userId)) {
            return { kind: "plain", content: t("privacy.optIn.already") };
          }

          await optOutUsers.remove(context.userId);
          return { kind: "plain", content: t("privacy.optIn.success") };
        },
      },
    ],
  };
}
