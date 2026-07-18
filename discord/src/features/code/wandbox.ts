/**
 * Adapts Wandbox compiler discovery and execution for the code feature.
 * The adapter is discord.js-free and unit-tested directly.
 */
import type { AppLogger } from "../../shared/logger.js";

const LIST_URL = "https://wandbox.org/api/list.json";
const COMPILE_URL = "https://wandbox.org/api/compile.json";
export const WANDBOX_CACHE_TTL_MS = 60 * 60 * 1_000;

const NIM_COMPILER_OPTIONS = [
  "--hint[Processing]:off",
  "--hint[Conf]:off",
  "--hint[Link]:off",
  "--hint[SuccessX]:off",
].join("\n");

// Dynamic selection broke twice: an API format changed, then a HEAD compiler won the heuristic.
// Prefer known compiler pins and fall back to a non-development candidate when a pin disappears.
export const PINNED_COMPILERS: Readonly<Record<string, string>> = {
  python: "cpython-3.14.0",
  "c++": "gcc-13.2.0",
  c: "gcc-13.2.0-c",
  "c#": "dotnetcore-8.0.402",
  nim: "nim-2.2.10",
  haskell: "ghc-9.10.1",
  rust: "rust-1.82.0",
  go: "go-1.23.2",
  typescript: "typescript-5.6.2",
  javascript: "nodejs-20.17.0",
  java: "openjdk-jdk-21+35",
  ruby: "ruby-3.4.9",
  php: "php-8.3.12",
  swift: "swift-6.0.1",
  d: "dmd-2.109.1",
  lua: "lua-5.4.7",
  perl: "perl-5.40.0",
  r: "r-4.4.1",
  ocaml: "ocaml-5.2.0",
};

export interface WandboxCompiler {
  readonly name: string;
  readonly language: string;
}

export interface LanguageChoice {
  readonly name: string;
  readonly value: string;
}

export interface CompilerResolution {
  readonly compiler: string;
  readonly source: "pinned" | "heuristic";
  readonly missingPinnedCompiler?: string;
}

export interface WandboxCompileResult {
  readonly status?: string;
  readonly signal?: string;
  readonly compiler_output?: string;
  readonly compiler_error?: string;
  readonly compiler_message?: string;
  readonly program_output?: string;
  readonly program_error?: string;
  readonly program_message?: string;
  readonly permlink?: string;
  readonly url?: string;
  readonly [field: string]: string | undefined;
}

export type WandboxErrorCode = "connection" | "http" | "non_json" | "schema";

export class WandboxError extends Error {
  constructor(
    readonly code: WandboxErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "WandboxError";
  }
}

export class WandboxHttpError extends WandboxError {
  constructor(
    readonly status: number,
    readonly responseText: string,
  ) {
    super("http", `Wandbox returned HTTP ${status}`);
    this.name = "WandboxHttpError";
  }
}

export class WandboxNonJsonError extends WandboxError {
  constructor(
    readonly status: number,
    readonly responseText: string,
    options?: ErrorOptions,
  ) {
    super("non_json", "Wandbox returned a non-JSON response", options);
    this.name = "WandboxNonJsonError";
  }
}

export class WandboxSchemaError extends WandboxError {
  constructor(message: string) {
    super("schema", message);
    this.name = "WandboxSchemaError";
  }
}

export function normalizeLanguageKey(language: string): string {
  return language.toLowerCase().replaceAll(" ", "");
}

export function parseCompilerList(value: unknown): WandboxCompiler[] {
  // Guard the remote schema so an upstream format change produces a typed, loud failure.
  if (!Array.isArray(value)) {
    throw new WandboxSchemaError("Wandbox compiler list is not an array");
  }

  return value.map((entry, index) => {
    if (
      typeof entry !== "object" ||
      entry === null ||
      !("name" in entry) ||
      !("language" in entry) ||
      typeof entry.name !== "string" ||
      typeof entry.language !== "string" ||
      entry.name.length === 0 ||
      entry.language.length === 0
    ) {
      throw new WandboxSchemaError(
        `Wandbox compiler list entry ${index} is missing a valid name or language`,
      );
    }
    return { name: entry.name, language: entry.language };
  });
}

export function languageChoices(
  compilers: readonly WandboxCompiler[],
): LanguageChoice[] {
  const choices = new Map<string, LanguageChoice>();
  for (const compiler of compilers) {
    const value = normalizeLanguageKey(compiler.language);
    if (!choices.has(value)) {
      choices.set(value, { name: compiler.language, value });
    }
  }
  return [...choices.values()];
}

export function resolveCompilerFromList(
  languageKey: string,
  compilers: readonly WandboxCompiler[],
  pinnedCompilers: Readonly<Record<string, string>> = PINNED_COMPILERS,
): CompilerResolution | undefined {
  const key = normalizeLanguageKey(languageKey);
  const candidates = compilers.filter(
    (compiler) => normalizeLanguageKey(compiler.language) === key,
  );
  if (candidates.length === 0) {
    return undefined;
  }

  const pinned = pinnedCompilers[key];
  if (pinned !== undefined && candidates.some(({ name }) => name === pinned)) {
    return { compiler: pinned, source: "pinned" };
  }

  const stable = candidates.find(
    ({ name }) => !/(?:head|devel|git)/iu.test(name),
  );
  return {
    compiler: (stable ?? candidates[0])?.name ?? "",
    source: "heuristic",
    ...(pinned === undefined ? {} : { missingPinnedCompiler: pinned }),
  };
}

