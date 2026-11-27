import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import {
  HOME,
  ARDUINO_CLI,
  CCACHE,
  SKETCH_DIR,
  BUILDS_BASE_DIR,
  CACHE_BASE,
  CCACHE_BIN_DIR,
  CCACHE_DIR,
  CORES_DIR,
  readBody,
  sendJson,
} from "../utils.mjs";
import { AsyncMutex } from "../utils/mutex.mjs";
import { LRUMap } from "../utils/lru-map.mjs";
import { log, startTimer } from "../utils/logger.mjs";
import { validateFqbn } from "../utils/validate.mjs";

let ccacheToolchainInitialized = false;
let toolchainPaths = [];

/**
 * Configure ccache wrappers for Arduino compiler toolchains.
 * Creates symlinks so arduino-cli invokes ccache automatically.
 */
export function ensureCcacheToolchain() {
  if (!CCACHE || !fs.existsSync(CCACHE)) {
    return false;
  }
  if (ccacheToolchainInitialized) {
    return true;
  }

  try {
    fs.mkdirSync(CCACHE_BIN_DIR, { recursive: true });
    const packagesDir = path.join(HOME, ".arduino15", "packages");
    const discoveredBinDirs = new Set();

    if (fs.existsSync(packagesDir)) {
      const walk = (dir, depth = 0) => {
        if (depth > 6) return;
        try {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const ent of entries) {
            if (ent.isDirectory()) {
              const full = path.join(dir, ent.name);
              if (ent.name === "bin") {
                discoveredBinDirs.add(full);
              } else if (!ent.name.startsWith(".")) {
                walk(full, depth + 1);
              }
            }
          }
        } catch (_) {}
      };
      walk(packagesDir);
    }

    toolchainPaths = Array.from(discoveredBinDirs);

    for (const binDir of toolchainPaths) {
      try {
        const files = fs.readdirSync(binDir);
        for (const f of files) {
          const target = path.join(binDir, f);
          const linkPath = path.join(CCACHE_BIN_DIR, f);
          const isCompiler =
            f.endsWith("-gcc") ||
            f.endsWith("-g++") ||
            f.endsWith("-c++") ||
            f === "gcc" ||
            f === "g++";
          try {
            if (fs.existsSync(linkPath)) {
              fs.unlinkSync(linkPath);
            }
            if (isCompiler) {
              fs.symlinkSync(CCACHE, linkPath);
              // Provide direct un-wrapped real compiler binary for linker bypass
              const realLinkPath = path.join(CCACHE_BIN_DIR, `${f}-real`);
              try {
                if (fs.existsSync(realLinkPath)) fs.unlinkSync(realLinkPath);
                fs.symlinkSync(target, realLinkPath);
              } catch (_) {}
            } else {
              fs.symlinkSync(target, linkPath);
            }
          } catch (_) {}
        }
      } catch (_) {}
    }

    ccacheToolchainInitialized = true;
    return true;
  } catch (err) {
    log.warn("compiler", "Failed to configure ccache toolchain wrappers", { error: err.message });
    return false;
  }
}

/**
 * Samples current ccache direct and preprocessed hit counters.
 */
export async function getCcacheStats() {
  if (!CCACHE || !fs.existsSync(CCACHE)) return null;
  return new Promise((resolve) => {
    const child = spawn(CCACHE, ["--print-stats", "--format", "json"], {
      env: { ...process.env, CCACHE_DIR },
    });
    let out = "";
    child.stdout.on("data", (d) => (out += d.toString()));
    child.on("close", (code) => {
      if (code === 0 && out.trim()) {
        try {
          const parsed = JSON.parse(out);
          const hits = (parsed.direct_cache_hit || 0) + (parsed.preprocessed_cache_hit || 0);
          const misses = parsed.cache_miss || 0;
          return resolve({ hits, misses });
        } catch (_) {}
      }
      resolve(null);
    });
    child.on("error", () => resolve(null));
  });
}

export const UPLOAD_ONLY_OPTIONS = new Set([
  "UploadSpeed",
  "uploadspeed",
  "baud",
  "EraseFlash",
  "eraseflash",
  "JTAGAdapter",
  "jtagadapter",
]);

/**
 * Normalizes an FQBN to a canonical compilation form, filtering out
 * upload-only or flashing parameters that have no effect on code generation.
 */
