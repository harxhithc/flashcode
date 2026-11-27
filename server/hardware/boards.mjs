import { exec, spawn } from "node:child_process";
import { promisify } from "node:util";
const execAsync = promisify(exec);
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ARDUINO_CLI, readBody, sendJson } from "../utils.mjs";
import { log, startTimer } from "../utils/logger.mjs";
import { validateCoreId, validateFqbn } from "../utils/validate.mjs";

export const SUPPORTED_BOARDS = [
  // Arduino AVR Family
  { name: "Arduino Uno", fqbn: "arduino:avr:uno", architecture: "avr" },
  { name: "Arduino Nano", fqbn: "arduino:avr:nano", architecture: "avr" },
  { name: "Arduino Mega or Mega 2560", fqbn: "arduino:avr:mega", architecture: "avr" },
  { name: "Arduino Leonardo", fqbn: "arduino:avr:leonardo", architecture: "avr" },
  { name: "Arduino Micro", fqbn: "arduino:avr:micro", architecture: "avr" },
  { name: "Arduino Pro or Pro Mini", fqbn: "arduino:avr:pro", architecture: "avr" },
  { name: "Arduino Nano Every", fqbn: "arduino:megaavr:nona4809", architecture: "megaavr" },
  { name: "Arduino Duemilanove or Diecimila", fqbn: "arduino:avr:diecimila", architecture: "avr" },
  { name: "Arduino Mini", fqbn: "arduino:avr:mini", architecture: "avr" },
  { name: "Arduino Ethernet", fqbn: "arduino:avr:ethernet", architecture: "avr" },
  { name: "Arduino Fio", fqbn: "arduino:avr:fio", architecture: "avr" },
  { name: "LilyPad Arduino", fqbn: "arduino:avr:lilypad", architecture: "avr" },
  { name: "Arduino Esplora", fqbn: "arduino:avr:esplora", architecture: "avr" },
  { name: "Arduino Yún", fqbn: "arduino:avr:yun", architecture: "avr" },

  // Arduino SAMD & Renesas
  { name: "Arduino Uno R4 WiFi", fqbn: "arduino:renesas_uno:unor4wifi", architecture: "renesas_uno" },
  { name: "Arduino Uno R4 Minima", fqbn: "arduino:renesas_uno:minima", architecture: "renesas_uno" },
  { name: "Arduino Nano 33 IoT", fqbn: "arduino:samd:nano_33_iot", architecture: "samd" },
  { name: "Arduino Nano 33 BLE", fqbn: "arduino:mbed_nano:nano33ble", architecture: "mbed_nano" },
  { name: "Arduino Nano RP2040 Connect", fqbn: "arduino:mbed_nano:nanorp2040connect", architecture: "mbed_nano" },
  { name: "Arduino MKR WiFi 1010", fqbn: "arduino:samd:mkrwifi1010", architecture: "samd" },
  { name: "Arduino MKR 1000 WiFi", fqbn: "arduino:samd:mkr1000", architecture: "samd" },
  { name: "Arduino Zero", fqbn: "arduino:samd:arduino_zero_edbg", architecture: "samd" },

  // ESP32 Family
  { name: "ESP32 Dev Module", fqbn: "esp32:esp32:esp32", architecture: "esp32" },
  { name: "ESP32-S3 Dev Module", fqbn: "esp32:esp32:esp32s3", architecture: "esp32" },
  { name: "ESP32-C3 Dev Module", fqbn: "esp32:esp32:esp32c3", architecture: "esp32" },
  { name: "ESP32-C6 Dev Module", fqbn: "esp32:esp32:esp32c6", architecture: "esp32" },
  { name: "ESP32-S2 Dev Module", fqbn: "esp32:esp32:esp32s2", architecture: "esp32" },
  { name: "NodeMCU-32S", fqbn: "esp32:esp32:nodemcu-32s", architecture: "esp32" },
  { name: "Arduino Nano ESP32", fqbn: "esp32:esp32:nano_nora", architecture: "esp32" },
  { name: "AI Thinker ESP32-CAM", fqbn: "esp32:esp32:esp32cam", architecture: "esp32" },
  { name: "Seeed Studio XIAO ESP32C3", fqbn: "esp32:esp32:XIAO_ESP32C3", architecture: "esp32" },
  { name: "Seeed Studio XIAO ESP32S3", fqbn: "esp32:esp32:XIAO_ESP32S3", architecture: "esp32" },
  { name: "TTGO T-Beam", fqbn: "esp32:esp32:t-beam", architecture: "esp32" },
  { name: "Heltec WiFi LoRa 32", fqbn: "esp32:esp32:heltec_wifi_lora_32", architecture: "esp32" },
  { name: "M5Stack Core ESP32", fqbn: "esp32:esp32:m5stack-core-esp32", architecture: "esp32" },
  { name: "Adafruit Feather ESP32", fqbn: "esp32:esp32:featheresp32", architecture: "esp32" },

  // ESP8266 Family
  { name: "NodeMCU 1.0 (ESP-12E Module)", fqbn: "esp8266:esp8266:nodemcuv2", architecture: "esp8266" },
  { name: "NodeMCU 0.9 (ESP-12 Module)", fqbn: "esp8266:esp8266:nodemcu", architecture: "esp8266" },
  { name: "LOLIN(WEMOS) D1 R2 & mini", fqbn: "esp8266:esp8266:d1_mini", architecture: "esp8266" },
  { name: "LOLIN(WEMOS) D1 mini Pro", fqbn: "esp8266:esp8266:d1_mini_pro", architecture: "esp8266" },
  { name: "Generic ESP8266 Module", fqbn: "esp8266:esp8266:generic", architecture: "esp8266" },
  { name: "Adafruit Feather HUZZAH ESP8266", fqbn: "esp8266:esp8266:huzzah", architecture: "esp8266" },

  // Raspberry Pi RP2040 Family
  { name: "Raspberry Pi Pico", fqbn: "rp2040:rp2040:rpipico", architecture: "rp2040" },
  { name: "Raspberry Pi Pico W", fqbn: "rp2040:rp2040:rpipicow", architecture: "rp2040" },
  { name: "Seeed Studio XIAO RP2040", fqbn: "rp2040:rp2040:seeed_xiao_rp2040", architecture: "rp2040" },
  { name: "Adafruit Feather RP2040", fqbn: "rp2040:rp2040:adafruit_feather", architecture: "rp2040" },

  // STM32 Family
  { name: "Generic STM32F103C series (Blue Pill)", fqbn: "STMicroelectronics:stm32:GenF1:pnum=BLUEPILL_F103C8", architecture: "stm32" },
  { name: "Generic STM32F401 / STM32F411 (Black Pill)", fqbn: "STMicroelectronics:stm32:GenF4:pnum=BLACKPILL_F401CE", architecture: "stm32" },
  { name: "Nucleo-64", fqbn: "STMicroelectronics:stm32:Nucleo_64", architecture: "stm32" },

  // Teensy Family
  { name: "Teensy 4.0", fqbn: "teensy:avr:teensy40", architecture: "avr" },
  { name: "Teensy 4.1", fqbn: "teensy:avr:teensy41", architecture: "avr" },
];

