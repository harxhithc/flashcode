import { invoke } from "@tauri-apps/api/core";
import { isTauri, safeFetchJson } from "./utils";

export interface BoardInfo {
  name: string;
  fqbn: string;
  architecture: string;
  family?: string;
  platformName?: string;
  platformId?: string;
  isInstalled?: boolean;
}

export interface CorePlatform {
  id: string;
  name: string;
  maintainer: string;
  website?: string;
  email?: string;
  installed: boolean;
  installedVersion?: string;
  latestVersion?: string;
  availableVersions: string[];
  boards: { name: string; fqbn?: string }[];
}

export interface SerialPortInfo {
  port_name: string;
  description: string;
  vendor_id?: string;
  product_id?: string;
  manufacturer?: string;
}

export async function getDefaultBoards(force = false, signal?: AbortSignal): Promise<BoardInfo[]> {
  if (isTauri()) {
    try {
      return await invoke<BoardInfo[]>("get_default_boards");
    } catch (e) {
      console.warn("Tauri invoke failed, falling back to real API:", e);
    }
  }

  const url = force ? "/api/boards?refresh=true" : "/api/boards";
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error("Failed to fetch boards from engine");
  return await res.json();
}

export async function searchBoards(query = "", family = "", signal?: AbortSignal): Promise<BoardInfo[]> {
  const params = new URLSearchParams();
  if (query) params.set("query", query);
  if (family && family !== "All") params.set("family", family);
  const res = await fetch(`/api/boards?${params.toString()}`, { signal });
  if (!res.ok) throw new Error("Failed to search boards");
  return await res.json();
}

export async function getCorePlatforms(query = "", force = false, signal?: AbortSignal): Promise<{ platforms: CorePlatform[] }> {
  const params = new URLSearchParams();
  if (query) params.set("query", query);
  if (force) params.set("refresh", "true");
  const res = await fetch(`/api/cores?${params.toString()}`, { signal });
  if (!res.ok) throw new Error("Failed to load core platforms");
  return await res.json();
}

export async function installCorePlatform(coreId: string, version?: string): Promise<{ success: boolean; stdout?: string; stderr?: string; error?: string }> {
  const res = await fetch("/api/cores/install", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ coreId, version }),
  });
  return await res.json();
}

export async function uninstallCorePlatform(coreId: string): Promise<{ success: boolean; stdout?: string; stderr?: string; error?: string }> {
  const res = await fetch("/api/cores/uninstall", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ coreId }),
  });
  return await res.json();
}

export async function updateCoreIndex(): Promise<{ success: boolean; stdout?: string; stderr?: string; error?: string }> {
  try {
    const res = await fetch("/api/cores/update-index", { method: "POST" });
    const data = await safeFetchJson<any>(res);
    if (data) return data;
  } catch (_) {}
  return { success: false, error: "Unavailable in offline mode" };
}

export async function getAdditionalBoardUrls(): Promise<string[]> {
  try {
    const res = await fetch("/api/cores/urls");
    const data = await safeFetchJson<{ urls?: string[] }>(res);
    if (data && data.urls) return data.urls;
  } catch (_) {}
  return [];
}

export async function saveAdditionalBoardUrls(urls: string[]): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch("/api/cores/urls", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls }),
    });
    const data = await safeFetchJson<any>(res);
    if (data) return data;
  } catch (_) {}
  return { success: true };
}

export async function detectSerialPorts(signal?: AbortSignal): Promise<SerialPortInfo[]> {
  if (isTauri()) {
    try {
      return await invoke<SerialPortInfo[]>("detect_serial_ports");
    } catch (e) {
      console.warn("Tauri invoke failed, falling back to real API:", e);
    }
  }

  const res = await fetch("/api/ports", { signal });
  if (!res.ok) throw new Error("Failed to query hardware serial ports");
  return await res.json();
}

export interface BoardConfigOptionValue {
  value: string;
  valueLabel: string;
  selected?: boolean;
}

export interface BoardConfigOption {
  option: string;
  optionLabel: string;
  values: BoardConfigOptionValue[];
  defaultValue?: string;
}

export interface BoardOptionsResponse {
  success: boolean;
  fqbn: string;
  options: BoardConfigOption[];
  error?: string;
}

