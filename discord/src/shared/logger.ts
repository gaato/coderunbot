import pino, { type Logger, type LoggerOptions } from "pino";

export type AppLogger = Logger;

export function createLogger(options?: LoggerOptions): AppLogger {
  return pino(options);
}