export function normalizeCompileFqbn(fullFqbn) {
  if (!fullFqbn) return "default";
  const parts = fullFqbn.split(":");
  const baseFqbn = parts.slice(0, 3).join(":");
  if (parts.length <= 3) return baseFqbn;

  const optsStr = parts.slice(3).join(":");
  const filteredPairs = [];
  for (const pair of optsStr.split(",")) {
    const [k, v] = pair.split("=");
    if (k && v && !UPLOAD_ONLY_OPTIONS.has(k)) {
      filteredPairs.push(`${k}=${v}`);
    }
  }
  filteredPairs.sort();
  return filteredPairs.length > 0 ? `${baseFqbn}:${filteredPairs.join(",")}` : baseFqbn;
}

export function getCoreKey(fqbn) {
  const norm = normalizeCompileFqbn(fqbn);
  return norm.replace(/[^a-zA-Z0-9_-]/g, "_");
}

export function getBuildDir(fqbn = "default") {
  const normFqbn = normalizeCompileFqbn(fqbn);
  const safeName = (normFqbn || "default").replace(/[^a-zA-Z0-9_-]/g, "_");
  const bDir = path.join(BUILDS_BASE_DIR, safeName);
  if (!fs.existsSync(bDir)) {
    fs.mkdirSync(bDir, { recursive: true });
  }
  return bDir;
}

/**
 * Seeds a build directory with a precompiled core archive from global cache if missing.
 */
export async function seedPrecompiledCore(fqbn, buildDir) {
  try {
    const targetCoreDir = path.join(buildDir, "core");
    const targetCoreArchive = path.join(targetCoreDir, "core.a");
    if (fs.existsSync(targetCoreArchive)) {
      return true;
    }

    const coreKey = getCoreKey(fqbn);
    const cachedCoreDir = path.join(CORES_DIR, coreKey, "core");
    const cachedCoreArchive = path.join(cachedCoreDir, "core.a");

    if (fs.existsSync(cachedCoreArchive)) {
      await fs.promises.mkdir(targetCoreDir, { recursive: true });
      await fs.promises.cp(cachedCoreDir, targetCoreDir, { recursive: true });

      const cachedCommands = path.join(CORES_DIR, coreKey, "compile_commands.json");
      const targetCommands = path.join(buildDir, "compile_commands.json");
      if (fs.existsSync(cachedCommands) && !fs.existsSync(targetCommands)) {
        await fs.promises.copyFile(cachedCommands, targetCommands);
      }

      const cachedOptions = path.join(CORES_DIR, coreKey, "build.options.json");
      const targetOptions = path.join(buildDir, "build.options.json");
      if (fs.existsSync(cachedOptions) && !fs.existsSync(targetOptions)) {
        await fs.promises.copyFile(cachedOptions, targetOptions);
      }

      log.info("compiler", "Seeded precompiled core archive from global cache", { fqbn, coreKey });
      return true;
    }

    // Fallback: check base board FQBN core
    const baseCoreKey = getCoreKey(fqbn.split(":").slice(0, 3).join(":"));
    if (baseCoreKey !== coreKey) {
      const baseCachedCoreArchive = path.join(CORES_DIR, baseCoreKey, "core", "core.a");
      if (fs.existsSync(baseCachedCoreArchive)) {
        await fs.promises.mkdir(targetCoreDir, { recursive: true });
        await fs.promises.cp(path.join(CORES_DIR, baseCoreKey, "core"), targetCoreDir, { recursive: true });
        log.info("compiler", "Seeded precompiled core archive from base board cache", { fqbn, baseCoreKey });
        return true;
      }
    }
  } catch (err) {
    log.warn("compiler", "Failed to seed precompiled core", { error: err.message });
  }
  return false;
}

/**
 * Saves a successfully compiled core directory into the global precompiled core cache.
 */
