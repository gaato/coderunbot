/**
 * Exercises the discord.js-free TeX rendering adapter against SVG, PNG, and error cases.
 */
import { describe, expect, it } from "vitest";
import { renderTexToPng, renderTexToSvg, TexRenderError } from "./renderer.js";

describe("TeX renderer", () => {
  it("renders TeX to a PNG buffer", async () => {
    const png = await renderTexToPng("x^2");

    expect(png.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
  });

  it("throws a typed error for invalid TeX", async () => {
    await expect(renderTexToSvg("\\frac{1}{")).rejects.toThrow(TexRenderError);
  });

  it("throws a typed error for undefined macros", async () => {
    await expect(renderTexToSvg("\\notarealmacro")).rejects.toThrow(
      TexRenderError,
    );
  });

  it("reports the original TeX message for invalid input", async () => {
    await expect(renderTexToSvg("{")).rejects.toThrow(/missing close brace/iu);
  });

  it("sets the Japanese serif fallback on SVG text nodes", async () => {
    const svg = await renderTexToSvg("\\text{日本語}");

    const textTags = svg.match(/<text\b[^>]*>/gu) ?? [];
    expect(textTags.length).toBeGreaterThan(0);
    expect(
      textTags.every((tag) =>
        tag.includes('font-family="Noto Serif CJK JP, serif"'),
      ),
    ).toBe(true);
  });
});
