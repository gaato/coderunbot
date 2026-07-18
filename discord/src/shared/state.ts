import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";

export interface StateBackend {
  read(): Promise<string>;
  write(value: string): Promise<void>;
}

export class LocalFileState implements StateBackend {
  readonly #filePath: string;

  constructor(filePath: string) {
    this.#filePath = filePath;
  }

  async read(): Promise<string> {
    try {
      return await readFile(this.#filePath, "utf8");
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        return "";
      }
      throw error;
    }
  }

  async write(value: string): Promise<void> {
    await mkdir(dirname(this.#filePath), { recursive: true });
    await writeFile(this.#filePath, value, "utf8");
  }
}

export interface S3ObjectStateOptions {
  readonly endpoint: string;
  readonly region: string;
  readonly bucket: string;
  readonly key: string;
  readonly credentials: S3ClientConfig["credentials"];
}

export class S3ObjectState implements StateBackend {
  readonly #client: S3Client;
  readonly #bucket: string;
  readonly #key: string;

  constructor(options: S3ObjectStateOptions) {
    this.#client = new S3Client({
      endpoint: options.endpoint,
      region: options.region,
      credentials: options.credentials,
      forcePathStyle: true,
    });
    this.#bucket = options.bucket;
    this.#key = options.key;
  }

  async read(): Promise<string> {
    try {
      const response = await this.#client.send(
        new GetObjectCommand({ Bucket: this.#bucket, Key: this.#key }),
      );
      return (await response.Body?.transformToString("utf-8")) ?? "";
    } catch (error) {
      if (!isMissingS3Object(error)) {
        throw error;
      }
      await this.write("");
      return "";
    }
  }

  async write(value: string): Promise<void> {
    await this.#client.send(
      new PutObjectCommand({
        Bucket: this.#bucket,
        Key: this.#key,
        Body: value,
        ContentType: "text/plain; charset=utf-8",
      }),
    );
  }
}

export class OptOutUsers {
  readonly #backend: StateBackend;
  #users = new Set<string>();
  #writeChain: Promise<void> = Promise.resolve();

  constructor(backend: StateBackend) {
    this.#backend = backend;
  }

  async init(): Promise<void> {
    this.#users = parseUsers(await this.#backend.read());
  }

  has(userId: string): boolean {
    return this.#users.has(userId);
  }

  add(userId: string): Promise<void> {
    this.#users.add(userId);
    return this.#enqueueWrite(serializeUsers(this.#users));
  }

  remove(userId: string): Promise<void> {
    this.#users.delete(userId);
    return this.#enqueueWrite(serializeUsers(this.#users));
  }

  #enqueueWrite(value: string): Promise<void> {
    const write = this.#writeChain.then(() => this.#backend.write(value));
    this.#writeChain = write.catch(() => undefined);
    return write;
  }
}

function parseUsers(value: string): Set<string> {
  return new Set(
    value
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line.length > 0),
  );
}

function serializeUsers(users: ReadonlySet<string>): string {
  const sorted = [...users].sort();
  return sorted.length === 0 ? "" : `${sorted.join("\n")}\n`;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function isMissingS3Object(error: unknown): boolean {
  if (error instanceof NoSuchKey) {
    return true;
  }
  if (!(error instanceof Error) || !("$metadata" in error)) {
    return false;
  }
  const metadata = error.$metadata as { readonly httpStatusCode?: number };
  return error.name === "NoSuchKey" && metadata.httpStatusCode === 404;
}
