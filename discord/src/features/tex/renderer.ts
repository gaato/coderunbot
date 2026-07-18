import * as liteAdaptorModule from "mathjax-full/js/adaptors/liteAdaptor.js";
import * as htmlHandlerModule from "mathjax-full/js/handlers/html.js";
import * as allPackagesModule from "mathjax-full/js/input/tex/AllPackages.js";
import * as texModule from "mathjax-full/js/input/tex.js";
import * as mathjaxModule from "mathjax-full/js/mathjax.js";
import * as svgModule from "mathjax-full/js/output/svg.js";
import sharp from "sharp";

const TEXT_FONT_FAMILY = "Noto Serif CJK JP, serif";
const PADDING = 20;

const adaptor = liteAdaptorModule.liteAdaptor();
htmlHandlerModule.RegisterHTMLHandler(adaptor);

// `noundefined` turns unknown commands into red text and prevents MathJax from
// producing the data-mjx-error/title pair needed for typed render failures.
const renderPackages = allPackagesModule.AllPackages.filter(
  (packageName) => packageName !== "noundefined",
);

export class TexRenderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TexRenderError";
  }
}

export function renderTexToSvg(latex: string): string {
  const tex = new texModule.TeX({ packages: renderPackages });
  const svg = new svgModule.SVG();
  const document = mathjaxModule.mathjax.document("", {
    InputJax: tex,
    OutputJax: svg,
  });
  const converted = document.convert(latex, {
    display: true,
    em: 16,
    ex: 8,
    containerWidth: 80,
  });
  const svgElement = adaptor.tags(converted, "svg")[0];
  if (svgElement === undefined) {
    throw new Error("MathJax did not produce an SVG element");
  }

  const rendered = adaptor.outerHTML(svgElement);
  if (rendered.includes("data-mjx-error")) {
    const title = rendered.match(/\btitle=(['"])(.*?)\1/u)?.[2];
    throw new TexRenderError(
      title === undefined
        ? "Unknown LaTeX rendering error"
        : decodeXmlEntities(title),
    );
  }

  for (const textElement of adaptor.tags(svgElement, "text")) {
    adaptor.setAttribute(textElement, "font-family", TEXT_FONT_FAMILY);
  }
  return adaptor.outerHTML(svgElement);
}

export async function renderTexToPng(latex: string): Promise<Buffer> {
  const svg = renderTexToSvg(latex);
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

function decodeXmlEntities(value: string): string {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}