export function constructFullFqbn(baseFqbn: string, options?: Record<string, string>): string {
  if (!baseFqbn) return "";
  const base = baseFqbn.split(":").slice(0, 3).join(":");
  if (!options || typeof options !== "object") return base;
  const pairs = Object.entries(options)
    .filter(([_, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${v}`);
  return pairs.length > 0 ? `${base}:${pairs.join(",")}` : base;
}

export function parseFqbnOptions(fullFqbn: string): { baseFqbn: string; options: Record<string, string> } {
  if (!fullFqbn) return { baseFqbn: "", options: {} };
  const parts = fullFqbn.split(":");
  const baseFqbn = parts.slice(0, 3).join(":");
  const options: Record<string, string> = {};
  if (parts.length > 3) {
    const optsStr = parts.slice(3).join(":");
    for (const pair of optsStr.split(",")) {
      const [k, v] = pair.split("=");
      if (k && v) options[k] = v;
    }
  }
  return { baseFqbn, options };
}

export async function getBoardOptions(fqbn: string, signal?: AbortSignal): Promise<BoardConfigOption[]> {
  if (!fqbn) return [];
  const baseFqbn = fqbn.split(":").slice(0, 3).join(":");
  if (isTauri()) {
    try {
      const opts = await invoke<BoardConfigOption[]>("get_board_options", { fqbn: baseFqbn });
      if (Array.isArray(opts)) return opts;
    } catch (e) {
      console.warn(`Tauri get_board_options failed for ${baseFqbn}, falling back to HTTP API:`, e);
    }
  }
  try {
    const res = await fetch(`/api/boards/options?fqbn=${encodeURIComponent(baseFqbn)}`, { signal });
    if (!res.ok) return [];
    const data: BoardOptionsResponse = await res.json();
    return data.options || [];
  } catch (e) {
    console.warn(`Failed to fetch board options for ${fqbn}:`, e);
    return [];
  }
}

export const STANDARD_BAUD_RATES = [
  300, 1200, 2400, 4800, 9600, 14400, 19200, 28800, 38400, 57600, 74880, 115200, 230400, 250000, 460800, 500000, 921600, 1000000, 2000000
];

export function detectSketchBaudRate(code: string): number | null {
  if (!code) return null;
  const match = code.match(/\bSerial(?:[1-3]|USB)?\.begin\s*\(\s*(\d+)\s*\)/);
  if (match && match[1]) {
    const baud = parseInt(match[1], 10);
    if (!isNaN(baud) && baud > 0) return baud;
  }
  return null;
}

export interface PortLockStatus {
  port_name: string;
  is_locked: boolean;
  owner_window?: string;
  owner_title?: string;
  owner_pid?: number;
  is_external_process?: boolean;
}

export function getCurrentWindowLabel(): string {
  try {
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      const winParam = urlParams.get("window");
      if (winParam) return winParam;
    }
  } catch (_) {}
  return "main";
}

export async function getPortLockStatuses(): Promise<PortLockStatus[]> {
  if (isTauri()) {
    try {
      return await invoke<PortLockStatus[]>("get_port_lock_statuses");
    } catch (e) {
      console.warn("Failed to query port locks in Tauri:", e);
    }
  }
  return [];
}

export async function createNewWindow(sketchPath?: string): Promise<string | null> {
  if (isTauri()) {
    try {
      return await invoke<string>("create_new_window", { sketchPath: sketchPath || null });
    } catch (e) {
      console.error("Failed to spawn new window:", e);
    }
  }
  return null;
}

export async function focusWindow(label: string): Promise<boolean> {
  if (isTauri()) {
    try {
      await invoke("focus_window", { label });
      return true;
    } catch (e) {
      console.warn("Failed to focus window:", e);
    }
  }
  return false;
}

export async function transferPortLock(port: string, targetWindow?: string): Promise<boolean> {
  if (isTauri()) {
    try {
      const win = targetWindow || getCurrentWindowLabel();
      await invoke("transfer_port_lock", { port, windowLabel: win });
      return true;
    } catch (e) {
      console.warn("Failed to transfer port lock:", e);
      return false;
    }
  }
  return false;
}

export async function startSerialMonitor(
  port: string,
  baudRate: number,
  windowLabel?: string
): Promise<boolean> {
  if (isTauri()) {
    try {
      const win = windowLabel || getCurrentWindowLabel();
      await invoke("start_serial_monitor", { port, baudRate, windowLabel: win });
      return true;
    } catch (e: any) {
      if (typeof e === "string" && e.startsWith("PORT_LOCKED:")) {
        const owner = e.split(":")[1] || "another window";
        throw new Error(`PORT_LOCKED:${owner}`);
      }
      console.warn("Failed to start serial monitor in Tauri:", e);
      return false;
    }
  }
  return false;
}

export async function stopSerialMonitor(port?: string, windowLabel?: string): Promise<boolean> {
  if (isTauri()) {
    try {
      const win = windowLabel || getCurrentWindowLabel();
      await invoke("stop_serial_monitor", { port: port || null, windowLabel: win });
      return true;
    } catch (e) {
      console.warn("Failed to stop serial monitor in Tauri:", e);
      return false;
    }
  }
  return false;
}

export async function pauseSerialMonitor(port: string): Promise<boolean> {
  if (isTauri()) {
    try {
      return await invoke<boolean>("pause_serial_monitor", { port });
    } catch (e) {
      console.warn("Failed to pause serial monitor in Tauri:", e);
    }
  }
  return false;
}

export async function resumeSerialMonitor(port: string): Promise<boolean> {
  if (isTauri()) {
    try {
      await invoke("resume_serial_monitor", { port });
      return true;
    } catch (e) {
      console.warn("Failed to resume serial monitor in Tauri:", e);
    }
  }
  return false;
}

export async function sendSerialData(
  data: string,
  port?: string,
  windowLabel?: string
): Promise<boolean> {
  if (isTauri()) {
    try {
      const win = windowLabel || getCurrentWindowLabel();
      await invoke("send_serial_data", { data, port: port || null, windowLabel: win });
      return true;
    } catch (e) {
      console.warn("Failed to send serial data in Tauri:", e);
      return false;
    }
  }
  return false;
}

export async function resetTargetBoard(port?: string, windowLabel?: string): Promise<boolean> {
  if (isTauri()) {
    try {
      const win = windowLabel || getCurrentWindowLabel();
      await invoke("reset_target_board", { port: port || null, windowLabel: win });
      return true;
    } catch (e) {
      console.warn("Failed to reset target board in Tauri:", e);
      return false;
    }
  }
  return false;
}

