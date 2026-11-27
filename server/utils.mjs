import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createGzip } from "node:zlib";

export const PORT = Number(process.env.PORT) || 1420;
export const ROOT_DIR = path.resolve("./dist");
export const HOME = os.homedir();
export const ARDUINO_CLI = fs.existsSync(`${HOME}/.local/bin/arduino-cli`)
  ? `${HOME}/.local/bin/arduino-cli`
  : "arduino-cli";
export const CCACHE = fs.existsSync(`${HOME}/.local/bin/ccache`)
  ? `${HOME}/.local/bin/ccache`
  : null;

export const FLASHCODE_CACHE_DIR = path.join(HOME, ".cache", "flashcode");
export const SKETCH_DIR = path.join(FLASHCODE_CACHE_DIR, "sketch");
export const BUILDS_BASE_DIR = path.join(FLASHCODE_CACHE_DIR, "builds");
export const CACHE_BASE = path.join(FLASHCODE_CACHE_DIR, "cache");
export const CCACHE_BIN_DIR = path.join(FLASHCODE_CACHE_DIR, "ccache-bin");
export const CCACHE_DIR = path.join(FLASHCODE_CACHE_DIR, "ccache");
export const CORES_DIR = path.join(FLASHCODE_CACHE_DIR, "cores");

export const CONFIG_DIR = path.join(HOME, ".config", "flashcode");
export const AI_CONFIG_FILE = path.join(CONFIG_DIR, "ai_providers.json");
export const SKETCHBOOK_DIR = path.join(HOME, "Arduino");

// Ensure persistent directories exist
fs.mkdirSync(FLASHCODE_CACHE_DIR, { recursive: true });
fs.mkdirSync(SKETCH_DIR, { recursive: true });
fs.mkdirSync(BUILDS_BASE_DIR, { recursive: true });
fs.mkdirSync(CACHE_BASE, { recursive: true });
fs.mkdirSync(CCACHE_BIN_DIR, { recursive: true });
fs.mkdirSync(CCACHE_DIR, { recursive: true });
fs.mkdirSync(CORES_DIR, { recursive: true });
if (!fs.existsSync(SKETCHBOOK_DIR)) {
  try { fs.mkdirSync(SKETCHBOOK_DIR, { recursive: true }); } catch (_) {}
}

// Migrate legacy /tmp/flashcode_project builds to persistent cache if found
try {
  const legacyBuilds = "/tmp/flashcode_project/builds";
  if (fs.existsSync(legacyBuilds)) {
    const entries = fs.readdirSync(legacyBuilds);
    for (const entry of entries) {
      const srcPath = path.join(legacyBuilds, entry);
      const destPath = path.join(BUILDS_BASE_DIR, entry);
      if (!fs.existsSync(destPath)) {
        fs.cpSync(srcPath, destPath, { recursive: true });
      }
    }
  }
} catch (_) {}

// MIME types for static frontend
export const MIME_TYPES = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".ttf": "font/ttf",
  ".woff2": "font/woff2",
};

export function readBody(req, maxBytes = 5 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        req.destroy();
        reject(Object.assign(new Error("Request body too large"), { status: 413 }));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        const bodyStr = Buffer.concat(chunks).toString("utf-8");
        resolve(bodyStr ? JSON.parse(bodyStr) : {});
      } catch (e) {
        resolve({});
      }
    });
    req.on("error", reject);
  });
}

export function sendJson(res, data, status = 200) {
  const json = typeof data === "string" ? data : JSON.stringify(data);
  const acceptEncoding = (res.req?.headers?.["accept-encoding"] || "").toLowerCase();

  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Request-ID",
  };

  if (json.length > 1024 && acceptEncoding.includes("gzip")) {
    headers["Content-Encoding"] = "gzip";
    headers["Vary"] = "Accept-Encoding";
    res.writeHead(status, headers);
    const gz = createGzip();
    gz.on("error", () => res.destroy());
    gz.pipe(res);
    gz.end(json);
  } else {
    headers["Content-Length"] = Buffer.byteLength(json);
    res.writeHead(status, headers);
    res.end(json);
  }
}

export function scanDirectory(dirPath) {
  const result = [];
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const full = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        result.push({
          name: entry.name,
          path: full,
          isDirectory: true,
          children: scanDirectory(full),
        });
      } else {
        result.push({
          name: entry.name,
          path: full,
          isDirectory: false,
          size: fs.statSync(full).size,
        });
      }
    }
  } catch (e) {}
  return result;
}