export const POPULAR_BOARD_FQBNS = [
  "arduino:avr:uno",
  "arduino:avr:nano",
  "arduino:avr:mega",
  "esp32:esp32:esp32",
  "esp32:esp32:esp32s3",
  "esp32:esp32:esp32c3",
  "esp32:esp32:esp32c6",
  "esp32:esp32:nodemcu-32s",
  "esp32:esp32:nano_nora",
  "esp32:esp32:esp32cam",
  "esp32:esp32:XIAO_ESP32C3",
  "esp32:esp32:XIAO_ESP32S3",
  "arduino:avr:leonardo",
  "arduino:avr:pro",
  "arduino:avr:micro",
  "arduino:megaavr:nona4809",
  "arduino:renesas_uno:unor4wifi",
  "arduino:renesas_uno:minima",
  "arduino:samd:arduino_zero_edbg",
  "arduino:samd:mkrwifi1010",
  "arduino:samd:nano_33_iot",
  "esp8266:esp8266:nodemcuv2",
  "esp8266:esp8266:d1_mini",
  "esp8266:esp8266:generic",
  "rp2040:rp2040:rpipico",
  "rp2040:rp2040:rpipicow",
  "arduino:mbed_nano:nanorp2040connect",
  "STMicroelectronics:stm32:GenF1:pnum=BLUEPILL_F103C8",
  "STMicroelectronics:stm32:GenF4:pnum=BLACKPILL_F401CE",
  "teensy:avr:teensy40",
  "teensy:avr:teensy41",
];

