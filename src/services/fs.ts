import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "./utils";
import { BUILTIN_EXAMPLES_DATA, getBuiltinExamples } from "./builtinExamples";

export interface SketchFile {
  name: string;
  path: string;
  is_main: boolean;
  size?: number;
  content?: string;
  modified?: number;
}

export interface SketchbookItem {
  name: string;
  dir_path: string;
  main_file: string;
  files: SketchFile[];
  modified: number;
}

export interface SketchbookResponse {
  sketchbook_dir: string;
  sketches: SketchbookItem[];
}

export interface ProjectFileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
  children?: ProjectFileEntry[];
}

export interface OpenFileResult {
  success?: boolean;
  canceled?: boolean;
  fallback?: boolean;
  path?: string;
  name?: string;
  content?: string;
  error?: string;
}

export interface SaveFileResult {
  success?: boolean;
  canceled?: boolean;
  fallback?: boolean;
  path?: string;
  name?: string;
  error?: string;
}

export interface OpenFolderResult {
  success?: boolean;
  canceled?: boolean;
  dirPath?: string;
  name?: string;
  files?: ProjectFileEntry[];
  error?: string;
}

export interface SketchFilesResult {
  success: boolean;
  sketchDir?: string;
  dirName?: string;
  primaryFileName?: string;
  primaryFilePath?: string;
  activeFilePath?: string;
  files?: { name: string; path: string; content: string }[];
  error?: string;
}

export interface ExampleItem {
  name: string;
  category: string;
  dirPath: string;
  inoPath: string;
  content?: string;
}

export interface ExampleCategory {
  name: string;
  examples: ExampleItem[];
}

export interface ExampleGroup {
  id: string;
  title: string;
  categories: ExampleCategory[];
  totalCount: number;
}

export interface ExamplesResponse {
  success: boolean;
  groups: ExampleGroup[];
  total: number;
  error?: string;
}

// Fallback HTML file picker for web/headless/non-zenity environments
function openHtmlFileInput(): Promise<OpenFileResult> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".ino,.cpp,.h,.c,.hpp,.flashcode,.flash,.pde";
    input.style.display = "none";

    input.onchange = async () => {
      if (input.files && input.files.length > 0) {
        const file = input.files[0];
        try {
          const content = await file.text();
          resolve({
            success: true,
            canceled: false,
            path: file.name,
            name: file.name,
            content,
          });
        } catch (e: any) {
          resolve({
            success: false,
            canceled: false,
            error: e.message || String(e),
          });
        }
      } else {
        resolve({ canceled: true });
      }
      document.body.removeChild(input);
    };

    input.oncancel = () => {
      resolve({ canceled: true });
      document.body.removeChild(input);
    };

    document.body.appendChild(input);
    input.click();
  });
}

// Fallback browser download for save-as
function triggerBrowserDownload(fileName: string, content: string): SaveFileResult {
  try {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return { success: true, name: fileName, path: fileName };
  } catch (e: any) {
    return { success: false, error: e.message || String(e) };
  }
}

export async function getSketchbook(): Promise<SketchbookResponse> {
  if (isTauri()) {
    try {
      const res = await invoke<SketchbookResponse>("get_sketchbook_sketches");
      if (res && res.sketches) return res;
    } catch (e) {
      console.warn("Tauri get_sketchbook_sketches failed:", e);
    }
  }

  try {
    const res = await fetch("/api/sketchbook");
    if (res.ok) return await res.json();
  } catch (_) {}

  return { sketchbook_dir: "~/Arduino", sketches: [] };
}

