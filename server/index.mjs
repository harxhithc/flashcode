import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createGzip } from "node:zlib";
import {
  PORT,
  ROOT_DIR,
  ARDUINO_CLI,
  CCACHE,
  MIME_TYPES,
  sendJson,
} from "./utils.mjs";
import { Router } from "./router.mjs";
import { log, startTimer } from "./utils/logger.mjs";

import {
  handleCompileRequest,
  handlePrewarmRequest,
} from "./compiler/compiler.mjs";

import { handleUploadRequest } from "./uploader/uploader.mjs";

import {
  handleGetBoards,
  handleGetBoardOptions,
  handleGetCores,
  handleInstallCore,
  handleUninstallCore,
  handleUpdateCoreIndex,
  handleGetCoreUrls,
  handleSaveCoreUrls,
} from "./hardware/boards.mjs";

import { handleGetPorts } from "./hardware/ports.mjs";

import {
  handleScanMissingLibs,
  handleGetInstalledLibs,
  handleSearchLibs,
  handleInstallLib,
  handleUninstallLib,
  handleInstallZipLib,
  handleInstallGitLib,
} from "./libraries/libraryManager.mjs";

import {
  handleGetAIConfig,
  handleTestAIProvider,
  handleSaveAIProvider,
  handleSetActiveAIProvider,
  handleDeleteAIProvider,
  handleAIChat,
  handlePullAIModels,
  handleSetAutoFailover,
  handleAITranslate,
  handleAIAutocomplete,
} from "./ai/aiService.mjs";

import {
  handleGetSketchbook,
  handleCreateSketchbookSketch,
  handleAddSketchFile,
  handleGetSketchFiles,
} from "./fs/sketchbook.mjs";

import {
  handleOpenExternal,
  handleGetPendingExternal,
  handleOpenFileDialog,
  handleSaveAsDialog,
  handleSaveFileDirect,
  handleReadFileDirect,
  handleOpenFolderDialog,
  handleListDir,
  handleCreateFile,
  handleSketchFiles,
  handleGetExamples,
} from "./fs/dialogs.mjs";

// ==========================================
// 1. Router Initialization & Route Mapping
// ==========================================
const router = new Router();

// Hardware & Boards
router.get("/api/boards", handleGetBoards);
router.get("/api/boards/options", handleGetBoardOptions);
router.get("/api/cores", handleGetCores);
router.post("/api/cores/install", handleInstallCore);
router.post("/api/cores/uninstall", handleUninstallCore);
router.post("/api/cores/update-index", handleUpdateCoreIndex);
router.get(["/api/cores/urls", "/api/boards/additional-urls"], handleGetCoreUrls);
router.post(["/api/cores/urls", "/api/boards/additional-urls"], handleSaveCoreUrls);

// Hardware & Serial Ports
router.get("/api/ports", handleGetPorts);

// Turbo Compilation & Prewarm
router.post("/api/compile", handleCompileRequest);
router.post("/api/prewarm", handlePrewarmRequest);

// Hardware Upload / Flashing
router.post("/api/upload", handleUploadRequest);

// Sketchbook & Multi-file management
router.get("/api/sketchbook", handleGetSketchbook);
router.post("/api/sketchbook/create", handleCreateSketchbookSketch);
router.post("/api/sketch/add-file", handleAddSketchFile);
router.post("/api/sketch/files", handleGetSketchFiles);

// Arduino Libraries Manager
router.post("/api/libs/scan", handleScanMissingLibs);
router.get("/api/libs/installed", handleGetInstalledLibs);
router.get("/api/libs/search", handleSearchLibs);
router.post("/api/libs/install", handleInstallLib);
router.post("/api/libs/uninstall", handleUninstallLib);
router.post("/api/libs/install-zip", handleInstallZipLib);
router.post("/api/libs/install-git", handleInstallGitLib);

// Flash AI Copilot & Custom Providers
router.get("/api/ai/config", handleGetAIConfig);
router.post("/api/ai/provider/test", handleTestAIProvider);
router.post("/api/ai/provider/save", handleSaveAIProvider);
router.post("/api/ai/provider/set-active", handleSetActiveAIProvider);
router.post("/api/ai/provider/delete", handleDeleteAIProvider);
router.post("/api/ai/chat", handleAIChat);
router.post("/api/ai/models/pull", handlePullAIModels);
router.post("/api/ai/settings/autofailover", handleSetAutoFailover);
router.post("/api/ai/translate", handleAITranslate);
router.post("/api/ai/autocomplete", handleAIAutocomplete);