export async function savePrecompiledCore(fqbn, buildDir) {
  try {
    const targetCoreDir = path.join(buildDir, "core");
    const targetCoreArchive = path.join(targetCoreDir, "core.a");
    if (!fs.existsSync(targetCoreArchive)) return;

    const coreKey = getCoreKey(fqbn);
    const cachedCoreDir = path.join(CORES_DIR, coreKey, "core");
    await fs.promises.mkdir(path.dirname(cachedCoreDir), { recursive: true });
    await fs.promises.cp(targetCoreDir, cachedCoreDir, { recursive: true });

    const targetCommands = path.join(buildDir, "compile_commands.json");
    if (fs.existsSync(targetCommands)) {
      await fs.promises.copyFile(targetCommands, path.join(CORES_DIR, coreKey, "compile_commands.json"));
    }
    const targetOptions = path.join(buildDir, "build.options.json");
    if (fs.existsSync(targetOptions)) {
      await fs.promises.copyFile(targetOptions, path.join(CORES_DIR, coreKey, "build.options.json"));
    }

    const baseCoreKey = getCoreKey(fqbn.split(":").slice(0, 3).join(":"));
    const baseCachedDir = path.join(CORES_DIR, baseCoreKey, "core");
    if (!fs.existsSync(baseCachedDir)) {
      await fs.promises.mkdir(path.dirname(baseCachedDir), { recursive: true });
      await fs.promises.cp(targetCoreDir, baseCachedDir, { recursive: true });
    }

    log.info("compiler", "Persisted precompiled core to global cache", { fqbn, coreKey });
  } catch (err) {
    log.warn("compiler", "Failed to persist precompiled core", { error: err.message });
  }
}