let cachedAllBoards = null;
let cachedBoardsTimestamp = 0;
let cachedCorePlatforms = null;
let cachedCoresTimestamp = 0;
let _boardsRefreshPromise = null;
let _coresRefreshPromise = null;
const boardOptionsCache = new Map();
const BOARD_OPTIONS_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

export function invalidateBoardsCache() {
  cachedAllBoards = null;
  cachedCorePlatforms = null;
  boardOptionsCache.clear();
}

export function deriveBoardFamily(fqbn, name) {
  const lF = (fqbn || "").toLowerCase();
  const lN = (name || "").toLowerCase();
  if (lF.startsWith("esp32:") || lN.includes("esp32")) return "ESP32";
  if (lF.startsWith("arduino:avr") || (lF.startsWith("arduino:") && !lF.includes("esp32")) || lN.includes("arduino")) return "Arduino";
  if (lF.startsWith("esp8266:") || lN.includes("esp8266") || lN.includes("nodemcu")) return "ESP8266";
  if (lF.includes("rp2040") || lN.includes("rp2040") || lN.includes("pico")) return "RP2040";
  if (lF.includes("stm32") || lN.includes("stm32")) return "STM32";
  if (lF.includes("samd") || lN.includes("samd")) return "SAMD";
  return "Other";
}

export function deriveBoardArchitecture(fqbn) {
  const parts = (fqbn || "").split(":");
  if (parts.length >= 2) return parts[1];
  return "embedded";
}

export async function getRealAllBoards(force = false) {
  const now = Date.now();
  if (!force && cachedAllBoards && now - cachedBoardsTimestamp < 600000) {
    return cachedAllBoards;
  }
  // Promise coalescing: if a refresh is already in-flight, return the same Promise
  if (!force && _boardsRefreshPromise) return _boardsRefreshPromise;
  _boardsRefreshPromise = _doGetRealAllBoards(now).finally(() => { _boardsRefreshPromise = null; });
  return _boardsRefreshPromise;
}

async function _doGetRealAllBoards(now) {
  const timer = startTimer();
  try {
    const { stdout: raw } = await execAsync(`${ARDUINO_CLI} board listall --format json`, {
      maxBuffer: 50 * 1024 * 1024,
      timeout: 15000,
    });
    const parsed = JSON.parse(raw);
    const rawBoards = parsed.boards || [];
    const seen = new Set();
    const result = [];

    for (const b of rawBoards) {
      if (!b.fqbn || seen.has(b.fqbn)) continue;
      seen.add(b.fqbn);

      const family = deriveBoardFamily(b.fqbn, b.name);
      const architecture = b.platform?.architecture || deriveBoardArchitecture(b.fqbn);
      const platformName = b.platform?.release?.name || b.platform?.metadata?.id || family;
      const platformId = b.platform?.metadata?.id || b.fqbn.split(":").slice(0, 2).join(":");

      result.push({
        name: b.name,
        fqbn: b.fqbn,
        family,
        architecture,
        platformName,
        platformId,
        isInstalled: true,
      });
    }

    result.sort((a, b) => {
      const idxA = POPULAR_BOARD_FQBNS.indexOf(a.fqbn);
      const idxB = POPULAR_BOARD_FQBNS.indexOf(b.fqbn);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.name.localeCompare(b.name);
    });

    cachedAllBoards = result;
    cachedBoardsTimestamp = now;
    log.info("boards", "Queried board listall", { count: result.length, durationMs: timer() });
    return result;
  } catch (e) {
    log.error("boards", "Failed to query arduino-cli board listall", { error: e.message, durationMs: timer() });
    if (cachedAllBoards) return cachedAllBoards;
    return SUPPORTED_BOARDS.map((b) => ({
      name: b.name,
      fqbn: b.fqbn,
      family: deriveBoardFamily(b.fqbn, b.name),
      architecture: b.architecture,
      platformName: b.architecture,
      platformId: b.fqbn.split(":").slice(0, 2).join(":") || "arduino:avr",
      isInstalled: true,
    }));
  }
}

