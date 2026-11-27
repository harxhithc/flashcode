import { createSignal, onMount } from "solid-js";
import { OpenFileItem } from "../components/TopBar";
import { RecentFileItem } from "../components/FileExplorerDrawer";
import {
  DEFAULT_SKETCH,
  openFileDialog,
  saveAsDialog,
  saveFileDirect,
  readFileDirect,
  getAdjacentSketchFiles,
  getSketchbook,
  addSketchFile,
  prewarmBoard,
  SketchbookItem,
  BoardInfo,
} from "../services/tauri";

export function loadRecentSketches(): RecentFileItem[] {
  try {
    const raw = localStorage.getItem("flashcode_recent_sketches");
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return [];
}

export function persistRecentSketches(list: RecentFileItem[]) {
  try {
    localStorage.setItem("flashcode_recent_sketches", JSON.stringify(list.slice(0, 15)));
  } catch (e) {}
}

export interface PersistedTab {
  id: string;
  name: string;
  path: string;
  content: string;
  isDirty: boolean;
}

export interface WorkspaceSession {
  version?: number;
  openFiles?: PersistedTab[];
  activeFileId?: string;
  openFilePaths?: string[];
  activeFilePath?: string;
  activeTab?: string | null;
  aiViewMode?: "chat" | "providers";
}

export function getWorkspaceSessionKey(): string {
  try {
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      const win = urlParams.get("window");
      if (win && win !== "main") {
        return `flashcode_workspace_session_${win}`;
      }
    }
  } catch (_) {}
  return "flashcode_workspace_session";
}

export function loadWorkspaceSession(): WorkspaceSession | null {
  try {
    const raw = localStorage.getItem(getWorkspaceSessionKey());
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed) return null;

    // Modern format with draft content
    if (Array.isArray(parsed.openFiles)) {
      return parsed as WorkspaceSession;
    }

    // Legacy format fallback (paths only)
    if (Array.isArray(parsed.openFilePaths)) {
      return {
        version: 1,
        openFiles: parsed.openFilePaths.map((p: string, idx: number) => ({
          id: `legacy-${idx}`,
          name: p.split("/").pop() || "sketch.ino",
          path: p,
          content: "",
          isDirty: false,
        })),
        activeFileId: parsed.activeFilePath || "",
      };
    }
  } catch (e) {}
  return null;
}

export function persistWorkspaceSession(
  files: OpenFileItem[],
  activeIdOrPath?: string,
  extra?: { activeTab?: string | null; aiViewMode?: "chat" | "providers" }
) {
  try {
    const key = getWorkspaceSessionKey();
    if (!files || files.length === 0) {
      localStorage.removeItem(key);
      return;
    }

    let activeId = activeIdOrPath || "";
    if (activeId && !files.some((f) => f.id === activeId)) {
      const matchByPath = files.find((f) => f.path === activeId);
      activeId = matchByPath ? matchByPath.id : (files[0]?.id || "");
    } else if (!activeId && files.length > 0) {
      activeId = files[0].id;
    }

    const session: WorkspaceSession = {
      version: 2,
      openFiles: files.map((f) => ({
        id: f.id,
        name: f.name,
        path: f.path || "",
        content: typeof f.content === "string" ? f.content : "",
        isDirty: !!f.isDirty,
      })),
      activeFileId: activeId,
      activeTab: extra?.activeTab !== undefined ? extra.activeTab : null,
      aiViewMode: extra?.aiViewMode ?? "chat",
    };
    localStorage.setItem(key, JSON.stringify(session));
  } catch (e) {}
}

export interface FileManagerOptions {
  addLog: (msg: string) => void;
  checkDependencies: (content: string, files?: OpenFileItem[]) => void;
  selectedBoard: () => BoardInfo | null;
  getLiveCode: () => string;
  getActiveTab?: () => string | null;
  getAiViewMode?: () => "chat" | "providers";
}