// File System Features & Native Dialogs
router.post("/api/fs/open-external", handleOpenExternal);
router.get("/api/fs/pending-external", handleGetPendingExternal);
router.post("/api/fs/dialog/open-file", handleOpenFileDialog);
router.post("/api/fs/dialog/save-as", handleSaveAsDialog);
router.post("/api/fs/save", handleSaveFileDirect);
router.post("/api/fs/read", handleReadFileDirect);
router.post("/api/fs/dialog/open-folder", handleOpenFolderDialog);
router.post("/api/fs/list-dir", handleListDir);
router.post("/api/fs/create-file", handleCreateFile);
router.post("/api/fs/sketch-files", handleSketchFiles);
router.get("/api/examples", handleGetExamples);

// ==========================================
// 2. Static File Serving with SPA Fallback
// ==========================================
async function serveStatic(res, url) {
  const rootResolved = path.resolve(ROOT_DIR);
  const rawPath = url.pathname === "/" ? "index.html" : url.pathname.replace(/^\/+/, "");
  let targetFile = path.resolve(ROOT_DIR, rawPath);

  // Security: Prevent directory traversal outside ROOT_DIR
  if (!targetFile.startsWith(rootResolved)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  let stat;
  try {
    stat = await fs.promises.stat(targetFile);
    if (stat.isDirectory()) {
      targetFile = path.join(targetFile, "index.html");
      stat = await fs.promises.stat(targetFile);
    }
  } catch {
    // SPA fallback: Return index.html for client-side routing
    targetFile = path.join(ROOT_DIR, "index.html");
  }

  try {
    const content = await fs.promises.readFile(targetFile);
    const ext = path.extname(targetFile).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    // Optimized Caching: Vite hashed assets immutable (1 year), SPA entry no-cache
    const isHashed = /\/assets\/[^\/]+[-.][a-zA-Z0-9_-]{8,}\.(js|css|woff2)$/i.test(targetFile);
    const cacheControl = isHashed ? "public, max-age=31536000, immutable" : "no-cache";

    const acceptEncoding = (res.req?.headers?.["accept-encoding"] || "").toLowerCase();
    const isCompressible = [".html", ".js", ".css", ".json", ".svg"].includes(ext);

    if (content.length > 1024 && isCompressible && acceptEncoding.includes("gzip")) {
      res.writeHead(200, {
        "Content-Type": contentType,
        "Cache-Control": cacheControl,
        "Content-Encoding": "gzip",
        "Vary": "Accept-Encoding",
      });
      const gz = createGzip();
      gz.on("error", () => res.destroy());
      gz.pipe(res);
      gz.end(content);
    } else {
      res.writeHead(200, {
        "Content-Type": contentType,
        "Cache-Control": cacheControl,
        "Content-Length": content.length,
      });
      res.end(content);
    }
  } catch {
    res.writeHead(500);
    res.end("Error loading static asset");
  }
}

// ==========================================
// 3. HTTP Request Pipeline & Server
// ==========================================
const server = http.createServer(async (req, res) => {
  res.req = req;
  const correlationId = req.headers["x-request-id"] || crypto.randomUUID();
  res.setHeader("X-Request-ID", correlationId);

  // CORS Headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Request-ID");

  // CORS Preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  const timer = startTimer();
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  try {
    const handled = await router.dispatch(req, res, url, correlationId);
    if (!handled) {
      await serveStatic(res, url);
    }
  } catch (err) {
    log.error("router", "Unhandled server error", {
      correlationId,
      error: err.message,
      stack: err.stack,
    });
    if (!res.headersSent) {
      sendJson(
        res,
        {
          error: "Internal Server Error",
          details: err.message,
          correlationId,
        },
        err.status || 500
      );
    }
  } finally {
    const ms = timer();
    if (url.pathname.startsWith("/api/")) {
      log.info("http", `${req.method} ${url.pathname}`, {
        correlationId,
        method: req.method,
        path: url.pathname,
        statusCode: res.statusCode,
        durationMs: ms,
      });
    }
  }
});

server.listen(PORT, "127.0.0.1", () => {
  log.info("server", `FlashCode backend running at http://127.0.0.1:${PORT}`, {
    port: PORT,
    arduinoCli: ARDUINO_CLI,
    ccache: CCACHE || null,
  });
});

export { server };
