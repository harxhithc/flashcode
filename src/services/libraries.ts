import { safeFetchJson } from "./utils";

export interface MissingLibraryInfo {
  header: string;
  suggested_library: string;
  description: string;
}

export interface ArduinoLibrary {
  name: string;
  author: string;
  maintainer?: string;
  sentence: string;
  paragraph?: string;
  website?: string;
  category: string;
  latest_version: string;
  available_versions: string[];
  is_installed: boolean;
  has_update?: boolean;
  installed_version?: string | null;
  install_dir?: string;
}

export interface LibrarySearchResult {
  libraries: ArduinoLibrary[];
  total: number;
}

export async function scanMissingLibraries(
  code: string,
  localFiles?: string[],
  signal?: AbortSignal
): Promise<MissingLibraryInfo[]> {
  try {
    const res = await fetch("/api/libs/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, local_files: localFiles }),
      signal,
    });
    const data = await safeFetchJson<MissingLibraryInfo[]>(res);
    if (data) return data;
  } catch (e) {}
  return [];
}

export async function searchLibraries(
  query: string = "",
  category: string = "All",
  installedOnly: boolean = false,
  signal?: AbortSignal
): Promise<LibrarySearchResult> {
  try {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (category && category !== "All") params.set("category", category);
    if (installedOnly) params.set("installedOnly", "true");

    const res = await fetch(`/api/libs/search?${params.toString()}`, { signal });
    const data = await safeFetchJson<LibrarySearchResult>(res);
    if (data) return data;
  } catch (e) {
    if ((e as any)?.name !== "AbortError") {
      console.warn("searchLibraries error:", e);
    }
  }
  return { libraries: [], total: 0 };
}

export async function getInstalledLibraries(signal?: AbortSignal): Promise<ArduinoLibrary[]> {
  try {
    const res = await fetch("/api/libs/installed", { signal });
    const data = await safeFetchJson<{ libraries?: ArduinoLibrary[] }>(res);
    if (data && data.libraries) {
      return data.libraries;
    }
  } catch (e) {
    if ((e as any)?.name !== "AbortError") {
      console.warn("getInstalledLibraries error:", e);
    }
  }
  return [];
}

export async function installLibrary(
  libraryName: string,
  version?: string
): Promise<{ success: boolean; target?: string; stdout?: string; stderr?: string }> {
  try {
    const res = await fetch("/api/libs/install", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ library_name: libraryName, version }),
    });
    const data = await safeFetchJson<any>(res);
    if (data) return data;
  } catch (_) {}
  return { success: false, stderr: "Library installation unavailable in offline mode" };
}

export async function uninstallLibrary(
  libraryName: string
): Promise<{ success: boolean; stdout?: string; stderr?: string }> {
  try {
    const res = await fetch("/api/libs/uninstall", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ library_name: libraryName }),
    });
    const data = await safeFetchJson<any>(res);
    if (data) return data;
  } catch (_) {}
  return { success: false, stderr: "Library uninstallation unavailable in offline mode" };
}

export async function installLibraryZip(
  zipPath: string
): Promise<{ success: boolean; stdout?: string; stderr?: string }> {
  try {
    const res = await fetch("/api/libs/install-zip", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ zip_path: zipPath }),
    });
    const data = await safeFetchJson<any>(res);
    if (data) return data;
  } catch (_) {}
  return { success: false, stderr: "ZIP installation unavailable in offline mode" };
}

export async function installLibraryGit(
  gitUrl: string,
  version?: string
): Promise<{ success: boolean; stdout?: string; stderr?: string }> {
  try {
    const res = await fetch("/api/libs/install-git", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ git_url: gitUrl, version }),
    });
    const data = await safeFetchJson<any>(res);
    if (data) return data;
  } catch (_) {}
  return { success: false, stderr: "Git installation unavailable in offline mode" };
}
