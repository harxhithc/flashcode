import { exec } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ARDUINO_CLI, HOME, readBody, sendJson } from "../utils.mjs";
import { invalidateExamplesCache } from "../fs/dialogs.mjs";
import { log, startTimer } from "../utils/logger.mjs";

const execAsync = promisify(exec);
const __dirname = dirname(fileURLToPath(import.meta.url));

// 1. Curated Popular Libraries — externalized to JSON
export const POPULAR_LIBRARIES = JSON.parse(
  readFileSync(join(__dirname, "popular_libraries.json"), "utf8")
);

// Standard Arduino & C/C++ core header files that should not trigger missing library alerts
export const CORE_HEADERS = new Set([
  "arduino.h", "wifi.h", "wificlient.h", "wifiserver.h", "wifiudp.h",
  "spi.h", "wire.h", "eeprom.h", "fs.h", "sd.h", "spiffs.h", "littlefs.h",
  "bluetoothserial.h", "bledevice.h", "bleserver.h", "bleutils.h",
  "stdio.h", "stdlib.h", "string.h", "math.h", "stdint.h", "stdbool.h",
  "stddef.h", "stdarg.h", "stdalign.h", "inttypes.h", "float.h", "errno.h",
  "limits.h", "assert.h", "ctype.h", "time.h", "vector", "string", "map", "algorithm",
]);

// Map of common header names to their official Arduino library names
export const HEADER_TO_LIB_MAP = {
  "arduinojson.h": { lib: "ArduinoJson", desc: "Efficient C++ JSON library for embedded IoT" },
  "fastled.h": { lib: "FastLED", desc: "High-performance addressable LED animation library" },
  "adafruit_neopixel.h": { lib: "Adafruit NeoPixel", desc: "Single-wire RGB/RGBW NeoPixel LED driver" },
  "adafruit_gfx.h": { lib: "Adafruit GFX Library", desc: "Core graphics library for displays" },
  "adafruit_ssd1306.h": { lib: "Adafruit SSD1306", desc: "OLED display driver for SSD1306 displays" },
  "adafruit_sensor.h": { lib: "Adafruit Unified Sensor", desc: "Common sensor abstract base classes" },
  "adafruit_bme280.h": { lib: "Adafruit BME280 Library", desc: "Driver for BME280 humidity, temp & pressure" },
  "adafruit_bmp280.h": { lib: "Adafruit BMP280 Library", desc: "Driver for BMP280 pressure and temp" },
  "adafruit_mpu6050.h": { lib: "Adafruit MPU6050", desc: "Driver for MPU-6050 6-DoF accelerometer and gyro" },
  "dht.h": { lib: "DHT sensor library", desc: "Temperature and humidity sensor driver" },
  "dht_u.h": { lib: "DHT sensor library", desc: "Unified temperature and humidity sensor driver" },
  "tft_espi.h": { lib: "TFT_eSPI", desc: "Fast SPI display driver for ESP8266 and ESP32" },
  "wifimanager.h": { lib: "WiFiManager", desc: "ESP8266 & ESP32 WiFi connection manager with captive portal" },
  "espasyncwebserver.h": { lib: "ESPAsyncWebServer", desc: "Async HTTP and WebSocket server for ESP" },
  "asynctcp.h": { lib: "AsyncTCP", desc: "Async TCP library for ESP32" },
  "pubsubclient.h": { lib: "PubSubClient", desc: "MQTT messaging client for IoT devices" },
  "liquidcrystal_i2c.h": { lib: "LiquidCrystal I2C", desc: "Drive HD44780 LCD via I2C PCF8574" },
  "liquidcrystal.h": { lib: "LiquidCrystal", desc: "Drive HD44780 LCD displays directly" },
  "servo.h": { lib: "Servo", desc: "Control RC servo motors" },
  "bounce2.h": { lib: "Bounce2", desc: "Debouncing for switches and buttons" },
  "rtclib.h": { lib: "RTClib", desc: "Real-time clock library (DS1307, DS3231, PCF8523)" },
  "tinygpsplus.h": { lib: "TinyGPSPlus", desc: "Object-oriented NMEA GPS sentence parser" },
  "tinygps++.h": { lib: "TinyGPSPlus", desc: "Object-oriented NMEA GPS sentence parser" },
  "tinygps.h": { lib: "TinyGPS", desc: "Compact NMEA GPS sentence parser" },
  "encoder.h": { lib: "Encoder", desc: "Quadrature encoder reader with interrupt support" },
  "esp8266wifi.h": { lib: "ESP8266WiFi", desc: "ESP8266 WiFi driver (core)" },
  "esp32can.h": { lib: "ESP32-CAN", desc: "CAN bus controller driver for ESP32" },
};

