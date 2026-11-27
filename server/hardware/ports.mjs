import fs from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { ARDUINO_CLI, HOME, sendJson } from "../utils.mjs";
import { getIsUploadingActive } from "../uploader/uploader.mjs";
import { log } from "../utils/logger.mjs";

const execAsync = promisify(exec);

export function scanLinuxSerialPorts() {
  const ports = [];
  try {
    const files = fs.readdirSync("/dev");
    for (const file of files) {
      if (file.startsWith("ttyUSB") || file.startsWith("ttyACM")) {
        const fullPath = `/dev/${file}`;
        let desc = "USB Serial Device";
        let vid = "";
        let pid = "";

        // Read sysfs uevent for hardware vendor/product IDs
        try {
          const uevent = fs.readFileSync(`/sys/class/tty/${file}/device/uevent`, "utf-8");
          const m = uevent.match(/PRODUCT=([0-9a-fA-F]+)\/([0-9a-fA-F]+)/);
          if (m) {
            vid = m[1].toLowerCase();
            pid = m[2].toLowerCase();
          }
        } catch (e) {}

        // Traverse parent USB tree to find manufacturer and product strings
        try {
          const sysDevPath = `/sys/class/tty/${file}/device`;
          let cur = sysDevPath;
          for (let depth = 0; depth < 5; depth++) {
            cur = path.dirname(cur);
            const mfgPath = path.join(cur, "manufacturer");
            const prodPath = path.join(cur, "product");
            if (fs.existsSync(prodPath)) {
              const prod = fs.readFileSync(prodPath, "utf-8").trim();
              const mfg = fs.existsSync(mfgPath) ? fs.readFileSync(mfgPath, "utf-8").trim() : "";
              if (prod) {
                desc = mfg ? `${prod} (${mfg})` : prod;
                break;
              }
            }
          }
        } catch (e) {}

        // Signature matching fallback for common microcontroller USB-UART bridges
        if (desc === "USB Serial Device" || desc === "USB-to-Serial Device") {
          try {
            const uevent = fs.readFileSync(`/sys/class/tty/${file}/device/uevent`, "utf-8");
            if (uevent.includes("1a86") || uevent.includes("7523")) {
              desc = "ESP8266/ESP32 (CH340 USB-UART)";
            } else if (uevent.includes("10c4") || uevent.includes("ea60")) {
              desc = "ESP32 Dev Module (Silicon Labs CP2102)";
            } else if (uevent.includes("0403")) {
              desc = "FTDI USB-UART Device";
            } else if (uevent.includes("2341") || uevent.includes("0043")) {
              desc = "Arduino Uno (ATmega16U2)";
            } else if (uevent.includes("0042") || uevent.includes("0010")) {
              desc = "Arduino Mega 2560 (ATmega16U2)";
            } else if (uevent.includes("303a")) {
              desc = "ESP32-S2/S3 (Espressif USB JTAG/CDC)";
            } else if (uevent.includes("2e8a")) {
              desc = "Raspberry Pi Pico (RP2040)";
            }
          } catch (e) {}
        }

        ports.push({
          port_name: fullPath,
          description: desc,
          vendor_id: vid,
          product_id: pid,
        });
      }
    }
  } catch (e) {}

  // Cross-reference /dev/serial/by-id for human-readable device identifiers
  try {
    if (fs.existsSync("/dev/serial/by-id")) {
      const links = fs.readdirSync("/dev/serial/by-id");
      for (const link of links) {
        try {
          const target = fs.realpathSync(`/dev/serial/by-id/${link}`);
          const existing = ports.find((p) => p.port_name === target);
          if (existing && (existing.description === "USB Serial Device" || existing.description === "USB-to-Serial Device")) {
            const cleanName = link
              .replace(/^usb-/, "")
              .replace(/-if\d+.*$/, "")
              .replace(/_/g, " ");
            if (cleanName) existing.description = cleanName;
          }
        } catch (e) {}
      }
    }
  } catch (e) {}

  return ports;
}

let cachedSerialPorts = scanLinuxSerialPorts();
let lastPortSignature = "";
let cliScanInterval = 10_000;
let lastCliScanTime = 0;
let isCliScanning = false;

export async function getRealSerialPorts() {
  const current = scanLinuxSerialPorts();
  const currentSig = current.map((p) => `${p.port_name}:${p.vendor_id}:${p.product_id}`).sort().join(",");

  if (currentSig !== lastPortSignature) {
    lastPortSignature = currentSig;
    cliScanInterval = 10_000;
    lastCliScanTime = 0;
    cachedSerialPorts = current;
  } else {
    // Preserve enriched descriptions for known ports
    for (const p of current) {
      const existing = cachedSerialPorts.find((x) => x.port_name === p.port_name);
      if (existing && existing.description && existing.description !== "USB Serial Device" && existing.description !== "USB-to-Serial Device") {
        p.description = existing.description;
      }
    }
    cachedSerialPorts = current;
  }

  // Background non-blocking board name discovery via arduino-cli (with exponential backoff 10s -> 60s)
  const now = Date.now();
  if (current.length > 0 && !getIsUploadingActive() && !isCliScanning && (now - lastCliScanTime >= cliScanInterval || lastCliScanTime === 0)) {
    lastCliScanTime = now;
    isCliScanning = true;

    execAsync(`${ARDUINO_CLI} board list --format json`, {
      env: { ...process.env, PATH: `${HOME}/.local/bin:${process.env.PATH}` },
    })
      .then(({ stdout }) => {
        if (stdout) {
          try {
            const data = JSON.parse(stdout);
            const detected = data.detected_ports || [];
            for (const item of detected) {
              const p = item.port || {};
              const boards = item.matching_boards || [];
              if (boards.length > 0 && p.address) {
                const match = cachedSerialPorts.find((x) => x.port_name === p.address);
                if (match) {
                  match.description = `${boards[0].name} (${p.protocol_label || "USB"})`;
                }
              }
            }
          } catch (e) {}
        }
        // Port configuration unchanged: exponentially back off CLI scan up to 60s
        cliScanInterval = Math.min(cliScanInterval * 2, 60_000);
      })
      .catch((err) => {
        log.warn("ports", "Failed to query arduino-cli board list", { error: err.message });
      })
      .finally(() => {
        isCliScanning = false;
      });
  }

  return cachedSerialPorts;
}

// Zero-delay kernel event watcher for USB hotplug on Linux
try {
  const watcher = fs.watch("/dev", (eventType, filename) => {
    if (filename && (filename.startsWith("ttyUSB") || filename.startsWith("ttyACM"))) {
      cachedSerialPorts = scanLinuxSerialPorts();
      lastPortSignature = "";
      cliScanInterval = 10_000;
      lastCliScanTime = 0;
    }
  });
  if (watcher && typeof watcher.unref === "function") {
    watcher.unref();
  }
} catch (e) {}

export async function handleGetPorts(req, res) {
  const ports = await getRealSerialPorts();
  return sendJson(res, ports);
}
