import { Component, createSignal, onMount, onCleanup, Show, lazy, Suspense } from "solid-js";
import { Sidebar, ActiveTab } from "./components/Sidebar";
import { TopBar, OpenFileItem } from "./components/TopBar";
import { EditorTabBar } from "./components/EditorTabBar";
const Editor = lazy(() => import("./components/Editor"));
import { StatusBar } from "./components/StatusBar";
import { Console } from "./components/Console";
const BoardSelectorModal = lazy(() => import("./components/BoardSelectorModal").then((m) => ({ default: m.BoardSelectorModal })));
const PortSelectorModal = lazy(() => import("./components/PortSelectorModal").then((m) => ({ default: m.PortSelectorModal })));
const AICopilotDrawer = lazy(() => import("./components/AICopilotDrawer").then((m) => ({ default: m.AICopilotDrawer })));
const FileExplorerDrawer = lazy(() => import("./components/FileExplorerDrawer").then((m) => ({ default: m.FileExplorerDrawer })));
const ExamplesDrawer = lazy(() => import("./components/ExamplesDrawer").then((m) => ({ default: m.ExamplesDrawer })));
const LibraryManagerModal = lazy(() => import("./components/LibraryManagerModal").then((m) => ({ default: m.LibraryManagerModal })));
const UpdateModal = lazy(() => import("./components/modals/UpdateModal").then((m) => ({ default: m.UpdateModal })));
const SettingsModal = lazy(() => import("./components/modals/SettingsModal").then((m) => ({ default: m.SettingsModal })));
import { initAutoUpdateSchedule, checkForUpdates, updateState } from "./services/updateService";
import { EmptyState } from "./components/EmptyState";
import {
  BoardInfo,
  SerialPortInfo,
  ErrorTranslationResponse,
  MissingLibraryInfo,
  getDefaultBoards,
  detectSerialPorts,
  scanMissingLibraries,
  installLibrary,
  sanitizeCppCode,
  prewarmBoard,
  BoardConfigOption,
  getBoardOptions,
  safeFetchJson,
  createNewWindow,
  focusWindow,
  getPortLockStatuses,
} from "./services/tauri";
import { Download, Loader2, AlertCircle } from "lucide-solid";

import { useGlobalShortcuts } from "./hooks/useGlobalShortcuts";
import { useCompilerPipeline } from "./hooks/useCompilerPipeline";
import { useFileManager, persistWorkspaceSession, loadWorkspaceSession } from "./hooks/useFileManager";

const EditorSkeleton = () => (
  <div class="w-full h-full bg-[#0F0F11] flex flex-row overflow-hidden select-none">
    <div class="w-12 bg-[#0F0F11] border-r border-[#1E1E22] flex flex-col items-end pr-3 pt-3 gap-2 text-xs text-zinc-700 font-mono">
      <div>1</div>
      <div>2</div>
      <div>3</div>
      <div>4</div>
      <div>5</div>
      <div>6</div>
      <div>7</div>
      <div>8</div>
    </div>
    <div class="flex-1 p-3 flex flex-col gap-2.5">
      <div class="h-4 bg-zinc-800/40 rounded w-48 animate-pulse" />
      <div class="h-4 bg-zinc-800/30 rounded w-72 animate-pulse" />
      <div class="h-4 bg-zinc-800/20 rounded w-36 animate-pulse" />
      <div class="h-4 bg-transparent w-8" />
      <div class="h-4 bg-zinc-800/40 rounded w-64 animate-pulse" />
      <div class="h-4 bg-zinc-800/30 rounded w-96 animate-pulse" />
      <div class="h-4 bg-zinc-800/20 rounded w-52 animate-pulse" />
    </div>
  </div>
);