export function extractPrototypes(src) {
  const fnRegex = /^[ \t]*([a-zA-Z0-9_*&]+[ \t]+)+([a-zA-Z0-9_]+)\s*\(([^)]*)\)\s*\{/gm;
  const protos = [];
  let m;
  while ((m = fnRegex.exec(src)) !== null) {
    const name = m[2];
    if (!["if", "while", "for", "switch", "catch"].includes(name)) {
      protos.push(m[0].trim().replace(/\s*\{$/, "") + ";");
    }
  }
  return protos.join("\n");
}

export function runArduinoCliCompile(fqbn, onLog, mode = "verify") {
  return new Promise(async (resolve) => {
    const startTime = Date.now();
    const buildDir = getBuildDir(fqbn);
    await seedPrecompiledCore(fqbn, buildDir);
    const args = [
      "compile",
      "--fqbn",
      fqbn,
      SKETCH_DIR,
      "--build-path",
      buildDir,
      "--jobs",
      String(os.cpus().length || 4),
      "--no-color",
    ];

    if (mode === "verify" && (fqbn.startsWith("esp32:") || fqbn.startsWith("esp8266:"))) {
      // Tier 1 optimization: skip writing the 4MB padded flash image to disk on verify
      args.push("--build-property", "recipe.hooks.objcopy.postobjcopy.3.pattern=true");
    }

    const hasCcache = ensureCcacheToolchain();
    if (hasCcache) {
      args.push("--build-property", `compiler.path=${CCACHE_BIN_DIR}/`);
      // Linker bypass: prevent ccache from wrapping the heavy link step
      if (fqbn.startsWith("arduino:avr")) {
        args.push("--build-property", "compiler.c.elf.cmd=avr-gcc-real");
      } else if (fqbn.startsWith("esp32:") || fqbn.startsWith("esp8266:")) {
        args.push("--build-property", "compiler.c.elf.cmd={compiler.prefix}g++-real");
      } else {
        args.push("--build-property", "compiler.c.elf.cmd={compiler.c.elf.cmd}-real");
      }
    }

    const extraPath = toolchainPaths.length > 0 ? `:${toolchainPaths.join(":")}` : "";
    const env = {
      ...process.env,
      CCACHE_DIR,
      CCACHE_MAXSIZE: "5G",
      CCACHE_SLOPPINESS: "file_stat_matches,include_file_mtime,pch_defines,time_macros",
      PATH: `${CCACHE_BIN_DIR}:${HOME}/.local/bin${extraPath}:${process.env.PATH}`,
    };
    const child = spawn(ARDUINO_CLI, args, { env });
    let stdout = "";
    let stderr = "";
    let isSettled = false;

    // 300-second watchdog timer to guarantee compilation never freezes indefinitely
    const watchdogTimer = setTimeout(() => {
      if (!isSettled) {
        isSettled = true;
        try {
          child.kill("SIGKILL");
        } catch (e) {}
        resolve({
          success: false,
          elapsed_ms: Date.now() - startTime,
          stdout,
          stderr: "Compilation timed out after 300 seconds. Process aborted safely.",
          ccache_used: false,
          cached_build: false,
          turbo: false,
        });
      }
    }, 300000);

    const handleChunk = (chunk, isErr) => {
      const text = chunk.toString();
      if (isErr) stderr += text;
      else stdout += text;
      if (onLog) {
        const lines = text.split("\n").filter((l) => l.trim().length > 0);
        for (const l of lines) onLog(l, isErr ? "stderr" : "stdout");
      }
    };

    child.stdout.on("data", (d) => handleChunk(d, false));
    child.stderr.on("data", (d) => handleChunk(d, true));

    child.on("error", (err) => {
      if (isSettled) return;
      isSettled = true;
      clearTimeout(watchdogTimer);
      resolve({
        success: false,
        elapsed_ms: Date.now() - startTime,
        stdout,
        stderr: String(err.message || err),
        ccache_used: false,
        cached_build: false,
        turbo: false,
      });
    });
    child.on("close", (exitCode) => {
      if (isSettled) return;
      isSettled = true;
      clearTimeout(watchdogTimer);
      const elapsed = Date.now() - startTime;
      if (exitCode === 0) {
        savePrecompiledCore(fqbn, buildDir).catch(() => {});
      }
      resolve({
        success: exitCode === 0,
        elapsed_ms: elapsed,
        stdout,
        stderr,
        ccache_used: Boolean(hasCcache),
        cached_build: stdout.includes("Using previously compiled file") || elapsed < 3000,
        turbo: false,
      });
    });
  });
}

export function getPchKey(fqbn) {
  const norm = normalizeCompileFqbn(fqbn);
  return norm.replace(/[^a-zA-Z0-9_-]/g, "_");
}

export function ensureBoardGch(fqbn) {
  return new Promise((resolve) => {
    const pchKey = getPchKey(fqbn);
    const boardCacheDir = path.join(CACHE_BASE, pchKey);
    fs.mkdirSync(boardCacheDir, { recursive: true });

    const fastH = path.join(boardCacheDir, "fast_arduino.h");
    const fastGch = path.join(boardCacheDir, "fast_arduino.h.gch");
    const fastGchTmp = path.join(boardCacheDir, "fast_arduino.h.gch.tmp");

    if (fs.existsSync(fastH) && fs.existsSync(fastGch)) {
      return resolve(true);
    }

    const buildDir = getBuildDir(fqbn);
    const compileCommandsPath = path.join(buildDir, "compile_commands.json");
    if (!fs.existsSync(compileCommandsPath)) return resolve(false);

    try {
      const cmds = JSON.parse(fs.readFileSync(compileCommandsPath, "utf-8"));
      if (!Array.isArray(cmds) || cmds.length === 0) return resolve(false);

      const sketchCmd = cmds.find(
        (c) => c && c.file && (c.file.includes("sketch.ino") || c.file.endsWith(".ino.cpp"))
      ) || cmds.find((c) => c && c.file && c.file.endsWith(".cpp")) || cmds[0];
      if (!sketchCmd || !sketchCmd.arguments) return resolve(false);

      const sketchCppPath = path.join(buildDir, "sketch/sketch.ino.cpp");
      const filteredArgs = sketchCmd.arguments.filter(
        (a) => a !== sketchCppPath && a !== "-o" && a !== `${sketchCppPath}.o`
      );

      fs.writeFileSync(fastH, "#pragma once\n#include <Arduino.h>\n", "utf-8");

      const gchArgs = [...filteredArgs, "-x", "c++-header", fastH, "-o", fastGchTmp];
      const executable = gchArgs[0];
      const spawnArgs = gchArgs.slice(1);

      ensureCcacheToolchain();
      const extraPath = toolchainPaths.length > 0 ? `:${toolchainPaths.join(":")}` : "";
      const child = spawn(executable, spawnArgs, {
        env: {
          ...process.env,
          CCACHE_DIR,
          PATH: `${CCACHE_BIN_DIR}:${HOME}/.local/bin${extraPath}:${process.env.PATH}`,
        },
      });
      child.on("close", (exitCode) => {
        if (exitCode === 0 && fs.existsSync(fastGchTmp)) {
          try {
            fs.renameSync(fastGchTmp, fastGch);
            log.info("compiler", "Generated precompiled header (GCH)", { fqbn, pchKey });
            resolve(true);
          } catch (e) {
            resolve(false);
          }
        } else {
          try {
            fs.unlinkSync(fastGchTmp);
          } catch (e) {}
          resolve(false);
        }
      });
      child.on("error", () => {
        try {
          fs.unlinkSync(fastGchTmp);
        } catch (e) {}
        resolve(false);
      });
    } catch (e) {
      resolve(false);
    }
  });
}

export async function runTurboCompile(code, fqbn, mode = "verify", files = [], onLog) {
  const toFileString = (val) => {
    if (typeof val === "string") return val;
    if (val && typeof val.content === "string") return val.content;
    if (Buffer.isBuffer(val)) return val.toString("utf-8");
    return val !== undefined && val !== null ? String(val) : "";
  };

  const writeFileIfChanged = async (filePath, content) => {
    try {
      const existing = await fs.promises.readFile(filePath, "utf-8");
      if (existing === content) return false;
    } catch (_) {}
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, content, "utf-8");
    return true;
  };

  // Determine primary .ino file from files list or active code
  let primaryInoFile = null;
  if (Array.isArray(files) && files.length > 0) {
    primaryInoFile = files.find((f) => f && f.name && f.name.endsWith(".ino"));
  }

  // The primary sketch file in SKETCH_DIR must always be named sketch.ino
  const sketchPath = path.join(SKETCH_DIR, "sketch.ino");
  const mainSketchCode = toFileString(primaryInoFile ? primaryInoFile.content : code);
  await writeFileIfChanged(sketchPath, mainSketchCode);

  // Keep track of valid current files in SKETCH_DIR
  const activeFileNames = new Set(["sketch.ino"]);

  // Write all additional sketch files (headers, C++ files, secondary .ino)
  if (Array.isArray(files)) {
    const extraWrites = [];
    for (const f of files) {
      if (f && f.name && f !== primaryInoFile && f.name !== "sketch.ino") {
        const dest = path.join(SKETCH_DIR, f.name);
        extraWrites.push(writeFileIfChanged(dest, toFileString(f.content)));
        activeFileNames.add(f.name);
      }
    }
    if (extraWrites.length > 0) {
      await Promise.all(extraWrites);
    }
  }

  // Clean up any stale files from previous sketches in SKETCH_DIR
  try {
    const existing = await fs.promises.readdir(SKETCH_DIR);
    const cleanupOps = [];
    for (const name of existing) {
      if (!activeFileNames.has(name) && !name.startsWith(".")) {
        cleanupOps.push(fs.promises.unlink(path.join(SKETCH_DIR, name)).catch(() => {}));
      }
    }
    if (cleanupOps.length > 0) {
      await Promise.all(cleanupOps);
    }
  } catch (e) {}

  const hasMultiSources = Array.isArray(files) && files.some(
    (f) => f && f.name && (f.name.endsWith(".cpp") || f.name.endsWith(".c") || f.name.endsWith(".cc"))
  );

  const buildDir = getBuildDir(fqbn);
  await seedPrecompiledCore(fqbn, buildDir);
  const buildOptionsPath = path.join(buildDir, "build.options.json");
  const compileCommandsPath = path.join(buildDir, "compile_commands.json");

  let canUseTurbo = false;
  let targetCompileArgs = null;

  if (!hasMultiSources && fs.existsSync(buildOptionsPath) && fs.existsSync(compileCommandsPath)) {
    try {
      const options = JSON.parse(fs.readFileSync(buildOptionsPath, "utf-8"));
      const normOpt = normalizeCompileFqbn(options.fqbn);
      const normTarget = normalizeCompileFqbn(fqbn);
      if (normOpt === normTarget) {
        const cmds = JSON.parse(fs.readFileSync(compileCommandsPath, "utf-8"));
        if (Array.isArray(cmds) && cmds.length > 0) {
          const sketchCmd = cmds.find(
            (c) => c && c.file && (c.file.includes("sketch.ino") || c.file.endsWith(".ino.cpp"))
          ) || cmds.find((c) => c && c.file && c.file.endsWith(".cpp")) || cmds[0];

          if (sketchCmd && sketchCmd.arguments && sketchCmd.arguments.length > 0) {
            canUseTurbo = true;
            targetCompileArgs = sketchCmd.arguments;
          }
        }
      }
    } catch (e) {}
  }

  if (mode === "full" || !canUseTurbo || hasMultiSources) {
    const res = await runArduinoCliCompile(fqbn, onLog, mode);
    if (res.success) {
      ensureBoardGch(fqbn).catch(() => {});
    }
    return res;
  }

  const startTime = Date.now();
  const sketchCppPath = path.join(buildDir, "sketch/sketch.ino.cpp");
  await fs.promises.mkdir(path.dirname(sketchCppPath), { recursive: true });

  const protos = extractPrototypes(code);
  const hasArduinoHeader = /#include\s*[<"]Arduino\.h[>"]/.test(code);
  const arduinoInclude = hasArduinoHeader ? "" : "#include <Arduino.h>\n";
  const cppContent = `${arduinoInclude}#line 1 "${sketchPath}"\n${protos}\n#line 1 "${sketchPath}"\n${code}\n`;
  await fs.promises.writeFile(sketchCppPath, cppContent, "utf-8");

  const pchKey = getPchKey(fqbn);
  const boardCacheDir = path.join(CACHE_BASE, pchKey);
  const fastH = path.join(boardCacheDir, "fast_arduino.h");
  const fastGch = path.join(boardCacheDir, "fast_arduino.h.gch");

  const filteredArgs = targetCompileArgs.filter(
    (a) => a !== sketchCppPath && a !== "-o" && a !== `${sketchCppPath}.o`
  );

  const finalArgs = [...filteredArgs];
  if (fs.existsSync(fastH) && fs.existsSync(fastGch)) {
    finalArgs.push("-include", fastH);
  }
  finalArgs.push(sketchCppPath, "-o", `${sketchCppPath}.o`);

  const ccacheBin = fs.existsSync(`${HOME}/.local/bin/ccache`) ? `${HOME}/.local/bin/ccache` : null;
  const executable = ccacheBin || finalArgs[0];
  const spawnArgs = ccacheBin ? finalArgs : finalArgs.slice(1);

  ensureCcacheToolchain();
  const extraPath = toolchainPaths.length > 0 ? `:${toolchainPaths.join(":")}` : "";
  const env = {
    ...process.env,
    CCACHE_DIR,
    CCACHE_MAXSIZE: "5G",
    CCACHE_SLOPPINESS: "time_macros,include_file_mtime,pch_defines",
    PATH: `${CCACHE_BIN_DIR}:${HOME}/.local/bin${extraPath}:${process.env.PATH}`,
  };

  return new Promise((resolve) => {
    const child = spawn(executable, spawnArgs, { env });
    let stdout = "";
    let stderr = "";
    let isSettled = false;

    // 15-second watchdog for fast turbo compiles
    const turboTimeout = setTimeout(() => {
      if (!isSettled) {
        isSettled = true;
        try {
          child.kill("SIGKILL");
        } catch (e) {}
        resolve({
          success: false,
          elapsed_ms: Date.now() - startTime,
          stdout,
          stderr: "Compiler verification timed out after 15 seconds.",
          ccache_used: false,
          cached_build: false,
          turbo: true,
        });
      }
    }, 15000);

    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", (err) => {
      if (isSettled) return;
      isSettled = true;
      clearTimeout(turboTimeout);
      resolve({
        success: false,
        elapsed_ms: Date.now() - startTime,
        stdout,
        stderr: String(err.message || err),
        ccache_used: false,
        cached_build: false,
        turbo: false,
      });
    });

    child.on("close", async (exitCode) => {
      if (isSettled) return;
      isSettled = true;
      clearTimeout(turboTimeout);
      const elapsed = Date.now() - startTime;

      if (exitCode === 0) {
        return resolve({
          success: true,
          elapsed_ms: elapsed,
          stdout,
          stderr,
          ccache_used: Boolean(ccacheBin),
          cached_build: elapsed < 500,
          turbo: true,
        });
      }

      // If missing a header, fall back to arduino-cli build to discover newly referenced libraries
      if (stderr.includes("No such file or directory") && (stderr.includes(".h") || stderr.includes(".hpp"))) {
        const fullRes = await runArduinoCliCompile(fqbn, onLog, mode);
        if (fullRes.success) {
          ensureBoardGch(fqbn).catch(() => {});
        }
        return resolve(fullRes);
      }

      resolve({
        success: false,
        elapsed_ms: elapsed,
        stdout,
        stderr,
        ccache_used: Boolean(ccacheBin),
        cached_build: false,
        turbo: true,
      });
    });
  });
}