// In-memory cache & Promise coalescing for installed libraries (60s TTL)
let cachedInstalledLibs = null;
let cachedInstalledTimestamp = 0;
let inFlightInstalledPromise = null;
const INSTALLED_LIBS_TTL = 60000;
const libSearchCache = new Map();

export function invalidateLibraryCache() {
  cachedInstalledLibs = null;
  cachedInstalledTimestamp = 0;
  inFlightInstalledPromise = null;
  libSearchCache.clear();
  try {
    invalidateExamplesCache();
  } catch (_) {}
}

/**
 * Fetch installed libraries with 60-second TTL cache and in-flight Promise coalescing
 * @param {boolean} force Force refresh ignoring cache
 * @returns {Promise<Array>}
 */
export function getInstalledLibsAsync(force = false) {
  const now = Date.now();
  if (!force && cachedInstalledLibs && (now - cachedInstalledTimestamp < INSTALLED_LIBS_TTL)) {
    return Promise.resolve(cachedInstalledLibs);
  }

  if (!force && inFlightInstalledPromise) {
    return inFlightInstalledPromise;
  }

  inFlightInstalledPromise = _fetchInstalledLibs(now).finally(() => {
    inFlightInstalledPromise = null;
  });

  return inFlightInstalledPromise;
}

async function _fetchInstalledLibs(now) {
  const timer = startTimer();
  try {
    const { stdout } = await execAsync(
      `${ARDUINO_CLI} lib list --format json`,
      {
        env: { ...process.env, PATH: `${HOME}/.local/bin:${process.env.PATH}` },
        maxBuffer: 10 * 1024 * 1024,
      }
    );
    const parsed = JSON.parse(stdout);
    const rawList = parsed.installed_libraries || [];
    const list = rawList.map((item) => {
      const lib = item.library || {};
      const rel = item.release || {};
      return {
        name: lib.name || "Unknown",
        author: lib.author || rel.author || "Unknown",
        maintainer: lib.maintainer || rel.maintainer || "",
        sentence: lib.sentence || rel.sentence || "",
        paragraph: lib.paragraph || rel.paragraph || "",
        website: lib.website || rel.website || "",
        category: lib.category || rel.category || "Uncategorized",
        version: lib.version || "1.0.0",
        latest_version: rel.version || lib.version || "1.0.0",
        install_dir: lib.install_dir || "",
        location: lib.location || "user",
        provides_includes: lib.provides_includes || [],
        is_installed: true,
        installed_version: lib.version || "1.0.0",
        available_versions: rel.version && rel.version !== lib.version
          ? [rel.version, lib.version]
          : [lib.version || "1.0.0"],
      };
    });
    cachedInstalledLibs = list;
    cachedInstalledTimestamp = now;
    log.info("libraries", "Queried installed libraries", { count: list.length, durationMs: timer() });
    return list;
  } catch (err) {
    log.error("libraries", "Failed to query installed libraries", { error: err.message, durationMs: timer() });
    return cachedInstalledLibs || [];
  }
}