export async function createSketchbookSketch(
  name?: string
): Promise<{ success: boolean; name: string; dir_path: string; main_file: string; content: string }> {
  if (isTauri()) {
    try {
      const res = await invoke<{
        success: boolean;
        name: string;
        dir_path: string;
        main_file: string;
        content: string;
      }>("create_sketchbook_sketch", { sketchName: name || null });
      if (res && res.success) return res;
    } catch (e) {
      console.warn("Tauri create_sketchbook_sketch failed:", e);
    }
  }

  try {
    const res = await fetch("/api/sketchbook/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sketch_name: name }),
    });
    if (res.ok) return await res.json();
  } catch (_) {}

  const defaultName = name || `sketch_${Date.now()}`;
  return {
    success: true,
    name: defaultName,
    dir_path: defaultName,
    main_file: `${defaultName}.ino`,
    content: "void setup() {\n  // put your setup code here, to run once:\n\n}\n\nvoid loop() {\n  // put your main code here, to run repeatedly:\n\n}\n",
  };
}

export async function addSketchFile(
  dirPath: string,
  fileName: string,
  content: string = ""
): Promise<{ success: boolean; path: string; name: string; content: string }> {
  if (isTauri()) {
    try {
      const fullPath = `${dirPath}/${fileName}`;
      await invoke("write_file_content", { path: fullPath, content });
      return { success: true, path: fullPath, name: fileName, content };
    } catch (e) {
      console.warn("Tauri addSketchFile failed:", e);
    }
  }

  try {
    const res = await fetch("/api/sketch/add-file", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dir_path: dirPath, file_name: fileName, content }),
    });
    if (res.ok) return await res.json();
  } catch (_) {}

  return { success: true, path: `${dirPath}/${fileName}`, name: fileName, content };
}

export async function getSketchFiles(
  dirPath: string
): Promise<{ success: boolean; files: SketchFile[] }> {
  if (isTauri()) {
    try {
      const res = await invoke<any>("get_adjacent_sketch_files", { filePath: `${dirPath}/dummy.ino` });
      if (res && res.files) {
        return {
          success: true,
          files: res.files.map((f: any) => ({
            name: f.name,
            path: f.path,
            is_main: f.name.endsWith(".ino"),
            content: f.content,
          })),
        };
      }
    } catch (e) {
      console.warn("Tauri getSketchFiles failed:", e);
    }
  }

  try {
    const res = await fetch("/api/sketch/files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dir_path: dirPath }),
    });
    if (res.ok) return await res.json();
  } catch (_) {}

  return { success: true, files: [] };
}

export async function openFileDialog(): Promise<OpenFileResult> {
  if (isTauri()) {
    try {
      const res = await invoke<OpenFileResult>("open_file_dialog");
      if (res && !res.fallback) {
        return res;
      }
    } catch (e) {
      console.warn("Tauri open_file_dialog invoke error, falling back to HTML input:", e);
    }
  }

  // Try web API if available, otherwise HTML input
  try {
    const res = await fetch("/api/fs/dialog/open-file", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    if (res.ok) return await res.json();
  } catch (_) {}

  return await openHtmlFileInput();
}

export async function saveAsDialog(currentName: string, content: string): Promise<SaveFileResult> {
  if (isTauri()) {
    try {
      const res = await invoke<SaveFileResult>("save_as_dialog", {
        currentName: currentName || null,
        content: content || "",
      });
      if (res && !res.fallback) {
        return res;
      }
    } catch (e) {
      console.warn("Tauri save_as_dialog invoke error, falling back to browser download:", e);
    }
  }

  try {
    const res = await fetch("/api/fs/dialog/save-as", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current_name: currentName, content }),
    });
    if (res.ok) return await res.json();
  } catch (_) {}

  return triggerBrowserDownload(currentName || "sketch.ino", content);
}

export async function openFolderDialog(): Promise<OpenFolderResult> {
  try {
    const res = await fetch("/api/fs/dialog/open-folder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    if (res.ok) return await res.json();
  } catch (_) {}
  return { canceled: true };
}

export async function saveFileDirect(filePath: string, content: string): Promise<SaveFileResult> {
  if (isTauri()) {
    try {
      await invoke("write_file_content", { path: filePath, content });
      return { success: true, path: filePath, name: filePath.split("/").pop() || "sketch.ino" };
    } catch (e: any) {
      return { success: false, path: filePath, error: e.message || String(e) };
    }
  }

  try {
    const res = await fetch("/api/fs/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: filePath, content }),
    });
    if (res.ok) return await res.json();
  } catch (_) {}

  return { success: true, path: filePath, name: filePath.split("/").pop() };
}