export async function getRealCorePlatforms(force = false) {
  const now = Date.now();
  if (!force && cachedCorePlatforms && now - cachedCoresTimestamp < 300000) {
    return cachedCorePlatforms;
  }
  if (!force && _coresRefreshPromise) return _coresRefreshPromise;
  _coresRefreshPromise = _doGetRealCorePlatforms(now).finally(() => { _coresRefreshPromise = null; });
  return _coresRefreshPromise;
}

async function _doGetRealCorePlatforms(now) {
  try {
    let installedList = [];
    try {
      const { stdout: rawInst } = await execAsync(`${ARDUINO_CLI} core list --format json`, {
        maxBuffer: 20 * 1024 * 1024,
        timeout: 10000,
      });
      const parsedInst = JSON.parse(rawInst);
      installedList = parsedInst.platforms || [];
    } catch (_) {}

    const installedMap = new Map();
    for (const p of installedList) {
      installedMap.set(p.id, p);
    }

    let searchList = [];
    try {
      const { stdout: rawSearch } = await execAsync(`${ARDUINO_CLI} core search --format json`, {
        maxBuffer: 50 * 1024 * 1024,
        timeout: 15000,
      });
      const parsedSearch = JSON.parse(rawSearch);
      searchList = parsedSearch.platforms || [];
    } catch (_) {}

    const merged = [];
    const seenIds = new Set();

    // 1. Installed Platforms
    for (const [id, inst] of installedMap.entries()) {
      seenIds.add(id);
      const releases = inst.releases ? Object.keys(inst.releases) : [];
      releases.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
      const latestRel = inst.releases ? inst.releases[releases[0]] : null;
      const boards = latestRel?.boards ? latestRel.boards.map((b) => ({ name: b.name, fqbn: b.fqbn })) : [];

      merged.push({
        id: inst.id,
        name: inst.name || (inst.id === "esp32:esp32" ? "esp32 by Espressif Systems" : inst.id === "arduino:avr" ? "Arduino AVR Boards" : inst.id),
        maintainer: inst.maintainer || (inst.id.startsWith("esp32") ? "Espressif Systems" : inst.id.startsWith("arduino") ? "Arduino" : "ESP8266 Community"),
        website: inst.website || "",
        email: inst.email || "",
        installed: true,
        installedVersion: inst.installed_version || releases[0] || "",
        latestVersion: inst.latest_version || releases[0] || "",
        availableVersions: releases,
        boards,
      });
    }

    // 2. Search Platforms (Not installed)
    for (const p of searchList) {
      if (seenIds.has(p.id)) continue;
      seenIds.add(p.id);

      const releases = p.releases ? Object.keys(p.releases) : [];
      releases.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
      const latestRel = p.releases ? p.releases[releases[0]] : null;
      const boards = latestRel?.boards ? latestRel.boards.map((b) => ({ name: b.name, fqbn: b.fqbn })) : [];

      merged.push({
        id: p.id,
        name: p.name || latestRel?.name || p.id,
        maintainer: p.maintainer || "Community",
        website: p.website || "",
        email: p.email || "",
        installed: false,
        installedVersion: "",
        latestVersion: p.latest_version || releases[0] || "",
        availableVersions: releases,
        boards,
      });
    }

    merged.sort((a, b) => {
      if (a.installed && !b.installed) return -1;
      if (!a.installed && b.installed) return 1;
      return a.name.localeCompare(b.name);
    });

    cachedCorePlatforms = merged;
    cachedCoresTimestamp = now;
    log.info("boards", "Queried core platforms", { count: merged.length });
    return merged;
  } catch (e) {
    log.error("boards", "Failed to query core platforms", { error: e.message });
    if (cachedCorePlatforms) return cachedCorePlatforms;
    return [];
  }
}