const App: Component = () => {
  let getEditorValue: (() => string) | null = null;

  // Modals & Panels State
  const [activeTab, setActiveTab] = createSignal<ActiveTab>(null);
  const [isBoardModalOpen, setIsBoardModalOpen] = createSignal(false);
  const [isPortModalOpen, setIsPortModalOpen] = createSignal(false);
  const [isLibraryModalOpen, setIsLibraryModalOpen] = createSignal(false);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = createSignal(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = createSignal(false);
  const [activeError, setActiveError] = createSignal<ErrorTranslationResponse | null>(null);

  // Hardware State
  const [boards, setBoards] = createSignal<BoardInfo[]>([]);
  const [selectedBoard, setSelectedBoard] = createSignal<BoardInfo | null>(null);
  const [boardConfigOptions, setBoardConfigOptions] = createSignal<BoardConfigOption[]>([]);
  const [selectedBoardOptions, setSelectedBoardOptions] = createSignal<Record<string, string>>({});
  const [isLoadingBoardOptions, setIsLoadingBoardOptions] = createSignal<boolean>(false);
  const [ports, setPorts] = createSignal<SerialPortInfo[]>([]);
  const [selectedPort, setSelectedPort] = createSignal<SerialPortInfo | null>(null);

  const loadBoardOptions = async (baseFqbn: string) => {
    setIsLoadingBoardOptions(true);
    try {
      const opts = await getBoardOptions(baseFqbn);
      setBoardConfigOptions(opts);

      let saved: Record<string, string> = {};
      try {
        const stored = localStorage.getItem(`flashcode_board_options_${baseFqbn}`);
        if (stored) saved = JSON.parse(stored);
      } catch {}

      const active: Record<string, string> = {};
      for (const opt of opts) {
        if (saved[opt.option] !== undefined) {
          active[opt.option] = saved[opt.option];
        } else if (opt.defaultValue) {
          active[opt.option] = opt.defaultValue;
        }
      }
      setSelectedBoardOptions(active);
    } catch {
      setBoardConfigOptions([]);
      setSelectedBoardOptions({});
    } finally {
      setIsLoadingBoardOptions(false);
    }
  };

  const handleBoardOptionsChange = (newOpts: Record<string, string>) => {
    setSelectedBoardOptions(newOpts);
    const b = selectedBoard();
    if (b?.fqbn) {
      const baseFqbn = b.fqbn.split(":").slice(0, 3).join(":");
      try {
        localStorage.setItem(`flashcode_board_options_${baseFqbn}`, JSON.stringify(newOpts));
      } catch {}
    }
  };

  const handleResetBoardOptionsDefaults = () => {
    const b = selectedBoard();
    if (b?.fqbn) {
      const baseFqbn = b.fqbn.split(":").slice(0, 3).join(":");
      try {
        localStorage.removeItem(`flashcode_board_options_${baseFqbn}`);
      } catch {}
    }
  };

  const selectBoard = (b: BoardInfo | null) => {
    setSelectedBoard(b);
    if (b?.fqbn) {
      try {
        localStorage.setItem("flashcode_selected_board_fqbn", b.fqbn);
      } catch (e) {}

      const baseFqbn = b.fqbn.split(":").slice(0, 3).join(":");
      loadBoardOptions(baseFqbn);

      const activeCode = fileManager.code() || "";
      const currentActiveId = fileManager.activeFileId();
      const openFileList = (fileManager.openFiles() || []).map((f) => ({
        name: f.name,
        content: f.id === currentActiveId ? activeCode : (typeof f.content === "string" ? f.content : ""),
      }));
      safePrewarm(b.fqbn, activeCode, openFileList);
    } else {
      setBoardConfigOptions([]);
      setSelectedBoardOptions({});
    }
  };

  const selectPort = (p: SerialPortInfo | null) => {
    setSelectedPort(p);
    if (p?.port_name) {
      try {
        localStorage.setItem("flashcode_selected_port_name", p.port_name);
      } catch (e) {}
    }
  };

  // Missing Libraries & Auto-Install Signals
  const [missingLibs, setMissingLibs] = createSignal<MissingLibraryInfo[]>([]);
  const [isInstallingLib, setIsInstallingLib] = createSignal(false);
  const [autoInstallingLib, setAutoInstallingLib] = createSignal<string | null>(null);
  const attemptedLibs = new Set<string>();

  // Fullscreen state
  const [isFullscreen, setIsFullscreen] = createSignal<boolean>(false);
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  // Right side agent panel width (default 320px, resizable from 260px)
  const DEFAULT_AI_DRAWER_WIDTH = 320;
  const MIN_AI_DRAWER_WIDTH = 300;
  const getMaxAiDrawerWidth = () => Math.max(DEFAULT_AI_DRAWER_WIDTH, Math.floor(window.innerWidth * 0.45));
  const getDefaultAiDrawerWidth = () => DEFAULT_AI_DRAWER_WIDTH;

  const [aiDrawerWidth, setAiDrawerWidth] = createSignal<number>(DEFAULT_AI_DRAWER_WIDTH);

  const [aiViewMode, setAiViewMode] = createSignal<"chat" | "providers" | "history">("chat");

  const handleWindowResize = () => {
    const maxAllowed = getMaxAiDrawerWidth();
    if (aiDrawerWidth() > maxAllowed) {
      setAiDrawerWidth(maxAllowed);
    }
  };

  let libDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  let prewarmDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  let prewarmAbortController: AbortController | null = null;

  const safePrewarm = (fqbn: string, code?: string, files?: { name: string; content: string }[]) => {
    if (prewarmAbortController) {
      prewarmAbortController.abort();
    }
    prewarmAbortController = new AbortController();
    prewarmBoard(fqbn, code, files, prewarmAbortController.signal).catch(() => {});
  };

  const getLiveCode = (): string => {
    return getEditorValue?.() ?? fileManager.code();
  };

  const checkDependencies = async (sourceCode: string, fileList?: OpenFileItem[]) => {
    try {
      const filesToUse = fileList || fileManager.openFiles();
      const localFileNames = filesToUse.map((f) => f.name);
      const missing = await scanMissingLibraries(sourceCode, localFileNames);
      setMissingLibs(missing);

      if (missing.length > 0) {
        for (const item of missing) {
          const libName = item.suggested_library;
          const key = libName.toLowerCase();
          if (attemptedLibs.has(key)) continue;
          attemptedLibs.add(key);

          setAutoInstallingLib(libName);
          compiler.addLog(`\n[Auto-Install] Detected #${item.header} in code. Auto-installing "${libName}" via toolchain...`);

          try {
            const res = await installLibrary(libName);
            if (res.success) {
              compiler.addLog(`[Auto-Install] Successfully installed "${libName}"!`);
              const updated = await scanMissingLibraries(fileManager.code(), localFileNames);
              setMissingLibs(updated);
            } else {
              compiler.addLog(`[Auto-Install] Could not auto-install "${libName}": ${res.stderr || "Installation error"}`);
            }
          } catch (err: any) {
            compiler.addLog(`[Auto-Install Error] ${err.message || err}`);
          } finally {
            setAutoInstallingLib(null);
          }
        }
      }
    } catch (e) {}
  };

  // File Manager Hook
  const fileManager = useFileManager({
    addLog: (msg) => compiler.addLog(msg),
    checkDependencies,
    selectedBoard,
    getLiveCode,
    getActiveTab: () => activeTab(),
    getAiViewMode: () => aiViewMode(),
  });

  // Centralized tab updater ensuring state is synced to localStorage and Hot Exit session
  const updateActiveTab = (nextTab: ActiveTab) => {
    setActiveTab(nextTab);
    try {
      // "settings" is a transient configuration view and must NEVER be stored for auto-reopen on bootup
      if (nextTab && nextTab !== "settings") {
        localStorage.setItem("flashcode_active_tab", nextTab);
      } else {
        localStorage.removeItem("flashcode_active_tab");
      }
    } catch (e) {}
    fileManager.scheduleSessionPersist(100);
  };

  // Compiler & Uploader Pipeline Hook
  const compiler = useCompilerPipeline({
    getLiveCode,
    openFiles: fileManager.openFiles,
    activeFileId: fileManager.activeFileId,
    selectedBoard,
    selectedPort,
    boardOptions: selectedBoardOptions,
    setIsPortModalOpen,
    setActiveError,
    setActiveTab: updateActiveTab,
  });

  const handleNewWindow = async (sketchPath?: string) => {
    try {
      await createNewWindow(sketchPath);
    } catch (err) {
      console.error("Failed to open new window:", err);
    }
  };

  // Global Shortcuts Hook
  useGlobalShortcuts({
    onSave: fileManager.handleSave,
    onSaveAs: fileManager.handleSaveAs,
    onOpenFile: fileManager.handleOpenFile,
    onNewFile: fileManager.handleNewFile,
    onNewWindow: handleNewWindow,
    onCloseFile: fileManager.handleCloseFile,
    onCloseSketch: fileManager.handleCloseSketch,
    onCompile: compiler.handleCompile,
    onUpload: compiler.handleUpload,
    toggleFullscreen,
  });

  const refreshPorts = async (silent = false) => {
    try {
      const detected = await detectSerialPorts();
      setPorts(detected);
      if (detected.length > 0) {
        const current = selectedPort();
        let portToSelect: SerialPortInfo | null = null;
        if (current && detected.some((p) => p.port_name === current.port_name)) {
          portToSelect = current;
        } else {
          try {
            const savedPort = localStorage.getItem("flashcode_selected_port_name");
            if (savedPort) {
              const matched = detected.find((p) => p.port_name === savedPort);
              if (matched) portToSelect = matched;
            }
          } catch (e) {}
          if (!portToSelect) {
            portToSelect = detected[0];
          }
        }
        selectPort(portToSelect);
      } else {
        selectPort(null);
      }
    } catch (e) {
    }
  };

  const [externalPollId, setExternalPollId] = createSignal<any>(null);
  const [portPollId, setPortPollId] = createSignal<any>(null);

  const handleBeforeUnload = () => {
    try {
      const tab = activeTab();
      // "settings" must NEVER be persisted on exit
      if (tab && tab !== "settings") {
        localStorage.setItem("flashcode_active_tab", tab);
      } else {
        localStorage.removeItem("flashcode_active_tab");
      }
    } catch (e) {}
    fileManager.flushHotExitSession();
  };

  onMount(async () => {
    try {
      const saved = localStorage.getItem("flashcode_ai_panel_width");
      if (saved) {
        const val = parseInt(saved, 10);
        const maxAllowed = getMaxAiDrawerWidth();
        if (!isNaN(val) && val >= MIN_AI_DRAWER_WIDTH && val <= maxAllowed && val < 450) {
          setAiDrawerWidth(val);
        }
      }

      // Restore activeTab based on last appearance (Hot Exit / localStorage)
      // "settings" is a transient configuration view and must NEVER be restored on bootup
      const savedTab = localStorage.getItem("flashcode_active_tab");
      if (savedTab === "settings") {
        localStorage.removeItem("flashcode_active_tab");
      }
      const session = loadWorkspaceSession();
      const allowedRestoreTabs = ["files", "examples", "ai"];
      const tabToRestore = (savedTab && allowedRestoreTabs.includes(savedTab))
        ? savedTab
        : (session?.activeTab && allowedRestoreTabs.includes(session.activeTab) ? session.activeTab : null);

      if (tabToRestore) {
        setAiViewMode("chat");
        setActiveTab(tabToRestore as ActiveTab);
      } else {
        setActiveTab(null);
      }
    } catch (e) {}

    // 1. Fetch real board list
    try {
      const defaultBoards = await getDefaultBoards();
      setBoards(defaultBoards);
      if (defaultBoards.length > 0) {
        let boardToSelect = defaultBoards[0];
        try {
          const savedFqbn = localStorage.getItem("flashcode_selected_board_fqbn");
          if (savedFqbn) {
            const found = defaultBoards.find((b) => b.fqbn === savedFqbn);
            if (found) boardToSelect = found;
          }
        } catch (e) {}

        selectBoard(boardToSelect);
        if (fileManager.openFiles().length > 0 && fileManager.code()) {
          const allFiles = fileManager.openFiles().map((f) => ({
            name: f.name,
            content: f.id === fileManager.activeFileId() ? fileManager.code() : (typeof f.content === "string" ? f.content : ""),
          }));
          setTimeout(() => {
            safePrewarm(boardToSelect.fqbn, fileManager.code(), allFiles);
          }, 300);
        }
      }
    } catch (e) {
      compiler.addLog(`[Error] Failed to load boards: ${e}`);
    }

    // 2. Discover real active serial ports initially
    await refreshPorts(true);

    // Auto-detect serial port changes in real-time with dynamic backoff (1s -> 4s when idle)
    let isCheckingPorts = false;
    let portPollDelay = 1000;
    let isDestroyed = false;

    const checkPortChanges = async () => {
      if (isCheckingPorts || compiler.isUploading() || compiler.isCompiling()) return;
      isCheckingPorts = true;
      try {
        const detected = await detectSerialPorts();
        const prev = ports();

        const prevNames = prev.map((p) => p.port_name).sort().join(",");
        const currNames = detected.map((p) => p.port_name).sort().join(",");

        if (prevNames !== currNames) {
          portPollDelay = 1000; // Reset to fast polling on device plug/unplug
          setPorts(detected);

          // Detect newly plugged-in device
          const newPort = detected.find((p) => !prev.some((old) => old.port_name === p.port_name));
          if (newPort) {
            selectPort(newPort);
            compiler.addLog(`[Hardware] Microcontroller connected: ${newPort.port_name} (${newPort.description})`);
          }

          // Detect unplugged device
          const unpluggedPort = prev.find((old) => !detected.some((p) => p.port_name === old.port_name));
          if (unpluggedPort) {
            const current = selectedPort();
            if (current?.port_name === unpluggedPort.port_name) {
              selectPort(detected[0] || null);
            }
            compiler.addLog(`[Hardware] Microcontroller on ${unpluggedPort.port_name} disconnected.`);
          }
        } else {
          // No changes detected: incrementally back off polling to save CPU & network (up to 4000ms)
          portPollDelay = Math.min(Math.round(portPollDelay * 1.5), 4000);
        }
      } catch (e) {
      } finally {
        isCheckingPorts = false;
      }
    };

    const scheduleNextCheck = () => {
      if (isDestroyed) return;
      const timeoutId = setTimeout(async () => {
        await checkPortChanges();
        scheduleNextCheck();
      }, portPollDelay);
      setPortPollId(timeoutId);
    };

    scheduleNextCheck();

    // 3. Scan dependencies on initial sketch if open
    if (fileManager.openFiles().length > 0 && fileManager.code()) {
      checkDependencies(fileManager.code());
    }

    // 4. Open file from URL parameter if passed (?openFile=...) or restore Hot Exit workspace session
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const initialFilePath = urlParams.get("openFile");
      if (initialFilePath) {
        window.history.replaceState({}, document.title, window.location.pathname);
        const fileName = initialFilePath.split("/").pop() || "sketch.ino";
        await fileManager.openFileByPath(initialFilePath, fileName);
      } else {
        await fileManager.restoreSession();
      }
    } catch (e) {
      console.warn("Failed to restore initial workspace session:", e);
    }

    // 5. Background polling for pending external files from OS / double-click
    let isPolling = false;
    const pollExternalFiles = async () => {
      if (isPolling) return;
      isPolling = true;
      try {
        const res = await fetch("/api/fs/pending-external");
        const data = await safeFetchJson<{ files?: string[] }>(res);
        if (data && data.files && Array.isArray(data.files) && data.files.length > 0) {
          for (const filePath of data.files) {
            const fileName = filePath.split("/").pop() || "sketch.ino";
            await fileManager.openFileByPath(filePath, fileName);
          }
        }
      } catch {
      } finally {
        isPolling = false;
      }
    };

    const externalPollInterval = setInterval(pollExternalFiles, 1000);
    setExternalPollId(externalPollInterval);

    // 6. Fullscreen change listener
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);

    // 7. Window resize listener to keep AI panel clamped to max 50% of screen width
    window.addEventListener("resize", handleWindowResize);

    // 8. Hot Exit: Flush live editor buffer immediately on window close/refresh
    window.addEventListener("beforeunload", handleBeforeUnload);

    // 9. Enterprise Auto-Update Scheduler
    const stopAutoUpdate = initAutoUpdateSchedule();
    onCleanup(() => {
      stopAutoUpdate();
    });
  });

  onCleanup(() => {
    window.removeEventListener("beforeunload", handleBeforeUnload);
    window.removeEventListener("resize", handleWindowResize);
    document.removeEventListener("fullscreenchange", () => setIsFullscreen(!!document.fullscreenElement));
    if (externalPollId()) {
      clearInterval(externalPollId());
    }
    if (portPollId()) {
      clearTimeout(portPollId());
      clearInterval(portPollId());
    }
    if (prewarmDebounceTimer) clearTimeout(prewarmDebounceTimer);
    if (libDebounceTimer) clearTimeout(libDebounceTimer);
  });

  const onCodeInput = (newCode: string) => {
    fileManager.handleCodeChange(newCode);

    if (libDebounceTimer) clearTimeout(libDebounceTimer);
    libDebounceTimer = setTimeout(() => {
      checkDependencies(newCode);
    }, 750);

    if (prewarmDebounceTimer) clearTimeout(prewarmDebounceTimer);
    prewarmDebounceTimer = setTimeout(() => {
      const board = selectedBoard();
      if (board && fileManager.openFiles().length > 0) {
        const allFiles = fileManager.openFiles().map((f) => ({
          name: f.name,
          content: f.id === fileManager.activeFileId() ? newCode : (typeof f.content === "string" ? f.content : ""),
        }));
        safePrewarm(board.fqbn, newCode, allFiles);
      }
    }, 2500);
  };

  const handleInstallLibrary = async (libName: string) => {
    setIsInstallingLib(true);
    compiler.addLog(`\n[Library Manager] Installing real library "${libName}" via arduino-cli...`);
    compiler.setIsConsoleOpen(true);

    try {
      const res = await installLibrary(libName);
      if (res.success) {
        compiler.addLog(`[Library Manager] Successfully installed ${libName}!`);
        checkDependencies(fileManager.code());
      } else {
        compiler.addLog(`[Library Manager Failed] ${res.stderr || "Installation error"}`);
      }
    } catch (e) {
      compiler.addLog(`[Library Manager Error] ${e}`);
    } finally {
      setIsInstallingLib(false);
    }
  };

  const handleApplyCode = (rawCode: string, reason?: string) => {
    const cleanCode = sanitizeCppCode(rawCode);
    if (!cleanCode) return;

    if (fileManager.openFiles().length === 0) {
      const newFile: OpenFileItem = {
        id: `sketch-${Date.now()}`,
        name: "sketch.ino",
        path: "",
        content: cleanCode,
        isDirty: true,
      };
      fileManager.setOpenFiles([newFile]);
      fileManager.setActiveFileId(newFile.id);
      fileManager.setActiveFilePath(newFile.path);
      fileManager.setActiveFileName(newFile.name);
      fileManager.setCode(cleanCode);
      fileManager.setIsDirty(true);
      checkDependencies(cleanCode);
      persistWorkspaceSession([newFile], newFile.id);
      compiler.addLog(`[Flash Agent] Created sketch.ino and applied code: ${reason || "Applied code update"}.`);
      return;
    }
    onCodeInput(cleanCode);
    compiler.addLog(`[Flash Agent] ${reason || "Applied code update to active sketch"}.`);
  };

  const handleApplyFix = (rawFixCode: string) => {
    const fixCode = sanitizeCppCode(rawFixCode);
    if (activeError()?.line_number) {
      const lineNum = activeError()!.line_number!;
      const lines = fileManager.code().split("\n");
      if (lineNum > 0 && lineNum <= lines.length) {
        lines[lineNum - 1] = fixCode;
        onCodeInput(lines.join("\n"));
      } else {
        onCodeInput(`${fixCode}\n${fileManager.code()}`);
      }
    } else {
      onCodeInput(`${fixCode}\n${fileManager.code()}`);
    }
    compiler.addLog("[Flash AI] Applied suggested fix to editor.");
    setActiveError(null);
  };

  const handleInsertCode = (rawCode: string) => {
    const cleanCode = sanitizeCppCode(rawCode);
    onCodeInput(`${fileManager.code().trimEnd()}\n\n${cleanCode}\n`);
    compiler.addLog("[Flash AI] Inserted code snippet into editor.");
  };

  const handleTabChange = (tab: ActiveTab) => {
    let nextTab: ActiveTab = tab;
    if (tab === "boards") {
      setIsBoardModalOpen(true);
      return;
    }
    if (tab === "libraries") {
      setIsLibraryModalOpen(true);
      return;
    }
    if (tab === "settings") {
      setIsSettingsModalOpen(true);
      return;
    } else if (tab === "ai") {
      if (activeTab() === "ai") {
        nextTab = null;
      } else {
        setAiViewMode("chat");
        nextTab = "ai";
      }
    }
    updateActiveTab(nextTab);
  };

  return (
    <div class="flex h-screen w-screen bg-[#0F0F11] text-[#E4E4E7] overflow-hidden select-none font-sans">
      {/* 1. Left Primary Icon Navigation Sidebar */}
      <Sidebar
        activeTab={activeTab()}
        onTabChange={handleTabChange}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
      />

      {/* 2. Left Collapsible Sketches & Files Drawer */}
      <Suspense fallback={null}>
        <FileExplorerDrawer
          isOpen={activeTab() === "files"}
          onClose={() => updateActiveTab(null)}
          openFiles={fileManager.openFiles()}
          activeFileId={fileManager.activeFileId()}
          activeFilePath={fileManager.activeFilePath()}
          activeFileName={fileManager.activeFileName()}
          recentFiles={fileManager.recentFiles()}
          onSelectFile={fileManager.handleSelectFileTab}
          onOpenRecentFile={(p) => fileManager.openFileByPath(p, p.split("/").pop() || "sketch.ino")}
          onCloseFile={fileManager.handleCloseFileTab}
          onNewFile={fileManager.handleNewFile}
          onNewWindow={handleNewWindow}
          onOpenFile={fileManager.handleOpenFile}
          onClearRecents={fileManager.handleClearRecents}
          onRemoveRecent={fileManager.handleRemoveRecent}
          onOpenSketchFromSketchbook={fileManager.handleOpenSketchFromSketchbook}
          onAddNewTabToSketch={fileManager.handleAddNewTabToSketch}
        />

        {/* 2b. Left Collapsible Example Sketches Drawer */}
        <ExamplesDrawer
          isOpen={activeTab() === "examples"}
          onClose={() => updateActiveTab(null)}
          onOpenExample={(filePath, fileName) => fileManager.openFileByPath(filePath, fileName)}
          activeFilePath={fileManager.activeFilePath()}
        />
      </Suspense>

      {/* 3. Main Center & Right Column */}
      <div class="flex-1 flex flex-col h-full overflow-hidden">
        {/* Top Action Bar with File Menu & Execution Controls */}
        <TopBar
          selectedBoard={selectedBoard()}
          selectedPort={selectedPort()}
          isPortTakenOver={compiler.isPortTakenOver()}
          boardOptions={boardConfigOptions()}
          selectedBoardOptions={selectedBoardOptions()}
          onBoardOptionsChange={handleBoardOptionsChange}
          onResetBoardOptionsDefaults={handleResetBoardOptionsDefaults}
          isLoadingBoardOptions={isLoadingBoardOptions()}
          activeFileId={fileManager.activeFileId()}
          activeFileName={fileManager.activeFileName()}
          activeFilePath={fileManager.activeFilePath()}
          isDirty={fileManager.isDirty()}
          openFiles={fileManager.openFiles()}
          isCompiling={compiler.isCompiling()}
          isUploading={compiler.isUploading()}
          isConsoleOpen={compiler.isConsoleOpen()}
          isAiOpen={activeTab() === "ai" || activeTab() === "settings"}
          isFullscreen={isFullscreen()}
          updatePhase={updateState().phase}
          updateVersion={updateState().info?.version}
          onOpenUpdateModal={() => setIsUpdateModalOpen(true)}
          onToggleFullscreen={toggleFullscreen}
          onSelectBoardClick={() => setIsBoardModalOpen(true)}
          onSelectPortClick={() => {
            refreshPorts(true);
            setIsPortModalOpen(true);
          }}
          onCompile={compiler.handleCompile}
          onUpload={compiler.handleUpload}
          onToggleConsole={() => compiler.setIsConsoleOpen((prev) => !prev)}
          onToggleAi={() => {
            if (activeTab() === "ai" || activeTab() === "settings") {
              updateActiveTab(null);
            } else {
              setAiViewMode("chat");
              updateActiveTab("ai");
            }
          }}
          onNewFile={fileManager.handleNewFile}
          onNewWindow={handleNewWindow}
          onOpenFile={fileManager.handleOpenFile}
          onOpenExamples={() => updateActiveTab(activeTab() === "examples" ? null : "examples")}
          onCloseFile={fileManager.handleCloseFile}
          onCloseSketch={fileManager.handleCloseSketch}
          onCloseAll={fileManager.handleCloseAllFiles}
          onSave={fileManager.handleSave}
          onSaveAs={fileManager.handleSaveAs}
          onSelectTab={fileManager.handleSelectFileTab}
          onCloseTab={fileManager.handleCloseFileTab}
        />

        {/* Workspace Body */}
        <div class="flex-1 flex overflow-hidden relative">
          {/* Center Column: Monaco Editor + Console */}
          <div class="flex-1 flex flex-col h-full overflow-hidden min-w-0">
            <main class="flex-1 flex flex-col h-full overflow-hidden bg-[#0F0F11]">
              {/* Auto-Installing Library Live Status Banner */}
              <Show when={fileManager.openFiles().length > 0 && autoInstallingLib()}>
                <div class="bg-[#18181B] border-b border-[#00F0FF]/40 px-3 py-1.5 flex items-center justify-between text-xs font-mono text-[#00F0FF] animate-in fade-in duration-100">
                  <div class="flex items-center gap-2">
                    <Loader2 size={13} class="animate-spin text-[#00F0FF]" />
                    <span>
                      Auto-installing detected library <strong class="text-white font-bold">{autoInstallingLib()}</strong> from code...
                    </span>
                  </div>
                  <span class="text-[10px] text-[#A1A1AA] font-mono">Real Toolchain</span>
                </div>
              </Show>

              {/* Missing Library Auto-Detect Floating Banner */}
              <Show when={fileManager.openFiles().length > 0 && missingLibs().length > 0}>
                <div class="bg-[#18181B] border-b border-[#00F0FF]/30 px-3 py-2 flex items-center justify-between text-xs font-mono">
                  <div class="flex items-center gap-2 text-[#E4E4E7]">
                    <AlertCircle size={15} class="text-[#00F0FF]" />
                    <span>
                      Missing Library: <span class="font-bold text-[#00F0FF]">{missingLibs()[0].suggested_library}</span> ({missingLibs()[0].header})
                    </span>
                  </div>
                  <div class="flex items-center gap-2">
                    <button
                      onClick={() => setIsLibraryModalOpen(true)}
                      class="px-2.5 py-1 rounded bg-[#27272A] hover:bg-[#323238] text-[#A1A1AA] hover:text-white text-[11px] transition-colors"
                    >
                      Manage Libraries
                    </button>
                    <button
                      onClick={() => handleInstallLibrary(missingLibs()[0].suggested_library)}
                      disabled={isInstallingLib()}
                      class="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#00F0FF] hover:bg-[#38F9D7] text-[#0F0F11] font-bold text-[11px] transition-colors"
                    >
                      <Show when={isInstallingLib()} fallback={<Download size={13} />}>
                        <Loader2 size={13} class="animate-spin" />
                      </Show>
                      <span>{isInstallingLib() ? "Installing..." : "Install Library"}</span>
                    </button>
                  </div>
                </div>
              </Show>

              {/* Dedicated Editor Tab Bar - shown whenever files are open */}
              <Show when={fileManager.openFiles().length > 0}>
                <EditorTabBar
                  openFiles={fileManager.openFiles()}
                  activeFileId={fileManager.activeFileId()}
                  activeFileName={fileManager.activeFileName()}
                  onSelectTab={fileManager.handleSelectFileTab}
                  onCloseTab={fileManager.handleCloseFileTab}
                  onCloseSketch={fileManager.handleCloseSketch}
          onCheckUpdates={() => {
            setIsUpdateModalOpen(true);
            checkForUpdates(true);
          }}
                  onCloseOtherTabs={fileManager.handleCloseOtherTabs}
                  onNewFile={fileManager.handleNewFile}
                />
              </Show>

              {/* Monaco Editor Canvas or Empty State */}
              <div class="flex-1 overflow-hidden relative">
                <Show
                  when={fileManager.openFiles().length > 0 && fileManager.activeFileId()}
                  fallback={
                    <EmptyState
                      onNewFile={fileManager.handleNewFile}
                      onOpenFile={fileManager.handleOpenFile}
                      onOpenSketchbook={() => updateActiveTab("files")}
                      onOpenExamples={() => updateActiveTab("examples")}
                      recentFiles={fileManager.recentFiles()}
                      onOpenRecent={(p) => fileManager.openFileByPath(p, p.split("/").pop() || "sketch.ino")}
                      onOpenAI={() => {
                        setAiViewMode("chat");
                        updateActiveTab("ai");
                      }}
                    />
                  }
                >
                  <Suspense fallback={<EditorSkeleton />}>
                    <Editor
                      code={fileManager.code()}
                      fileId={fileManager.activeFileId()}
                      filePath={fileManager.activeFilePath()}
                      onChange={onCodeInput}
                      onSave={fileManager.handleSave}
                      onEditorReady={(fn) => { getEditorValue = fn; }}
                    />
                  </Suspense>
                </Show>
              </div>
            </main>

            {/* Bottom Console */}
            <Console
              logs={compiler.logs()}
              isOpen={compiler.isConsoleOpen()}
              isUploading={compiler.isUploading()}
              lastUploadFailed={compiler.lastUploadFailed()}
              onRetryUpload={() => compiler.handleUpload()}
              onRetrySafeUpload={() => compiler.handleUpload(undefined, 115200)}
              onClose={() => compiler.setIsConsoleOpen(false)}
              onClear={compiler.handleClearLogs}
              onExplainError={compiler.handleExplainError}
              selectedPort={selectedPort()}
              baudRate={compiler.baudRate()}
              onBaudRateChange={compiler.setBaudRate}
              lineEnding={compiler.lineEnding()}
              onLineEndingChange={compiler.setLineEnding}
              autoScroll={compiler.autoScroll()}
              onToggleAutoScroll={compiler.toggleAutoScroll}
              showTimestamp={compiler.showTimestamp()}
              onToggleTimestamp={compiler.toggleTimestamp}
              onSendSerial={compiler.handleSendSerial}
              onResetBoard={compiler.handleResetBoard}
              detectedBaud={compiler.detectedSketchBaud()}
            />
          </div>

          {/* Flash AI Copilot Side Drawer */}
          <Suspense fallback={null}>
            <AICopilotDrawer
              isOpen={activeTab() === "ai" || activeTab() === "settings"}
              viewMode={aiViewMode()}
              onViewModeChange={(m) => {
                setAiViewMode(m);
                // Only update activeTab if the drawer is ALREADY open
                // Never open a closed drawer due to an internal viewMode change
                if (activeTab() === "ai" || activeTab() === "settings") {
                  if (m === "providers") {
                    updateActiveTab("settings");
                  } else {
                    updateActiveTab("ai");
                  }
                }
              }}
              width={aiDrawerWidth()}
              onWidthChange={(newWidth) => {
                const maxAllowed = getMaxAiDrawerWidth();
                const clamped = Math.round(Math.max(MIN_AI_DRAWER_WIDTH, Math.min(maxAllowed, newWidth)));
                setAiDrawerWidth(clamped);
                try {
                  localStorage.setItem("flashcode_ai_panel_width", String(clamped));
                } catch (e) {}
              }}
              onResetWidth={() => {
                const defaultW = getDefaultAiDrawerWidth();
                setAiDrawerWidth(defaultW);
                try {
                  localStorage.setItem("flashcode_ai_panel_width", String(defaultW));
                } catch (e) {}
              }}
              onClose={() => updateActiveTab(null)}
              activeError={activeError()}
              onApplyFix={handleApplyFix}
              onInsertCode={handleInsertCode}
              onApplyCode={handleApplyCode}
              onCompile={compiler.handleCompile}
              onUpload={compiler.handleUpload}
              currentCode={fileManager.code()}
              selectedBoard={selectedBoard()}
              selectedPort={selectedPort()}
              isCompiling={compiler.isCompiling()}
              isUploading={compiler.isUploading()}
            />
          </Suspense>
        </div>

        {/* Bottom Status Bar */}
        <StatusBar
          selectedBoard={selectedBoard()}
          isCompiling={compiler.isCompiling()}
          isUploading={compiler.isUploading()}
          lastElapsedMs={compiler.lastElapsedMs()}
          ccacheUsed={compiler.ccacheUsed()}
          ccacheHit={compiler.ccacheHit()}
          lastAction={compiler.lastAction()}
        />
      </div>

      {/* Modals */}
      <Suspense fallback={null}>
        <BoardSelectorModal
          isOpen={isBoardModalOpen()}
          boards={boards()}
          selectedBoard={selectedBoard()}
          onSelect={(b) => {
            selectBoard(b);
            if (fileManager.openFiles().length > 0 && fileManager.code()) {
              const currentFiles = fileManager.openFiles().map((f) => ({
                name: f.name,
                content: typeof f.content === "string" ? f.content : ((f.content as any)?.content || String(f.content || "")),
              }));
              safePrewarm(b.fqbn, fileManager.code(), currentFiles);
            }
          }}
          onBoardsUpdated={(updated) => setBoards(updated)}
          onLog={compiler.addLog}
          onClose={() => setIsBoardModalOpen(false)}
        />

        <PortSelectorModal
          isOpen={isPortModalOpen()}
          ports={ports()}
          selectedPort={selectedPort()}
          uploadSpeed={compiler.uploadSpeed()}
          onSelectSpeed={(speed) => {
            compiler.setUploadSpeed(speed);
            try {
              localStorage.setItem("flashcode_upload_speed", String(speed));
            } catch (e) {}
            compiler.addLog(
              speed === "auto"
                ? `[Uploader] Upload baud rate configured to: Auto (921600 for ESP32 with auto-fallback)`
                : `[Uploader] Upload baud rate configured to: ${speed}`
            );
          }}
          onSelect={(p) => {
            selectPort(p);
          }}
          onRefresh={() => refreshPorts(false)}
          onClose={() => setIsPortModalOpen(false)}
        />

        <LibraryManagerModal
          isOpen={isLibraryModalOpen()}
          onClose={() => {
            setIsLibraryModalOpen(false);
            checkDependencies(fileManager.code());
          }}
          onLog={compiler.addLog}
        />

        <UpdateModal
          isOpen={isUpdateModalOpen()}
          onClose={() => setIsUpdateModalOpen(false)}
          isCompiling={compiler.isCompiling()}
          isUploading={compiler.isUploading()}
        />

        <SettingsModal
          isOpen={isSettingsModalOpen()}
          onClose={() => setIsSettingsModalOpen(false)}
          onOpenUpdateModal={() => setIsUpdateModalOpen(true)}
          isCompiling={compiler.isCompiling()}
          isUploading={compiler.isUploading()}
          hasUnsavedChanges={fileManager.openFiles().some((f) => f.isDirty) || fileManager.isDirty()}
        />
      </Suspense>
    </div>
  );
};

export default App;
