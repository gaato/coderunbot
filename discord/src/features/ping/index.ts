import { SlashCommandBuilder } from "discord.js";
import { successContainer } from "../../platform/discord/components.js";
import type { Feature } from "../../types.js";

// Temporary smoke-test feature for the TypeScript foundation. Remove it once
// the real feature ports provide end-to-end command coverage.
export function createPingFeature(): Feature {
  return {
    id: "ping",
    slashCommands: [
      {
        data: new SlashCommandBuilder()
          .setName("ping")
          .setDescription("Check whether the bot is responding")
          .setDescriptionLocalizations({ ja: "ボットの応答を確認します" }),
        async execute() {
          return {
            kind: "components-v2",
            components: [successContainer("pong")],
          };
        },
      },
    ],
  };
}