export async function handleGetBoards(req, res, url) {
  const force = url.searchParams.get("refresh") === "true";
  const all = await getRealAllBoards(force);
  const query = (url.searchParams.get("query") || "").trim().toLowerCase();
  const family = (url.searchParams.get("family") || "").trim();

  let filtered = all;
  if (family && family !== "All") {
    filtered = filtered.filter((b) => b.family.toLowerCase() === family.toLowerCase());
  }
  if (query) {
    filtered = filtered.filter((b) =>
      b.name.toLowerCase().includes(query) ||
      b.fqbn.toLowerCase().includes(query) ||
      b.architecture.toLowerCase().includes(query) ||
      b.platformName.toLowerCase().includes(query)
    );
  }

  return sendJson(res, filtered);
}

export async function handleGetCores(req, res, url) {
  const force = url.searchParams.get("refresh") === "true";
  const cores = await getRealCorePlatforms(force);
  const query = (url.searchParams.get("query") || "").trim().toLowerCase();
  let result = cores;
  if (query) {
    result = result.filter((c) =>
      c.name.toLowerCase().includes(query) ||
      c.id.toLowerCase().includes(query) ||
      c.maintainer.toLowerCase().includes(query) ||
      c.boards.some((b) => b.name.toLowerCase().includes(query))
    );
  }
  return sendJson(res, { platforms: result });
}

export async function handleInstallCore(req, res) {
  const { coreId, version } = await readBody(req);
  if (!coreId) {
    return sendJson(res, { success: false, error: "Missing coreId parameter" }, 400);
  }
  let validCoreId;
  try {
    validCoreId = validateCoreId(coreId);
  } catch (err) {
    return sendJson(res, { success: false, error: err.message }, 400);
  }
  const timer = startTimer();
  try {
    const target = version ? `${validCoreId}@${version}` : validCoreId;
    log.info("boards", `Installing core: ${target}`, { target });
    const { stdout } = await execAsync(`${ARDUINO_CLI} core install ${target}`, {
      maxBuffer: 50 * 1024 * 1024,
      timeout: 300000,
    });
    invalidateBoardsCache();
    log.info("boards", `Successfully installed core: ${target}`, { target, durationMs: timer() });
    return sendJson(res, { success: true, stdout, stderr: "" });
  } catch (e) {
    log.error("boards", "Core install failed", { coreId, error: e.message, durationMs: timer() });
    return sendJson(res, { success: false, error: e.message, stderr: e.stderr || e.message }, 500);
  }
}

export async function handleUninstallCore(req, res) {
  const { coreId } = await readBody(req);
  if (!coreId) {
    return sendJson(res, { success: false, error: "Missing coreId parameter" }, 400);
  }
  let validCoreId;
  try {
    validCoreId = validateCoreId(coreId);
  } catch (err) {
    return sendJson(res, { success: false, error: err.message }, 400);
  }
  const timer = startTimer();
  try {
    log.info("boards", `Uninstalling core: ${validCoreId}`, { coreId: validCoreId });
    const { stdout } = await execAsync(`${ARDUINO_CLI} core uninstall ${validCoreId}`, {
      maxBuffer: 20 * 1024 * 1024,
      timeout: 60000,
    });
    invalidateBoardsCache();
    log.info("boards", `Successfully uninstalled core: ${validCoreId}`, { coreId: validCoreId, durationMs: timer() });
    return sendJson(res, { success: true, stdout, stderr: "" });
  } catch (e) {
    log.error("boards", "Core uninstall failed", { coreId, error: e.message, durationMs: timer() });
    return sendJson(res, { success: false, error: e.message, stderr: e.stderr || e.message }, 500);
  }
}