function parseCompileResult(value: unknown): WandboxCompileResult {
  // Apply the same schema guard to compile output so response changes fail loudly.
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new WandboxSchemaError("Wandbox compile result is not an object");
  }

  const result: Record<string, string> = {};
  for (const [field, fieldValue] of Object.entries(value)) {
    if (typeof fieldValue !== "string") {
      throw new WandboxSchemaError(
        `Wandbox compile result field ${field} is not a string`,
      );
    }
    result[field] = fieldValue;
  }
  return result;
}

export interface WandboxClientOptions {
  readonly logger: Pick<AppLogger, "error" | "warn">;
  readonly fetch?: typeof fetch;
  readonly now?: () => number;
  readonly cacheTtlMs?: number;
}

export class WandboxClient {
  readonly #logger: Pick<AppLogger, "error" | "warn">;
  readonly #fetch: typeof fetch;
  readonly #now: () => number;
  readonly #cacheTtlMs: number;
  #compilers: WandboxCompiler[] = [];
  // The compiler-list cache refreshes on a TTL rather than on every command.
  #lastRefreshAttempt = Number.NEGATIVE_INFINITY;
  #refreshing?: Promise<void>;

  constructor(options: WandboxClientOptions) {
    this.#logger = options.logger;
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#now = options.now ?? Date.now;
    this.#cacheTtlMs = options.cacheTtlMs ?? WANDBOX_CACHE_TTL_MS;
  }

  async init(): Promise<void> {
    await this.#refresh();
  }

  getLanguageChoices(): readonly LanguageChoice[] {
    return languageChoices(this.#compilers);
  }

  async resolveCompiler(
    languageKey: string,
  ): Promise<CompilerResolution | undefined> {
    if (this.#now() - this.#lastRefreshAttempt >= this.#cacheTtlMs) {
      await this.#refresh();
    }
    const resolution = resolveCompilerFromList(languageKey, this.#compilers);
    return resolution;
  }

  async compile(
    compiler: string,
    code: string,
    stdin: string,
  ): Promise<WandboxCompileResult> {
    let response: Response;
    try {
      response = await this.#fetch(COMPILE_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          compiler,
          code,
          stdin,
          "compiler-option-raw": compiler.startsWith("nim-")
            ? NIM_COMPILER_OPTIONS
            : "",
        }),
      });
    } catch (error) {
      throw new WandboxError("connection", "Could not connect to Wandbox", {
        cause: error,
      });
    }

    if (!response.ok) {
      throw new WandboxHttpError(response.status, await response.text());
    }

    const fallbackResponse = response.clone();
    let value: unknown;
    try {
      value = await response.json();
    } catch (error) {
      throw new WandboxNonJsonError(
        response.status,
        await fallbackResponse.text(),
        { cause: error },
      );
    }

    const result = parseCompileResult(value);
    if (compiler.startsWith("nim-") && result.compiler_error !== undefined) {
      return {
        ...result,
        compiler_error: result.compiler_error.replace(/^CC: \S+\r?\n/gmu, ""),
      };
    }
    return result;
  }

  async #refresh(): Promise<void> {
    if (this.#refreshing !== undefined) {
      return this.#refreshing;
    }

    this.#refreshing = this.#refreshCompilerList();
    try {
      await this.#refreshing;
    } finally {
      this.#refreshing = undefined;
    }
  }

  async #refreshCompilerList(): Promise<void> {
    this.#lastRefreshAttempt = this.#now();
    try {
      let response: Response;
      try {
        response = await this.#fetch(LIST_URL);
      } catch (error) {
        throw new WandboxError(
          "connection",
          "Could not fetch the Wandbox compiler list",
          { cause: error },
        );
      }
      if (!response.ok) {
        throw new WandboxHttpError(response.status, await response.text());
      }

      const fallbackResponse = response.clone();
      let value: unknown;
      try {
        value = await response.json();
      } catch (error) {
        throw new WandboxNonJsonError(
          response.status,
          await fallbackResponse.text(),
          { cause: error },
        );
      }
      this.#compilers = parseCompilerList(value);
      for (const [languageKey, pinnedCompiler] of Object.entries(
        PINNED_COMPILERS,
      )) {
        const resolution = resolveCompilerFromList(
          languageKey,
          this.#compilers,
        );
        if (resolution?.source !== "pinned") {
          this.#logger.warn(
            {
              languageKey,
              pinnedCompiler,
              fallbackCompiler: resolution?.compiler,
            },
            "Pinned Wandbox compiler is unavailable; using heuristic fallback when possible",
          );
        }
      }
    } catch (error) {
      // A failed refresh leaves #compilers untouched so commands can use stale valid data.
      if (error instanceof WandboxSchemaError) {
        this.#logger.error(
          { error },
          "Wandbox compiler list response did not match the expected schema",
        );
      }
      this.#logger.warn(
        { error, staleCompilerCount: this.#compilers.length },
        "Failed to refresh Wandbox compiler list; retaining stale cache",
      );
    }
  }
}
