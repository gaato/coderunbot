const WOLFRAM_QUERY_URL = "http://api.wolframalpha.com/v2/query";

export interface WolframImage {
  readonly src: string;
}

export interface WolframSubpod {
  readonly plaintext: string;
  readonly img?: WolframImage;
}

export interface WolframPod {
  readonly title: string;
  readonly subpods: readonly WolframSubpod[];
}

export interface WolframQueryResult {
  readonly success: boolean;
  readonly pods: readonly WolframPod[];
}

export class WolframResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WolframResponseError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseSubpod(value: unknown): WolframSubpod {
  if (!isRecord(value) || typeof value.plaintext !== "string") {
    throw new WolframResponseError("invalid Wolfram|Alpha subpod");
  }
  if (value.img === undefined) {
    return { plaintext: value.plaintext };
  }
  if (!isRecord(value.img) || typeof value.img.src !== "string") {
    throw new WolframResponseError("invalid Wolfram|Alpha subpod image");
  }
  return { plaintext: value.plaintext, img: { src: value.img.src } };
}

function parsePod(value: unknown): WolframPod {
  if (
    !isRecord(value) ||
    typeof value.title !== "string" ||
    !Array.isArray(value.subpods)
  ) {
    throw new WolframResponseError("invalid Wolfram|Alpha pod");
  }
  return {
    title: value.title,
    subpods: value.subpods.map(parseSubpod),
  };
}

export function parseWolframResponse(value: unknown): WolframQueryResult {
  if (!isRecord(value) || !isRecord(value.queryresult)) {
    throw new WolframResponseError("missing Wolfram|Alpha queryresult");
  }
  const queryResult = value.queryresult;
  if (typeof queryResult.success !== "boolean") {
    throw new WolframResponseError("invalid Wolfram|Alpha success flag");
  }
  if (queryResult.pods === undefined && !queryResult.success) {
    return { success: false, pods: [] };
  }
  if (!Array.isArray(queryResult.pods)) {
    throw new WolframResponseError("invalid Wolfram|Alpha pods");
  }
  return {
    success: queryResult.success,
    pods: queryResult.pods.map(parsePod),
  };
}

export class WolframClient {
  readonly #appId: string;
  readonly #fetch: typeof fetch;

  constructor(appId: string, fetchImplementation: typeof fetch = fetch) {
    this.#appId = appId;
    this.#fetch = fetchImplementation;
  }

  async query(input: string): Promise<WolframQueryResult> {
    const url = new URL(WOLFRAM_QUERY_URL);
    url.search = new URLSearchParams({
      input,
      format: "image,plaintext",
      output: "JSON",
      appid: this.#appId,
    }).toString();
    const response = await this.#fetch(url);
    if (!response.ok) {
      throw new Error(`Wolfram|Alpha returned HTTP status ${response.status}`);
    }
    return parseWolframResponse(await response.json());
  }
}