// State synchronization: AsyncMutex compile queue, in-flight deduplicator, and LRU build hash cache
const compileMutex = new AsyncMutex();
const inFlightCompiles = new Map(); // dedupeKey -> Promise<result>
const buildHashCache = new LRUMap(16); // fqbn -> inputHash

export function getCompileLockState() {
  return compileMutex.isLocked;
}

export function getCompileQueue() {
  return compileMutex.waitForUnlock();
}

export function hashBuildInputs(code, fqbn, files) {
  const h = crypto.createHash("sha256");
  h.update(fqbn || "");
  h.update("\x00");
  h.update(typeof code === "string" ? code : "");
  if (Array.isArray(files)) {
    for (const f of files) {
      if (f && f.name) {
        h.update("\x00" + f.name + "\x00");
        h.update(typeof f.content === "string" ? f.content : "");
      }
    }
  }
  return h.digest("hex");
}

export function queueCompile(code, fqbn, mode = "verify", files = [], onLog, isPriorityUser = false) {
  const inputHash = hashBuildInputs(code, fqbn, files);
  const dedupeKey = `${fqbn}:${mode}:${inputHash}`;

  // In-flight deduplication: return the active Promise if identical compile is in progress
  if (inFlightCompiles.has(dedupeKey)) {
    log.info("compiler", "Deduplicating in-flight compile request", { fqbn, mode });
    return inFlightCompiles.get(dedupeKey);
  }

  const runTask = async () => {
    // Instant Verify fast-path: if code and all files match existing valid build binary, return immediately
    if (mode === "verify") {
      const upToDate = await isBuildUpToDate(code, fqbn, files);
      if (upToDate) {
        log.info("compiler", "Instant verify cache hit: sketch is up to date", { fqbn });
        return {
          success: true,
          elapsed_ms: 12,
          stdout: "Sketch is up to date. Using cached build binary (0ms recompilation).",
          stderr: "",
          ccache_used: true,
          cached_build: true,
          turbo: true,
        };
      }
    }

    const timer = startTimer();
    log.info("compiler", "Compilation started", { fqbn, mode });
    const statsBefore = await getCcacheStats();
    const result = await runTurboCompile(code, fqbn, mode, files, onLog);
    const statsAfter = await getCcacheStats();

    if (statsBefore && statsAfter) {
      const hitDelta = statsAfter.hits - statsBefore.hits;
      result.ccache_hit = hitDelta > 0;
    }

    if (result.success) {
      buildHashCache.set(fqbn, inputHash);
      try {
        const manifestPath = path.join(getBuildDir(fqbn), "build_manifest.json");
        await fs.promises.writeFile(
          manifestPath,
          JSON.stringify({ fqbn, inputHash, timestamp: Date.now() }),
          "utf-8"
        );
      } catch (_) {}
    }
    log.info("compiler", "Compilation completed", {
      fqbn,
      mode,
      success: result.success,
      durationMs: timer(),
      cachedBuild: result.cached_build || false,
      turbo: result.turbo || false,
    });
    return result;
  };

  const compilePromise = compileMutex.run(runTask).finally(() => {
    inFlightCompiles.delete(dedupeKey);
  });

  inFlightCompiles.set(dedupeKey, compilePromise);
  return compilePromise;
}

