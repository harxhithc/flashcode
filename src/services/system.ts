import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "./utils";

export interface UninstallManifest {
  installType: string;
  executablePath: string;
  uninstallerPath?: string;
  isDebPackage: boolean;
  isDevBuild: boolean;
  targetPaths: string[];
  protectedPaths: string[];
}

export async function getUninstallManifest(): Promise<UninstallManifest | null> {
  if (!isTauri()) return null;
  try {
    return await invoke<UninstallManifest>("get_uninstall_manifest");
  } catch (e) {
    console.warn("Failed to inspect uninstall manifest:", e);
    return null;
  }
}

export async function performFullUninstall(): Promise<void> {
  if (!isTauri()) {
    throw new Error("In-app uninstall is only available in the desktop application.");
  }
  await invoke("perform_full_uninstall");
}
