import path from "node:path";
import { HOME, SKETCH_DIR, BUILDS_BASE_DIR } from "../utils.mjs";

/**
 * Standard FQBN (Fully Qualified Board Name) regex:
 * e.g. "esp32:esp32:esp32", "arduino:avr:uno", "esp8266:esp8266:nodemcuv2"
 * Also supports board options e.g. "esp32:esp32:esp32:FlashFreq=80,UploadSpeed=921600"
 */
const FQBN_RE = /^[a-zA-Z0-9_-]+:[a-zA-Z0-9_-]+:[a-zA-Z0-9_.-]+(:[a-zA-Z0-9_.,=-]+)?$/;

/**
 * Validate that an FQBN matches expected Arduino FQBN format
 * @param {string} fqbn
 * @returns {string} validated fqbn
 * @throws {Error} 400 error if invalid
 */
export function validateFqbn(fqbn) {
  if (typeof fqbn !== "string" || !FQBN_RE.test(fqbn.trim())) {
    throw Object.assign(new Error("Invalid FQBN format"), { status: 400 });
  }
  return fqbn.trim();
}

/**
 * Standard Core ID regex: e.g. "esp32:esp32", "arduino:avr"
 */
const CORE_ID_RE = /^[a-zA-Z0-9_-]+:[a-zA-Z0-9_-]+$/;

/**
 * Validate core platform ID
 * @param {string} coreId
 * @returns {string} validated coreId
 * @throws {Error} 400 error if invalid
 */
export function validateCoreId(coreId) {
  if (typeof coreId !== "string" || !CORE_ID_RE.test(coreId.trim())) {
    throw Object.assign(new Error("Invalid Core ID format"), { status: 400 });
  }
  return coreId.trim();
}

/**
 * Assert that a file/directory path is contained within permitted system root directories.
 * Prevents directory traversal attacks (e.g. "../../../etc/shadow").
 * @param {string} targetPath
 * @param {...string} [customRoots]
 * @returns {string} Normalized absolute path
 * @throws {Error} 400 if path is missing, 403 if path escapes allowed roots
 */
export function assertSafePath(targetPath, ...customRoots) {
  if (!targetPath || typeof targetPath !== "string") {
    throw Object.assign(new Error("Missing or invalid path"), { status: 400 });
  }

  const resolved = path.resolve(targetPath);
  const allowedRoots = customRoots.length > 0
    ? customRoots.map((r) => path.resolve(r))
    : [
        path.resolve(HOME),
        path.resolve(SKETCH_DIR),
        path.resolve(BUILDS_BASE_DIR),
        path.resolve("/tmp"),
      ];

  const isContained = allowedRoots.some((root) => resolved === root || resolved.startsWith(root + path.sep));
  if (!isContained) {
    throw Object.assign(
      new Error(`Access denied: path '${resolved}' is outside permitted directories`),
      { status: 403 }
    );
  }

  return resolved;
}

/**
 * Sanitize a filename to avoid path injection characters
 * @param {string} fileName
 * @returns {string} Clean base filename
 */
export function sanitizeFileName(fileName) {
  if (!fileName || typeof fileName !== "string") {
    throw Object.assign(new Error("Invalid filename"), { status: 400 });
  }
  const clean = path.basename(fileName).replace(/[^a-zA-Z0-9_.-]/g, "_");
  if (!clean || clean === "." || clean === "..") {
    throw Object.assign(new Error("Invalid filename"), { status: 400 });
  }
  return clean;
}
