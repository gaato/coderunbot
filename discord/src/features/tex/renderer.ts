/**
 * In-process LaTeX → SVG → PNG renderer built on MathJax v4.
 *
 * This is the discord.js-free adapter of the tex feature: it knows nothing
 * about Discord and exposes plain functions returning SVG text / PNG buffers,
 * so it can be unit-tested directly. It replaces the standalone tex web
 * service the Python bot used to call over HTTP.
 */
import { MathJaxNewcmFont } from "@mathjax/mathjax-newcm-font/js/svg.js";
import { liteAdaptor } from "@mathjax/src/js/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "@mathjax/src/js/handlers/html.js";
import TexError from "@mathjax/src/js/input/tex/TexError.js";
import { TeX } from "@mathjax/src/js/input/tex.js";
import { mathjax } from "@mathjax/src/js/mathjax.js";
import { SVG } from "@mathjax/src/js/output/svg.js";
// The newcm font data is split into dynamically loaded pieces; this import
// teaches MathJax to load them with ESM import() when a glyph range is first
// needed (which is also why conversion must go through convertPromise()).
import "@mathjax/src/js/util/asyncLoad/esm.js";
import sharp from "sharp";

// MathJax v4 dropped the v3 AllPackages bundle, so every TeX extension has to
// be imported for its registration side effect and listed in `packages`
// below. This is the full set shipped in @mathjax/src, minus:
//   - noundefined: would render unknown macros as red text instead of letting
//     them raise the TexError we turn into a typed render failure
//   - noerrors: would swallow TeX errors and typeset the raw source
//   - autoload / require: dynamic extension loading is pointless (and
//     undesirable) when everything is preloaded
//   - setoptions: lets TeX input override parser options at runtime
//   - tagformat: only useful with a custom tag-format configuration
//   - colorv2: superseded by (and conflicting with) the color package
//   - fontsizev3: compatibility shim for v3 font-size behavior
//   - texhtml: embeds raw HTML in the output, which we never want
import "@mathjax/src/js/input/tex/action/ActionConfiguration.js";
import "@mathjax/src/js/input/tex/ams/AmsConfiguration.js";
import "@mathjax/src/js/input/tex/amscd/AmsCdConfiguration.js";
import "@mathjax/src/js/input/tex/bbm/BbmConfiguration.js";
import "@mathjax/src/js/input/tex/bboldx/BboldxConfiguration.js";
import "@mathjax/src/js/input/tex/bbox/BboxConfiguration.js";
import "@mathjax/src/js/input/tex/begingroup/BegingroupConfiguration.js";
import "@mathjax/src/js/input/tex/boldsymbol/BoldsymbolConfiguration.js";
import "@mathjax/src/js/input/tex/braket/BraketConfiguration.js";
import "@mathjax/src/js/input/tex/bussproofs/BussproofsConfiguration.js";
import "@mathjax/src/js/input/tex/cancel/CancelConfiguration.js";
import "@mathjax/src/js/input/tex/cases/CasesConfiguration.js";
import "@mathjax/src/js/input/tex/centernot/CenternotConfiguration.js";
import "@mathjax/src/js/input/tex/color/ColorConfiguration.js";
import "@mathjax/src/js/input/tex/colortbl/ColortblConfiguration.js";
import "@mathjax/src/js/input/tex/configmacros/ConfigMacrosConfiguration.js";
import "@mathjax/src/js/input/tex/dsfont/DsfontConfiguration.js";
import "@mathjax/src/js/input/tex/empheq/EmpheqConfiguration.js";
import "@mathjax/src/js/input/tex/enclose/EncloseConfiguration.js";
import "@mathjax/src/js/input/tex/extpfeil/ExtpfeilConfiguration.js";
import "@mathjax/src/js/input/tex/gensymb/GensymbConfiguration.js";
import "@mathjax/src/js/input/tex/html/HtmlConfiguration.js";
import "@mathjax/src/js/input/tex/mathtools/MathtoolsConfiguration.js";
import "@mathjax/src/js/input/tex/mhchem/MhchemConfiguration.js";
import "@mathjax/src/js/input/tex/newcommand/NewcommandConfiguration.js";
import "@mathjax/src/js/input/tex/physics/PhysicsConfiguration.js";
import "@mathjax/src/js/input/tex/textcomp/TextcompConfiguration.js";
import "@mathjax/src/js/input/tex/textmacros/TextMacrosConfiguration.js";
import "@mathjax/src/js/input/tex/unicode/UnicodeConfiguration.js";
import "@mathjax/src/js/input/tex/units/UnitsConfiguration.js";
import "@mathjax/src/js/input/tex/upgreek/UpgreekConfiguration.js";
import "@mathjax/src/js/input/tex/verb/VerbConfiguration.js";

