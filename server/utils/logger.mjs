/**
 * Structured Logger for FlashCode Backend
 * Produces structured JSON log entries to stdout / stderr with correlation IDs and timestamps.
 */

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const envLevel = (process.env.LOG_LEVEL || "info").toLowerCase();
const MIN_LEVEL = LEVELS[envLevel] !== undefined ? LEVELS[envLevel] : LEVELS.info;

/**
 * Emit a structured log entry
 * @param {'debug'|'info'|'warn'|'error'} level
 * @param {string} module Subsystem or file name (e.g. 'router', 'compiler', 'ai', 'boards')
 * @param {string} message Human-readable log message
 * @param {Object} [meta={}] Additional context (correlationId, durationMs, error details, etc.)
 */
export function log(level, module, message, meta = {}) {
  const lvl = (level || "info").toLowerCase();
  const severity = LEVELS[lvl] !== undefined ? LEVELS[lvl] : LEVELS.info;

  if (severity < MIN_LEVEL) return;

  const entry = {
    ts: new Date().toISOString(),
    level: lvl,
    module,
    message,
    ...meta,
    pid: process.pid,
  };

  const outputStream = lvl === "error" ? process.stderr : process.stdout;
  outputStream.write(JSON.stringify(entry) + "\n");
}

// Convenience methods
log.debug = (module, message, meta) => log("debug", module, message, meta);
log.info = (module, message, meta) => log("info", module, message, meta);
log.warn = (module, message, meta) => log("warn", module, message, meta);
log.error = (module, message, meta) => log("error", module, message, meta);

/**
 * High-resolution performance timer helper
 * @returns {() => number} Function that returns elapsed milliseconds
 */
export function startTimer() {
  const start = performance.now();
  return () => Number((performance.now() - start).toFixed(1));
}
