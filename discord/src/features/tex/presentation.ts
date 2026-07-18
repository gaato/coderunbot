/**
 * Builds Discord reply values from TeX feature results at the presentation boundary.
 */
import {
  AttachmentBuilder,
  ContainerBuilder,
  FileBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  TextDisplayBuilder,
} from "discord.js";
import type { TFunction } from "i18next";
import {
  FAILURE_ACCENT,
  SUCCESS_ACCENT,
  textComponent,
} from "../../platform/discord/components.js";
import type { OutgoingReply } from "../../types.js";

export function stripTexFences(input: string): string {
  return input
    .replace(/```tex/giu, "")
    .replace(/```/gu, "")
    .trim();
}

export function shouldShowMultilineHint(latex: string): boolean {
  return (
    latex.includes("\\\\") &&
    !latex.includes("\\begin") &&
    !latex.includes("\\end")
  );
}

export function texSuccessReply(
  latex: string,
  png: Buffer,
  spoiler: boolean,
  t: TFunction,
): OutgoingReply {
  const container = new ContainerBuilder()
    .setAccentColor(SUCCESS_ACCENT)
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder()
          .setURL("attachment://tex.png")
          .setSpoiler(spoiler),
      ),
    );

  if (shouldShowMultilineHint(latex)) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### ${t("tex.hintHeading")}\n${t("tex.multilineHint")}`,
      ),
    );
  }

  const source = textComponent(latex, "tex-source.txt");
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`### ${t("tex.codeHeading")}`),
  );
  if (source.component instanceof FileBuilder) {
    container.addFileComponents(source.component);
  } else {
    const safeLatex = latex.replaceAll("```", "`\u200b``");
    source.component.setContent(`\`\`\`tex\n${safeLatex}\n\`\`\``);
    container.addTextDisplayComponents(source.component);
  }

  return {
    kind: "components-v2",
    components: [container],
    files: [new AttachmentBuilder(png, { name: "tex.png" }), ...source.files],
  };
}

export function texFailureReply(message: string, t: TFunction): OutgoingReply {
  const safeMessage = message.replaceAll("```", "`\u200b``");
  const container = new ContainerBuilder()
    .setAccentColor(FAILURE_ACCENT)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### ${t("tex.errorHeading")}\n\`\`\`\n${safeMessage}\n\`\`\``,
      ),
    );
  return { kind: "components-v2", components: [container] };
}