const RENDER_PACKAGES = [
  "base",
  "action",
  "ams",
  "amscd",
  "bbm",
  "bboldx",
  "bbox",
  "begingroup",
  "boldsymbol",
  "braket",
  "bussproofs",
  "cancel",
  "cases",
  "centernot",
  "color",
  "colortbl",
  "configmacros",
  "dsfont",
  "empheq",
  "enclose",
  "extpfeil",
  "gensymb",
  "html",
  "mathtools",
  "mhchem",
  "newcommand",
  "physics",
  "textcomp",
  "textmacros",
  "unicode",
  "units",
  "upgreek",
  "verb",
];

// The newcm font has no CJK glyphs, so e.g. \text{日本語} comes out as plain
// SVG <text> elements. Forcing this family makes librsvg (inside sharp) pick
// the Noto Serif CJK JP installed in the container instead of a fallback that
// lacks the glyphs.
const TEXT_FONT_FAMILY = "Noto Serif CJK JP, serif";
const PADDING = 20;

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);

export class TexRenderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TexRenderError";
  }
}

export async function renderTexToSvg(latex: string): Promise<string> {
  // A fresh TeX input jax and document per call keeps parser state (e.g.
  // \newcommand definitions, \begingroup scopes) from leaking across renders.
  const tex = new TeX({
    packages: RENDER_PACKAGES,
    // By default MathJax typesets compile errors as red <merror> text; throw
    // instead so callers get a typed failure with the original TeX message.
    formatError(_jax: unknown, error: unknown) {
      throw error;
    },
  });
  const svg = new SVG({ fontData: MathJaxNewcmFont });
  const document = mathjax.document("", {
    InputJax: tex,
    OutputJax: svg,
  });

  // convertPromise (not convert) so dynamically loaded font pieces can be
  // awaited mid-conversion; see the asyncLoad/esm import above.
  const converted = await document
    .convertPromise(latex, {
      display: true,
      em: 16,
      ex: 8,
      containerWidth: 80,
    })
    .catch((error: unknown) => {
      if (error instanceof TexError) {
        throw new TexRenderError(error.message);
      }
      throw error;
    });

  const svgElement = adaptor.tags(converted, "svg")[0];
  if (svgElement === undefined) {
    throw new Error("MathJax did not produce an SVG element");
  }

  // Defensive fallback: formatError should surface every compile error as an
  // exception, but fail loudly if an merror node slips through anyway.
  const rendered = adaptor.outerHTML(svgElement);
  if (rendered.includes("data-mjx-error")) {
    const title = rendered.match(/\btitle=(['"])(.*?)\1/u)?.[2];
    throw new TexRenderError(title ?? "Unknown LaTeX rendering error");
  }

  for (const textElement of adaptor.tags(svgElement, "text")) {
    adaptor.setAttribute(textElement, "font-family", TEXT_FONT_FAMILY);
  }
  return adaptor.outerHTML(svgElement);
}

export async function renderTexToPng(latex: string): Promise<Buffer> {
  const svg = await renderTexToSvg(latex);
  const white = { r: 255, g: 255, b: 255 };
  return sharp(Buffer.from(svg))
    .resize({ height: 500 })
    .flatten({ background: white })
    .extend({
      top: PADDING,
      bottom: PADDING,
      left: PADDING,
      right: PADDING,
      background: { ...white, alpha: 1 },
    })
    .png()
    .toBuffer();
}