export function useFileManager(options: FileManagerOptions) {
  let sketchCounter = 0;

  const [code, setCode] = createSignal("");
  const [openFiles, setOpenFiles] = createSignal<OpenFileItem[]>([]);
  const [activeFileId, setActiveFileId] = createSignal<string>("");
  const [activeFilePath, setActiveFilePath] = createSignal<string>("");
  const [activeFileName, setActiveFileName] = createSignal<string>("");
  const [isDirty, setIsDirty] = createSignal<boolean>(false);
  const [recentFiles, setRecentFiles] = createSignal<RecentFileItem[]>([]);

  onMount(() => {
    setRecentFiles(loadRecentSketches());
  });

  let sessionDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  const flushHotExitSession = () => {
    if (sessionDebounceTimer) {
      clearTimeout(sessionDebounceTimer);
      sessionDebounceTimer = null;
    }
    const currentFiles = openFiles();
    if (!currentFiles || currentFiles.length === 0) {
      persistWorkspaceSession([], "");
      return;
    }
    const currentId = activeFileId();
    const liveCode = options.getLiveCode();
    const updated = currentFiles.map((f) =>
      f.id === currentId ? { ...f, content: liveCode, isDirty: isDirty() } : f
    );
    const rawTab = options.getActiveTab ? options.getActiveTab() : null;
    const activeTab = rawTab === "settings" ? null : rawTab;
    const rawViewMode = options.getAiViewMode ? options.getAiViewMode() : "chat";
    const aiViewMode = rawViewMode === "providers" ? "chat" : rawViewMode;
    persistWorkspaceSession(updated, currentId, { activeTab, aiViewMode });
  };

  const scheduleSessionPersist = (delay = 400) => {
    if (sessionDebounceTimer) clearTimeout(sessionDebounceTimer);
    sessionDebounceTimer = setTimeout(() => {
      flushHotExitSession();
    }, delay);
  };

  const addRecent = (filePath: string, fileName: string) => {
    if (!filePath) return;
    const item: RecentFileItem = {
      path: filePath,
      name: fileName,
      lastOpened: Date.now(),
    };
    const updated = [item, ...recentFiles().filter((r) => r.path !== filePath)].slice(0, 15);
    setRecentFiles(updated);
    persistRecentSketches(updated);
  };

  const handleCodeChange = (newCode: string) => {
    setCode(newCode);
    setIsDirty(true);
    // Sync to openFiles array
    setOpenFiles((prev) =>
      prev.map((f) =>
        f.id === activeFileId() ? { ...f, content: newCode, isDirty: true } : f
      )
    );
    scheduleSessionPersist(400);
  };

  const handleSelectFileTab = (file: OpenFileItem) => {
    // 1. Sync current buffer before switching
    const currentId = activeFileId();
    let currentFiles = openFiles();
    if (currentId && currentId !== file.id) {
      const liveCurrentCode = options.getLiveCode();
      currentFiles = currentFiles.map((f) =>
        f.id === currentId
          ? { ...f, content: liveCurrentCode, isDirty: isDirty() }
          : f
      );
      setOpenFiles(currentFiles);
    }

    // 2. Activate clicked file tab
    setActiveFileId(file.id);
    setActiveFilePath(file.path);
    setActiveFileName(file.name);
    setCode(file.content);
    setIsDirty(file.isDirty);
    options.checkDependencies(file.content);
    persistWorkspaceSession(currentFiles, file.id);
  };

  const handleNewFile = () => {
    sketchCounter++;
    const newName = `sketch_${sketchCounter}.ino`;
    const newFile: OpenFileItem = {
      id: `sketch-${Date.now()}-${sketchCounter}`,
      name: newName,
      path: "",
      content: DEFAULT_SKETCH,
      isDirty: false,
    };

    const currentId = activeFileId();
    const updatedList = [
      ...openFiles().map((f) =>
        f.id === currentId ? { ...f, content: options.getLiveCode(), isDirty: isDirty() } : f
      ),
      newFile,
    ];
    setOpenFiles(updatedList);
    setActiveFileId(newFile.id);
    setActiveFilePath("");
    setActiveFileName(newName);
    setCode(newFile.content);
    setIsDirty(false);
    options.checkDependencies(newFile.content);
    persistWorkspaceSession(updatedList, newFile.id);
  };

  const openFileByPath = async (filePath: string, fileName: string, fileContent?: string) => {
    try {
      // 1. Scan adjacent sketch files (Arduino IDE multi-file auto import)
      const scanRes = await getAdjacentSketchFiles(filePath);
      if (scanRes.success && scanRes.files && scanRes.files.length > 0) {
        const loadedFiles: OpenFileItem[] = scanRes.files.map((sf, idx) => {
          const rawContent: any = sf.content;
          const cleanContent = typeof rawContent === "string" ? rawContent : (rawContent?.content || "");
          return {
            id: `file-${Date.now()}-${idx}-${sf.name.replace(/[^a-zA-Z0-9]/g, "_")}`,
            name: sf.name,
            path: sf.path,
            content: cleanContent,
            isDirty: false,
          };
        });

        const targetPath = scanRes.activeFilePath || filePath;
        const activeItem =
          loadedFiles.find((f) => f.path === targetPath) ||
          loadedFiles.find((f) => f.name === fileName) ||
          loadedFiles[0];

        const currentList = openFiles();
        const onlyBlankSketch =
          currentList.length === 1 &&
          !currentList[0].path &&
          !currentList[0].isDirty &&
          currentList[0].content === DEFAULT_SKETCH;

        // If the exact target file is already open among current tabs, just switch to it
        const alreadyOpen = currentList.find((f) => f.path === targetPath);
        if (alreadyOpen && currentList.some((f) => f.path === scanRes.files![0].path)) {
          handleSelectFileTab(alreadyOpen);
          return;
        }

        let newFileList: OpenFileItem[];
        if (onlyBlankSketch || currentList.length === 0) {
          newFileList = loadedFiles;
        } else {
          const hasDirty = currentList.some((f) => f.isDirty);
          if (!hasDirty) {
            newFileList = loadedFiles;
          } else {
            const loadedPaths = new Set(loadedFiles.map((f) => f.path));
            const existingPreserved = currentList.filter((f) => !loadedPaths.has(f.path));
            newFileList = [...existingPreserved, ...loadedFiles];
          }
        }

        setOpenFiles(newFileList);
        setActiveFileId(activeItem.id);
        setActiveFilePath(activeItem.path);
        setActiveFileName(activeItem.name);
        setCode(activeItem.content);
        setIsDirty(false);
        options.checkDependencies(activeItem.content, newFileList);
        addRecent(activeItem.path, activeItem.name);
        persistWorkspaceSession(newFileList, activeItem.id);

        const board = options.selectedBoard();
        if (board) {
          const prewarmFiles = newFileList.map((f) => ({
            name: f.name,
            content: typeof f.content === "string" ? f.content : "",
          }));
          prewarmBoard(board.fqbn, activeItem.content, prewarmFiles).catch(() => {});
        }
        options.addLog(
          `[Sketch] Auto-imported ${loadedFiles.length} files from ${scanRes.dirName || "sketch"}: ${loadedFiles
            .map((f) => f.name)
            .join(", ")}`
        );
        return;
      }

      // 2. Fallback for standalone single file
      let content = fileContent;
      if (content === undefined) {
        const res = await readFileDirect(filePath);
        if (!res.success) {
          options.addLog(`[File Error] Could not read ${filePath}: ${res.error}`);
          return;
        }
        content = res.content || "";
      }

      // Check if file is already open
      const existing = openFiles().find((f) => f.path === filePath);
      if (existing) {
        handleSelectFileTab(existing);
        return;
      }

      // If only one untouched fresh blank sketch is open (or none), replace it
      const currentList = openFiles();
      if (
        currentList.length === 0 ||
        (currentList.length === 1 &&
          !currentList[0].path &&
          !currentList[0].isDirty &&
          currentList[0].content === DEFAULT_SKETCH)
      ) {
        const newFile: OpenFileItem = {
          id: `file-${Date.now()}`,
          name: fileName,
          path: filePath,
          content: content,
          isDirty: false,
        };
        setOpenFiles([newFile]);
        setActiveFileId(newFile.id);
        setActiveFilePath(newFile.path);
        setActiveFileName(newFile.name);
        setCode(newFile.content);
        setIsDirty(false);
        options.checkDependencies(newFile.content);
        addRecent(filePath, fileName);
        persistWorkspaceSession([newFile], newFile.id);
        const board = options.selectedBoard();
        if (board) {
          prewarmBoard(board.fqbn, content, [{ name: fileName, content }]).catch(() => {});
        }
        options.addLog(`[File] Opened: ${filePath}`);
        return;
      }

      const newFile: OpenFileItem = {
        id: `file-${Date.now()}`,
        name: fileName,
        path: filePath,
        content: content,
        isDirty: false,
      };

      const updatedList = [
        ...openFiles().map((f) => (f.id === activeFileId() ? { ...f, content: options.getLiveCode(), isDirty: isDirty() } : f)),
        newFile,
      ];
      setOpenFiles(updatedList);
      setActiveFileId(newFile.id);
      setActiveFilePath(newFile.path);
      setActiveFileName(newFile.name);
      setCode(newFile.content);
      setIsDirty(false);
      options.checkDependencies(newFile.content);
      addRecent(filePath, fileName);
      persistWorkspaceSession(updatedList, newFile.id);
      options.addLog(`[File] Opened: ${filePath}`);
    } catch (e) {
      options.addLog(`[File Error] ${e}`);
    }
  };

  const handleOpenFile = async () => {
    try {
      const res = await openFileDialog();
      if (res.success && res.content !== undefined && res.path) {
        await openFileByPath(res.path, res.name || "sketch.ino", res.content);
      }
    } catch (e) {
      options.addLog(`[File Error] Failed to open file: ${e}`);
    }
  };

  const handleCloseFileTab = (fileToClose: OpenFileItem) => {
    const currentList = openFiles();
    const remaining = currentList.filter((f) => f.id !== fileToClose.id);

    if (remaining.length === 0) {
      setOpenFiles([]);
      setActiveFileId("");
      setActiveFilePath("");
      setActiveFileName("");
      setCode("");
      setIsDirty(false);
      persistWorkspaceSession([], "");
      return;
    }

    setOpenFiles(remaining);

    // If closing active tab, switch to adjacent tab
    let nextActiveId = activeFileId();
    if (fileToClose.id === activeFileId()) {
      const closedIndex = currentList.findIndex((f) => f.id === fileToClose.id);
      const nextTab = remaining[Math.min(closedIndex, remaining.length - 1)];
      nextActiveId = nextTab.id;
      setActiveFileId(nextTab.id);
      setActiveFilePath(nextTab.path);
      setActiveFileName(nextTab.name);
      setCode(nextTab.content);
      setIsDirty(nextTab.isDirty);
      options.checkDependencies(nextTab.content);
    }

    persistWorkspaceSession(remaining, nextActiveId);
  };

  const handleCloseFile = () => {
    const current = openFiles().find((f) => f.id === activeFileId());
    if (current) {
      handleCloseFileTab(current);
    }
  };

  const handleCloseSketch = () => {
    const currentList = openFiles();
    if (currentList.length === 0) return;

    const current = currentList.find((f) => f.id === activeFileId()) || currentList[0];
    const currentPath = current?.path || "";

    let sketchDir = "";
    if (currentPath && currentPath.includes("/")) {
      sketchDir = currentPath.substring(0, currentPath.lastIndexOf("/"));
    }

    let remaining: OpenFileItem[] = [];
    if (sketchDir) {
      // Remove all files belonging to this sketch's directory
      remaining = currentList.filter(
        (f) => !f.path || (!f.path.startsWith(sketchDir + "/") && f.path !== sketchDir)
      );
    } else {
      // If untitled sketch or no directory, closing sketch closes all
      remaining = [];
    }

    if (remaining.length === 0) {
      setOpenFiles([]);
      setActiveFileId("");
      setActiveFilePath("");
      setActiveFileName("");
      setCode("");
      setIsDirty(false);
      persistWorkspaceSession([], "");
      return;
    }

    setOpenFiles(remaining);
    const nextTab = remaining[0];
    setActiveFileId(nextTab.id);
    setActiveFilePath(nextTab.path);
    setActiveFileName(nextTab.name);
    setCode(nextTab.content);
    setIsDirty(nextTab.isDirty);
    options.checkDependencies(nextTab.content);
    persistWorkspaceSession(remaining, nextTab.id);
  };

  const handleCloseAllFiles = () => {
    if (openFiles().length === 0) return;
    setOpenFiles([]);
    setActiveFileId("");
    setActiveFilePath("");
    setActiveFileName("");
    setCode("");
    setIsDirty(false);
    persistWorkspaceSession([], "");
  };

  const handleCloseOtherTabs = (keepFile: OpenFileItem) => {
    setOpenFiles([keepFile]);
    setActiveFileId(keepFile.id);
    setActiveFilePath(keepFile.path);
    setActiveFileName(keepFile.name);
    setCode(keepFile.content);
    setIsDirty(keepFile.isDirty);
    options.checkDependencies(keepFile.content);
    persistWorkspaceSession([keepFile], keepFile.id);
  };

  const handleSave = async () => {
    if (openFiles().length === 0) return;
    const current = openFiles().find((f) => f.id === activeFileId());
    const currentPath = current?.path || activeFilePath();

    if (!currentPath) {
      return handleSaveAs();
    }

    try {
      const res = await saveFileDirect(currentPath, options.getLiveCode());
      if (res.success) {
        setIsDirty(false);
        const updatedList = openFiles().map((f) =>
          f.id === activeFileId() ? { ...f, isDirty: false, content: options.getLiveCode() } : f
        );
        setOpenFiles(updatedList);
        addRecent(currentPath, activeFileName());
        persistWorkspaceSession(updatedList, activeFileId());
        options.addLog(`[File] Saved: ${currentPath}`);
      } else {
        options.addLog(`[File Error] Save failed: ${res.error}`);
      }
    } catch (e) {
      options.addLog(`[File Error] Save exception: ${e}`);
    }
  };

  const handleSaveAs = async () => {
    if (openFiles().length === 0) return;
    try {
      options.addLog("[File] Opening Save As dialog...");
      const res = await saveAsDialog(activeFileName(), options.getLiveCode());
      if (res.success && res.path) {
        const newPath = res.path;
        const newName = res.name || "sketch.ino";
        setActiveFilePath(newPath);
        setActiveFileName(newName);
        setIsDirty(false);
        const updatedList = openFiles().map((f) =>
          f.id === activeFileId()
            ? { ...f, name: newName, path: newPath, isDirty: false, content: options.getLiveCode() }
            : f
        );
        setOpenFiles(updatedList);
        addRecent(newPath, newName);
        persistWorkspaceSession(updatedList, activeFileId());
        options.addLog(`[File] Saved as: ${newPath}`);
      } else if (res.canceled) {
        options.addLog("[File] Save As canceled.");
      }
    } catch (e) {
      options.addLog(`[File Error] Save As failed: ${e}`);
    }
  };

  const handleRemoveRecent = (pathToRemove: string) => {
    const updated = recentFiles().filter((f) => f.path !== pathToRemove);
    setRecentFiles(updated);
    persistRecentSketches(updated);
  };

  const handleClearRecents = () => {
    setRecentFiles([]);
    persistRecentSketches([]);
  };

  const handleOpenSketchFromSketchbook = async (item: SketchbookItem) => {
    try {
      options.addLog(`[Sketchbook] Opening sketch "${item.name}"...`);
      await openFileByPath(item.main_file, item.main_file.split("/").pop() || "sketch.ino");
    } catch (e: any) {
      options.addLog(`[Sketchbook Error] Failed to open ${item.name}: ${e.message || e}`);
    }
  };

  const handleAddNewTabToSketch = async (fileName: string) => {
    const cleanName = fileName.trim();
    if (!cleanName) return;

    let targetDir = "";
    const current = openFiles().find((f) => f.id === activeFileId());
    if (current && current.path && (current.path.includes("/") || current.path.includes("\\"))) {
      const sepIdx = Math.max(current.path.lastIndexOf("/"), current.path.lastIndexOf("\\"));
      targetDir = current.path.substring(0, sepIdx);
    } else {
      const sb = await getSketchbook();
      targetDir = sb.sketchbook_dir;
    }

    try {
      const res = await addSketchFile(targetDir, cleanName);
      if (res.success) {
        const newFile: OpenFileItem = {
          id: `file-${Date.now()}-${cleanName}`,
          name: res.name,
          path: res.path,
          content: res.content,
          isDirty: false,
        };
        const updatedList = [...openFiles(), newFile];
        setOpenFiles(updatedList);
        setActiveFileId(newFile.id);
        setActiveFilePath(newFile.path);
        setActiveFileName(newFile.name);
        setCode(newFile.content);
        setIsDirty(false);
        persistWorkspaceSession(updatedList, newFile.id);
        options.addLog(`[Sketch] Added file "${res.name}" to sketch.`);
      }
    } catch (e: any) {
      options.addLog(`[Sketch Error] Could not add file: ${e.message || e}`);
    }
  };

  const restoreSession = async (): Promise<boolean> => {
    try {
      // 1. If opened with a specific sketch path via CLI or 'New Window with Sketch'
      if (typeof window !== "undefined") {
        const urlParams = new URLSearchParams(window.location.search);
        const sketchParam = urlParams.get("sketch");
        if (sketchParam) {
          try {
            const diskRes = await readFileDirect(sketchParam);
            if (diskRes.success && diskRes.content !== undefined) {
              const fileName = sketchParam.split("/").pop() || "sketch.ino";
              const newFile: OpenFileItem = {
                id: `sketch-${Date.now()}`,
                name: fileName,
                path: sketchParam,
                content: diskRes.content,
                isDirty: false,
              };
              setOpenFiles([newFile]);
              setActiveFileId(newFile.id);
              setActiveFilePath(newFile.path);
              setActiveFileName(newFile.name);
              setCode(newFile.content);
              setIsDirty(false);
              addRecent(newFile.path, newFile.name);
              return true;
            }
          } catch (_) {}
        }
      }

      // 2. Otherwise restore workspace session for this window
      const session = loadWorkspaceSession();
      if (!session || !session.openFiles || session.openFiles.length === 0) {
        return false;
      }

      const restoredFiles: OpenFileItem[] = [];

      for (const tab of session.openFiles) {
        const match = tab.name.match(/^sketch_(\d+)\.ino$/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (!isNaN(num) && num > sketchCounter) {
            sketchCounter = num;
          }
        }

        let content = tab.content;
        // If file exists on disk and has no unsaved changes, fetch latest from disk
        if (tab.path && !tab.isDirty) {
          try {
            const diskRes = await readFileDirect(tab.path);
            if (diskRes.success && diskRes.content !== undefined) {
              content = diskRes.content;
            }
          } catch (e) {
            // Keep persisted content as fallback
          }
        }

        restoredFiles.push({
          id: tab.id || `file-${Date.now()}-${tab.name}`,
          name: tab.name,
          path: tab.path || "",
          content: typeof content === "string" ? content : "",
          isDirty: !!tab.isDirty,
        });
      }

      if (restoredFiles.length === 0) return false;

      // Find active tab
      const targetActive =
        restoredFiles.find((f) => f.id === session.activeFileId) ||
        restoredFiles.find((f) => f.path && f.path === session.activeFileId) ||
        restoredFiles[0];

      setOpenFiles(restoredFiles);
      setActiveFileId(targetActive.id);
      setActiveFilePath(targetActive.path);
      setActiveFileName(targetActive.name);
      setCode(targetActive.content);
      setIsDirty(targetActive.isDirty);

      options.checkDependencies(targetActive.content, restoredFiles);

      const board = options.selectedBoard();
      if (board) {
        prewarmBoard(
          board.fqbn,
          targetActive.content,
          restoredFiles.map((f) => ({ name: f.name, content: f.content }))
        ).catch(() => {});
      }

      return true;
    } catch (e) {
      console.warn("Failed to restore Hot Exit session:", e);
      return false;
    }
  };

  return {
    code,
    setCode,
    openFiles,
    setOpenFiles,
    activeFileId,
    setActiveFileId,
    activeFilePath,
    setActiveFilePath,
    activeFileName,
    setActiveFileName,
    isDirty,
    setIsDirty,
    recentFiles,
    setRecentFiles,
    addRecent,
    handleCodeChange,
    handleSelectFileTab,
    handleNewFile,
    handleOpenFile,
    openFileByPath,
    handleCloseFileTab,
    handleCloseFile,
    handleCloseSketch,
    handleCloseAllFiles,
    handleCloseOtherTabs,
    handleSave,
    handleSaveAs,
    handleRemoveRecent,
    handleClearRecents,
    handleOpenSketchFromSketchbook,
    handleAddNewTabToSketch,
    restoreSession,
    flushHotExitSession,
  };
}
