/**
 * Production-safe logger.
 * `log.debug` and `log.info` only emit in development mode.
 * `log.warn` and `log.error` always emit.
 *
 * Usage:
 *   import { log } from '../utils/logger';
 *   log.debug('[MyModule]', 'some detail', data);
 *   log.warn('Something unexpected happened');
 */

const isDev = (import.meta as any).env?.DEV;

// eslint-disable-next-line @typescript-eslint/no-empty-function
const noop = (..._args: unknown[]): void => {};

export const log = {
  /** Debug-level: only in dev */
  debug: isDev ? console.debug.bind(console) : noop,
  /** Info-level: only in dev */
  info: isDev ? console.log.bind(console) : noop,
  /** Warns always go through */
  warn: console.warn.bind(console),
  /** Errors always go through */
  error: console.error.bind(console),
} as const;