export async function getAdjacentSketchFiles(filePath: string): Promise<SketchFilesResult> {
  // Built-in bundled example sketches
  if (filePath.startsWith("builtin/")) {
    const content = BUILTIN_EXAMPLES_DATA[filePath] || "";
    const name = filePath.split("/").pop() || "sketch.ino";
    return {
      success: true,
      sketchDir: filePath.substring(0, filePath.lastIndexOf("/")),
      dirName: "builtin",
      primaryFileName: name,
      primaryFilePath: filePath,
      activeFilePath: filePath,
      files: [{ name, path: filePath, content }],
    };
  }

  if (isTauri()) {
    try {
      const res = await invoke<any>("get_adjacent_sketch_files", { filePath });
      if (res && res.success) {
        return {
          success: true,
          sketchDir: res.sketch_dir,
          dirName: res.dir_name,
          primaryFileName: res.primary_file_name,
          primaryFilePath: res.primary_file_path,
          activeFilePath: res.active_file_path,
          files: res.files,
        };
      }
    } catch (e) {
      console.warn("Tauri get_adjacent_sketch_files failed:", e);
    }
  }

  try {
    const res = await fetch("/api/fs/sketch-files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filePath }),
    });
    if (res.ok) return await res.json();
  } catch (_) {}

  return { success: false, error: "Unable to read adjacent files" };
}

export async function readFileDirect(
  filePath: string
): Promise<{ success: boolean; content: string; name: string; error?: string }> {
  // Built-in bundled example sketches
  if (filePath.startsWith("builtin/")) {
    const content = BUILTIN_EXAMPLES_DATA[filePath];
    if (content !== undefined) {
      return {
        success: true,
        content,
        name: filePath.split("/").pop() || "example.ino",
      };
    }
  }

  if (isTauri()) {
    try {
      const content = await invoke<string>("read_file_content", { path: filePath });
      return {
        success: true,
        content,
        name: filePath.split("/").pop() || "sketch.ino",
      };
    } catch (e: any) {
      return {
        success: false,
        content: "",
        name: filePath.split("/").pop() || "sketch.ino",
        error: e.message || String(e),
      };
    }
  }

  try {
    const res = await fetch("/api/fs/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: filePath }),
    });
    if (res.ok) return await res.json();
  } catch (_) {}

  return {
    success: false,
    content: "",
    name: filePath.split("/").pop() || "sketch.ino",
    error: "File not accessible",
  };
}

export async function listProjectFiles(
  dirPath?: string
): Promise<{ success: boolean; dirPath: string; name: string; files: ProjectFileEntry[] }> {
  try {
    const res = await fetch("/api/fs/list-dir", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dirPath }),
    });
    if (res.ok) return await res.json();
  } catch (_) {}
  return { success: false, dirPath: dirPath || "", name: "", files: [] };
}

export async function createProjectFile(
  dirPath: string,
  fileName: string,
  content: string = ""
): Promise<{ success: boolean; path: string; name: string }> {
  if (isTauri()) {
    try {
      const fullPath = `${dirPath}/${fileName}`;
      await invoke("write_file_content", { path: fullPath, content });
      return { success: true, path: fullPath, name: fileName };
    } catch (e) {
      console.warn("Tauri createProjectFile failed:", e);
    }
  }

  try {
    const res = await fetch("/api/fs/create-file", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dirPath, fileName, content }),
    });
    if (res.ok) return await res.json();
  } catch (_) {}

  return { success: true, path: `${dirPath}/${fileName}`, name: fileName };
}

export async function getExamples(): Promise<ExamplesResponse> {
  // Built-in examples are always available instantly without network dependency!
  try {
    const res = await fetch("/api/examples");
    if (res.ok) {
      const data = await res.json();
      if (data && data.groups && data.groups.length > 0) {
        return data;
      }
    }
  } catch (_) {}

  return getBuiltinExamples();
}