export async function handleUpdateCoreIndex(req, res) {
  const timer = startTimer();
  try {
    log.info("boards", "Updating core package index");
    const { stdout } = await execAsync(`${ARDUINO_CLI} core update-index`, {
      maxBuffer: 20 * 1024 * 1024,
      timeout: 60000,
    });
    invalidateBoardsCache();
    log.info("boards", "Core package index updated", { durationMs: timer() });
    return sendJson(res, { success: true, stdout, stderr: "" });
  } catch (e) {
    log.error("boards", "Core update-index failed", { error: e.message, durationMs: timer() });
    return sendJson(res, { success: false, error: e.message, stderr: e.stderr || e.message }, 500);
  }
}

export async function handleGetCoreUrls(req, res) {
  try {
    const { stdout: dumpRaw } = await execAsync(`${ARDUINO_CLI} config dump --format json`);
    const dump = JSON.parse(dumpRaw);
    const urls = dump.config?.board_manager?.additional_urls || [];
    return sendJson(res, { urls });
  } catch (e) {
    return sendJson(res, { urls: [] });
  }
}

export async function handleSaveCoreUrls(req, res) {
  const { urls } = await readBody(req);
  if (!Array.isArray(urls)) {
    return sendJson(res, { success: false, error: "Expected urls array" }, 400);
  }
  try {
    const configPath = path.join(os.homedir(), ".arduino15", "arduino-cli.yaml");
    let yamlContent = "board_manager:\n    additional_urls:\n";
    for (const u of urls) {
      if (u && u.trim()) yamlContent += `        - ${u.trim()}\n`;
    }
    const tmpPath = configPath + ".tmp." + process.pid;
    await fs.promises.writeFile(tmpPath, yamlContent, "utf8");
    await fs.promises.rename(tmpPath, configPath);
    invalidateBoardsCache();
    return sendJson(res, { success: true, urls });
  } catch (e) {
    return sendJson(res, { success: false, error: e.message }, 500);
  }
}

export async function handleGetBoardOptions(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const rawFqbn = url.searchParams.get("fqbn");
  if (!rawFqbn) {
    return sendJson(res, { success: false, error: "Missing fqbn parameter" }, 400);
  }

  let validFqbn;
  try {
    validFqbn = validateFqbn(rawFqbn);
  } catch (err) {
    return sendJson(res, { success: false, error: err.message }, 400);
  }

  // Base FQBN (e.g. "esp32:esp32:esp32doit-devkit-v1") without existing option suffix
  const baseFqbn = validFqbn.split(":").slice(0, 3).join(":");

  const now = Date.now();
  const cached = boardOptionsCache.get(baseFqbn);
  if (cached && now - cached.timestamp < BOARD_OPTIONS_CACHE_TTL) {
    return sendJson(res, { success: true, fqbn: baseFqbn, options: cached.options });
  }

  const timer = startTimer();
  try {
    const { stdout } = await execAsync(`${ARDUINO_CLI} board details --fqbn ${baseFqbn} --format json`, {
      maxBuffer: 20 * 1024 * 1024,
      timeout: 10000,
    });

    const parsed = JSON.parse(stdout);
    const rawOptions = parsed.config_options || [];

    const options = rawOptions.map((opt) => {
      const values = (opt.values || []).map((val) => ({
        value: val.value,
        valueLabel: val.value_label || val.value,
        selected: Boolean(val.selected),
      }));

      const defaultItem = values.find((v) => v.selected) || values[0];

      return {
        option: opt.option,
        optionLabel: opt.option_label || opt.option,
        values,
        defaultValue: defaultItem ? defaultItem.value : "",
      };
    });

    boardOptionsCache.set(baseFqbn, { timestamp: now, options });
    log.info("boards", `Fetched board options for ${baseFqbn}`, { count: options.length, durationMs: timer() });

    return sendJson(res, { success: true, fqbn: baseFqbn, options });
  } catch (e) {
    log.warn("boards", `Failed to get board details for ${baseFqbn}: ${e.message}`);
    // If the board isn't installed or doesn't support options, return empty options array gracefully
    return sendJson(res, { success: true, fqbn: baseFqbn, options: [] });
  }
}