export async function handleScanMissingLibs(req, res) {
  const { code, local_files } = await readBody(req);
  if (!code) {
    return sendJson(res, []);
  }

  // Extract #include statements
  const includes = [];
  for (const line of code.split("\n")) {
    const trimmed = line.trim();
    const match = trimmed.match(/^#include\s*[<"]([^>"]+\.h)[>"]/i);
    if (match) {
      includes.push(match[1]);
    }
  }

  // Set of local files in current sketch/tabs
  const localSet = new Set((local_files || []).map((f) => f.toLowerCase()));

  // Get installed libraries from in-memory cache (instant, <1ms)
  const installedLibs = await getInstalledLibsAsync();
  const installedNames = new Set(installedLibs.map((l) => l.name.toLowerCase()));

  const missing = [];
  for (const inc of includes) {
    const lower = inc.toLowerCase();
    if (CORE_HEADERS.has(lower)) continue;
    if (localSet.has(lower)) continue;
    if (
      lower.startsWith("esp_") ||
      lower.startsWith("driver/") ||
      lower.startsWith("freertos/") ||
      lower.startsWith("soc/") ||
      lower.startsWith("avr/") ||
      lower.startsWith("hal/") ||
      lower.startsWith("sys/") ||
      lower.startsWith("rom/")
    ) {
      continue;
    }

    let suggested = inc.replace(/\.h$/i, "");
    let desc = "Arduino embedded library";

    if (HEADER_TO_LIB_MAP[lower]) {
      suggested = HEADER_TO_LIB_MAP[lower].lib;
      desc = HEADER_TO_LIB_MAP[lower].desc;
    }

    if (!installedNames.has(suggested.toLowerCase())) {
      missing.push({
        header: inc,
        suggested_library: suggested,
        description: desc,
      });
    }
  }

  return sendJson(res, missing);
}

export async function handleGetInstalledLibs(req, res) {
  const libs = await getInstalledLibsAsync();
  return sendJson(res, { success: true, libraries: libs, total: libs.length });
}

export async function handleSearchLibs(req, res, url) {
  const q = (url.searchParams.get("q") || "").trim();
  const category = (url.searchParams.get("category") || "").trim();
  const installedOnly = url.searchParams.get("installedOnly") === "true";

  const installedLibs = await getInstalledLibsAsync();
  const installedMap = new Map();
  for (const inst of installedLibs) {
    installedMap.set(inst.name.toLowerCase(), inst);
  }

  // 1. Installed-only filter (Instant <1ms in-memory response)
  if (installedOnly) {
    let filtered = installedLibs;
    if (q) {
      const lowerQ = q.toLowerCase();
      filtered = filtered.filter(
        (l) =>
          (l.name && l.name.toLowerCase().includes(lowerQ)) ||
          (l.author && l.author.toLowerCase().includes(lowerQ)) ||
          (l.sentence && l.sentence.toLowerCase().includes(lowerQ)) ||
          (l.paragraph && l.paragraph.toLowerCase().includes(lowerQ))
      );
    }
    if (category && category !== "All") {
      filtered = filtered.filter((l) => l.category && l.category.toLowerCase() === category.toLowerCase());
    }
    return sendJson(res, { libraries: filtered, total: filtered.length });
  }

  // 2. Empty query -> return Popular + Installed instantly (Zero Latency)
  if (!q) {
    const combined = [];
    const seenNames = new Set();

    // Add installed first
    for (const inst of installedLibs) {
      if (!seenNames.has(inst.name.toLowerCase())) {
        seenNames.add(inst.name.toLowerCase());
        combined.push(inst);
      }
    }

    // Add curated popular libraries
    for (const pop of POPULAR_LIBRARIES) {
      const lower = pop.name.toLowerCase();
      if (!seenNames.has(lower)) {
        seenNames.add(lower);
        const inst = installedMap.get(lower);
        combined.push({
          ...pop,
          is_installed: !!inst,
          installed_version: inst ? inst.version : null,
        });
      }
    }

    let results = combined;
    if (category && category !== "All") {
      results = results.filter((l) => l.category.toLowerCase() === category.toLowerCase());
    }

    return sendJson(res, { libraries: results, total: results.length });
  }

  // 3. Search query: check memory cache first (5-minute TTL)
  const cacheKey = `${q.toLowerCase()}:${category.toLowerCase()}`;
  const cached = libSearchCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < 300000) {
    const enriched = cached.results.map((lib) => {
      const inst = installedMap.get(lib.name.toLowerCase());
      return {
        ...lib,
        is_installed: !!inst,
        installed_version: inst ? inst.version : null,
      };
    });
    return sendJson(res, { libraries: enriched, total: enriched.length });
  }

  // 4. Query arduino-cli lib search --format json with compact release details
  try {
    const { stdout } = await execAsync(
      `${ARDUINO_CLI} lib search "${q}" --omit-releases-details --format json`,
      {
        env: { ...process.env, PATH: `${HOME}/.local/bin:${process.env.PATH}` },
        maxBuffer: 50 * 1024 * 1024,
      }
    );

    const parsed = JSON.parse(stdout);
    const rawLibs = parsed.libraries || [];

    const results = rawLibs.map((item) => {
      const latest = item.latest || {};
      let versions = [];
      if (Array.isArray(item.available_versions) && item.available_versions.length > 0) {
        versions = item.available_versions.slice(-8).reverse();
      } else if (item.releases && typeof item.releases === "object") {
        versions = Object.keys(item.releases).slice(-8).reverse();
      }
      if (latest.version && !versions.includes(latest.version)) {
        versions.unshift(latest.version);
      }
      if (versions.length === 0 && latest.version) {
        versions = [latest.version];
      }

      const inst = installedMap.get(item.name.toLowerCase());

      return {
        name: item.name,
        author: latest.author || "Unknown",
        maintainer: latest.maintainer || "",
        sentence: latest.sentence || "",
        paragraph: latest.paragraph || "",
        website: latest.website || "",
        category: latest.category || "Uncategorized",
        latest_version: latest.version || versions[0] || "1.0.0",
        available_versions: versions,
        is_installed: !!inst,
        installed_version: inst ? inst.version : null,
      };
    });

    let finalResults = results;
    if (category && category !== "All") {
      finalResults = finalResults.filter((l) => l.category.toLowerCase() === category.toLowerCase());
    }

    libSearchCache.set(cacheKey, {
      timestamp: Date.now(),
      results: finalResults,
    });

    return sendJson(res, { libraries: finalResults, total: finalResults.length });
  } catch (err) {
    const matched = POPULAR_LIBRARIES.filter(
      (l) =>
        l.name.toLowerCase().includes(q.toLowerCase()) ||
        l.sentence.toLowerCase().includes(q.toLowerCase())
    ).map((l) => {
      const inst = installedMap.get(l.name.toLowerCase());
      return {
        ...l,
        is_installed: !!inst,
        installed_version: inst ? inst.version : null,
      };
    });
    return sendJson(res, { libraries: matched, total: matched.length });
  }
}

