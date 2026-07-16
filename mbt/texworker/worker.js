import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline';

const defaultRenderer = new URL('../../tex.gaato.net/dist/math-renderer.js', import.meta.url);
const rendererUrl = process.env.TEX_RENDERER_MODULE
  ? pathToFileURL(resolve(process.env.TEX_RENDERER_MODULE))
  : defaultRenderer;
const packageUrl = process.env.TEX_GAATO_PACKAGE
  ? pathToFileURL(resolve(process.env.TEX_GAATO_PACKAGE))
  : new URL('../../tex.gaato.net/package.json', import.meta.url);

const { renderSvg } = await import(rendererUrl.href);
const requireFromRenderer = createRequire(packageUrl);
const sharpModule = requireFromRenderer('sharp');
const sharp = sharpModule.default ?? sharpModule;

const pngHeight = 500;
const pngPadding = 20;

async function renderPng(latex) {
  const svg = await renderSvg(latex);
  return sharp(Buffer.from(svg))
    .resize({ height: pngHeight })
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .extend({
      top: pngPadding,
      bottom: pngPadding,
      left: pngPadding,
      right: pngPadding,
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    })
    .png()
    .toBuffer();
}

function write(response) {
  process.stdout.write(`${JSON.stringify(response)}\n`);
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

// Initialize MathJax before accepting protocol input.
await renderSvg('\\vphantom{x}');

const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of lines) {
  if (line.trim().length === 0) {
    continue;
  }
  let request;
  try {
    request = JSON.parse(line);
  } catch (error) {
    write({ id: -1, ok: false, error: `Invalid JSON: ${errorMessage(error)}` });
    continue;
  }
  const id = Number.isSafeInteger(request?.id) ? request.id : -1;
  if (typeof request?.latex !== 'string' || request.latex.trim().length === 0) {
    write({ id, ok: false, error: 'LaTeX string is required.' });
    continue;
  }
  try {
    const png = await renderPng(request.latex);
    write({ id, ok: true, png: png.toString('base64') });
  } catch (error) {
    write({ id, ok: false, error: errorMessage(error) });
  }
}