export async function isBuildUpToDate(code, fqbn, files = []) {
  try {
    const inputHash = hashBuildInputs(code, fqbn, files);
    const buildDir = getBuildDir(fqbn);

    // Fast path 1: Check memory LRU cache for this FQBN
    if (buildHashCache.get(fqbn) === inputHash) {
      // Confirm binary still physically exists on disk
      const binPath = path.join(buildDir, "sketch.ino.bin");
      const hexPath = path.join(buildDir, "sketch.ino.hex");
      const elfPath = path.join(buildDir, "sketch.ino.elf");
      if (fs.existsSync(binPath) || fs.existsSync(hexPath) || fs.existsSync(elfPath)) {
        return true;
      }
      buildHashCache.delete(fqbn);
    }

    // Fast path 2: Check persistent build manifest from disk (survives app exit / reboot)
    const manifestPath = path.join(buildDir, "build_manifest.json");
    if (fs.existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(await fs.promises.readFile(manifestPath, "utf-8"));
        if (manifest.inputHash === inputHash && manifest.fqbn === fqbn) {
          const binPath = path.join(buildDir, "sketch.ino.bin");
          const hexPath = path.join(buildDir, "sketch.ino.hex");
          const elfPath = path.join(buildDir, "sketch.ino.elf");
          if (fs.existsSync(binPath) || fs.existsSync(hexPath) || fs.existsSync(elfPath)) {
            buildHashCache.set(fqbn, inputHash);
            return true;
          }
        }
      } catch (_) {}
    }

    // Slow path: check build.options.json fqbn match
    const buildOptionsPath = path.join(buildDir, "build.options.json");
    if (!fs.existsSync(buildOptionsPath)) return false;

    try {
      const optsRaw = await fs.promises.readFile(buildOptionsPath, "utf-8");
      const opts = JSON.parse(optsRaw);
      const normOpt = normalizeCompileFqbn(opts.fqbn);
      const normTarget = normalizeCompileFqbn(fqbn);
      if (normOpt !== normTarget) return false;
    } catch {
      return false;
    }

    // Determine primary .ino content
    let primaryInoFile = null;
    if (Array.isArray(files) && files.length > 0) {
      primaryInoFile = files.find((f) => f && f.name && f.name.endsWith(".ino"));
    }
    const targetMainCode = typeof (primaryInoFile?.content) === "string"
      ? primaryInoFile.content
      : (code || "");

    // Compare sketch.ino on disk
    const sketchPath = path.join(SKETCH_DIR, "sketch.ino");
    if (!fs.existsSync(sketchPath)) return false;
    const existingCode = await fs.promises.readFile(sketchPath, "utf-8");
    if (existingCode !== targetMainCode) return false;

    // Compare additional files asynchronously via Promise.all
    if (Array.isArray(files) && files.length > 0) {
      const checkTasks = files
        .filter((f) => f && f.name && f.name !== "sketch.ino")
        .map(async (f) => {
          if (f.name.endsWith(".ino") && f.content === targetMainCode) return true;
          const filePath = path.join(SKETCH_DIR, f.name);
          try {
            const fileContent = typeof f.content === "string" ? f.content : (f.content?.content || "");
            const diskContent = await fs.promises.readFile(filePath, "utf-8");
            return diskContent === fileContent;
          } catch {
            return false;
          }
        });
      const checkResults = await Promise.all(checkTasks);
      if (checkResults.some((match) => !match)) return false;
    }

    // Confirm binary exists
    const binPath = path.join(buildDir, "sketch.ino.bin");
    const hexPath = path.join(buildDir, "sketch.ino.hex");
    const elfPath = path.join(buildDir, "sketch.ino.elf");
    if (!fs.existsSync(binPath) && !fs.existsSync(hexPath) && !fs.existsSync(elfPath)) return false;

    // Update LRU cache and persistent manifest so future checks for this FQBN are instant
    buildHashCache.set(fqbn, inputHash);
    try {
      await fs.promises.writeFile(
        manifestPath,
        JSON.stringify({ fqbn, inputHash, timestamp: Date.now() }),
        "utf-8"
      );
    } catch (_) {}
    return true;
  } catch {
    return false;
  }
}