export async function handleInstallLib(req, res) {
  const { library_name, version } = await readBody(req);
  if (!library_name) {
    return sendJson(res, { success: false, error: "Missing library_name" }, 400);
  }

  const target = version ? `${library_name}@${version}` : library_name;

  try {
    const { stdout, stderr } = await execAsync(
      `${ARDUINO_CLI} lib install "${target}"`,
      { env: { ...process.env, PATH: `${HOME}/.local/bin:${process.env.PATH}` } }
    );
    invalidateLibraryCache();
    return sendJson(res, {
      success: true,
      target,
      stdout,
      stderr: stderr || "",
    });
  } catch (err) {
    invalidateLibraryCache();
    return sendJson(
      res,
      {
        success: false,
        target,
        error: err.message,
        stdout: err.stdout || "",
        stderr: err.stderr || err.message,
      },
      500
    );
  }
}

export async function handleUninstallLib(req, res) {
  const { library_name } = await readBody(req);
  if (!library_name) {
    return sendJson(res, { success: false, error: "Missing library_name" }, 400);
  }

  try {
    const { stdout, stderr } = await execAsync(
      `${ARDUINO_CLI} lib uninstall "${library_name}"`,
      { env: { ...process.env, PATH: `${HOME}/.local/bin:${process.env.PATH}` } }
    );
    invalidateLibraryCache();
    return sendJson(res, {
      success: true,
      stdout,
      stderr: stderr || "",
    });
  } catch (err) {
    invalidateLibraryCache();
    return sendJson(
      res,
      {
        success: false,
        error: err.message,
        stdout: err.stdout || "",
        stderr: err.stderr || err.message,
      },
      500
    );
  }
}

export async function handleInstallZipLib(req, res) {
  const { zip_path } = await readBody(req);
  if (!zip_path) {
    return sendJson(res, { success: false, error: "Missing zip_path" }, 400);
  }

  try {
    const { stdout, stderr } = await execAsync(
      `${ARDUINO_CLI} lib install --zip-path "${zip_path}"`,
      { env: { ...process.env, PATH: `${HOME}/.local/bin:${process.env.PATH}` } }
    );
    invalidateLibraryCache();
    return sendJson(res, {
      success: true,
      stdout,
      stderr: stderr || "",
    });
  } catch (err) {
    invalidateLibraryCache();
    return sendJson(
      res,
      {
        success: false,
        error: err.message,
        stdout: err.stdout || "",
        stderr: err.stderr || err.message,
      },
      500
    );
  }
}

export async function handleInstallGitLib(req, res) {
  const { git_url, version } = await readBody(req);
  if (!git_url) {
    return sendJson(res, { success: false, error: "Missing git_url" }, 400);
  }

  const target = version ? `${git_url}#${version}` : git_url;

  try {
    const { stdout, stderr } = await execAsync(
      `${ARDUINO_CLI} lib install --git-url "${target}"`,
      { env: { ...process.env, PATH: `${HOME}/.local/bin:${process.env.PATH}` } }
    );
    invalidateLibraryCache();
    return sendJson(res, {
      success: true,
      stdout,
      stderr: stderr || "",
    });
  } catch (err) {
    invalidateLibraryCache();
    return sendJson(
      res,
      {
        success: false,
        error: err.message,
        stdout: err.stdout || "",
        stderr: err.stderr || err.message,
      },
      500
    );
  }
}