export async function handleCompileRequest(req, res) {
  const { code, fqbn, mode, files } = await readBody(req);
  if (!code || !fqbn) {
    return sendJson(res, { success: false, error: "Missing code or fqbn parameter" }, 400);
  }
  let validFqbn;
  try {
    validFqbn = validateFqbn(fqbn);
  } catch (err) {
    return sendJson(res, { success: false, error: err.message }, 400);
  }

  try {
    const result = await queueCompile(code, validFqbn, mode || "verify", files, undefined, true);
    return sendJson(res, result);
  } catch (e) {
    return sendJson(res, { success: false, error: String(e.message || e) }, 500);
  }
}

export async function handlePrewarmRequest(req, res) {
  const { fqbn, code, files } = await readBody(req);
  if (!fqbn) {
    return sendJson(res, { success: false, error: "Missing fqbn parameter" }, 400);
  }
  let validFqbn;
  try {
    validFqbn = validateFqbn(fqbn);
  } catch (err) {
    return sendJson(res, { success: false, error: err.message }, 400);
  }
  let currentCode = code;
  if (!currentCode) {
    try {
      currentCode = await fs.promises.readFile(path.join(SKETCH_DIR, "sketch.ino"), "utf-8");
    } catch {
      currentCode = "void setup(){}\nvoid loop(){}\n";
    }
  }
  const alreadyBuilt = await isBuildUpToDate(currentCode, validFqbn, files || []);
  if (alreadyBuilt) {
    ensureBoardGch(validFqbn).catch(() => {});
    return sendJson(res, { success: true, ready: true, cached: true });
  }
  // Seed precompiled core and launch background compilation
  seedPrecompiledCore(validFqbn, getBuildDir(validFqbn)).catch(() => {});
  queueCompile(currentCode, validFqbn, "full", files || []).then(() => {
    ensureBoardGch(validFqbn).catch(() => {});
  }).catch(() => {});
  return sendJson(res, { success: true, backgroundStarted: true });
}
