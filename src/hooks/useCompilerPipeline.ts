import { createSignal, createEffect, onMount, onCleanup } from "solid-js";
import {
  BoardInfo,
  SerialPortInfo,
  ErrorTranslationResponse,
  compileSketch,
  uploadSketch,
  aiTranslateError,
  constructFullFqbn,
  detectSketchBaudRate,
  startSerialMonitor,
  stopSerialMonitor,
  sendSerialData,
  resetTargetBoard,
  isTauri,
} from "../services/tauri";
import { listen } from "@tauri-apps/api/event";
import { OpenFileItem } from "../components/TopBar";

export interface CompilerPipelineOptions {
  getLiveCode: () => string;
  openFiles: () => OpenFileItem[];
  activeFileId: () => string;
  selectedBoard: () => BoardInfo | null;
  selectedPort: () => SerialPortInfo | null;
  boardOptions?: () => Record<string, string>;
  setIsPortModalOpen: (open: boolean) => void;
  setActiveError: (err: ErrorTranslationResponse | null) => void;
  setActiveTab: (tab: any) => void;
}

const MAX_LOGS = 10000;

function formatTimestamp(): string {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, "0");
  const m = String(now.getMinutes()).padStart(2, "0");
  const s = String(now.getSeconds()).padStart(2, "0");
  const ms = String(now.getMilliseconds()).padStart(3, "0");
  return `[${h}:${m}:${s}.${ms}] `;
}

export function useCompilerPipeline(options: CompilerPipelineOptions) {
  const [isCompiling, setIsCompiling] = createSignal(false);
  const [isUploading, setIsUploading] = createSignal(false);
  const [uploadSpeed, setUploadSpeed] = createSignal<string | number>("auto");
  const [lastUploadFailed, setLastUploadFailed] = createSignal<boolean>(false);
  const [logs, setLogs] = createSignal<string[]>([]);
  const [isConsoleOpen, setIsConsoleOpen] = createSignal(true);
  const [lastElapsedMs, setLastElapsedMs] = createSignal<number | null>(null);
  const [ccacheUsed, setCcacheUsed] = createSignal(false);
  const [ccacheHit, setCcacheHit] = createSignal(false);
  const [lastAction, setLastAction] = createSignal<"compile" | "upload" | null>(null);

  // Serial Monitor Settings
  const [baudRate, setBaudRate] = createSignal<number>(115200);
  const [lineEnding, setLineEnding] = createSignal<"both" | "nl" | "cr" | "none">("both");
  const [autoScroll, setAutoScroll] = createSignal<boolean>(true);
  const [showTimestamp, setShowTimestamp] = createSignal<boolean>(false);

  let compileAbortController: AbortController | null = null;
  let uploadAbortController: AbortController | null = null;
  let partialLine = "";
  let pendingCR = false;
  let lineStartedWithTimestamp = false;
  let incomingSerialBuffer: string[] = [];
  let flushTimer: any = null;

  const flushSerialBuffer = () => {
    flushTimer = null;
    if (incomingSerialBuffer.length === 0) return;

    const text = incomingSerialBuffer.join("");
    incomingSerialBuffer = [];

    setLogs((prev) => {
      const updated = [...prev];
      let hasPartialOnStack = partialLine !== "" && updated.length > 0;
      const addTimestamp = showTimestamp();

      for (let i = 0; i < text.length; i++) {
        const ch = text[i];

        // Handle pending CR from previous chunk boundary
        if (pendingCR) {
          pendingCR = false;
          if (ch === "\n") {
            // CRLF completed!
            hasPartialOnStack = false;
            partialLine = "";
            lineStartedWithTimestamp = false;
            continue;
          } else {
            // Standalone CR: overwrite current active line
            partialLine = "";
            lineStartedWithTimestamp = false;
          }
        }

        if (ch === "\r") {
          // Check if followed immediately by '\n' (CRLF)
          if (i + 1 < text.length) {
            if (text[i + 1] === "\n") {
              i++; // consume '\n'
              hasPartialOnStack = false;
              partialLine = "";
              lineStartedWithTimestamp = false;
            } else {
              // Standalone \r: in-place carriage return to column 0
              partialLine = "";
              lineStartedWithTimestamp = false;
            }
          } else {
            // \r at very end of chunk: hold until next chunk
            pendingCR = true;
          }
        } else if (ch === "\n") {
          // LF: commit current line
          hasPartialOnStack = false;
          partialLine = "";
          lineStartedWithTimestamp = false;
        } else {
          // Normal character or ANSI escape byte
          if (partialLine === "" && addTimestamp && !lineStartedWithTimestamp) {
            partialLine = formatTimestamp();
            lineStartedWithTimestamp = true;
          }

          partialLine += ch;

          if (hasPartialOnStack && updated.length > 0) {
            updated[updated.length - 1] = partialLine;
          } else {
            updated.push(partialLine);
            hasPartialOnStack = true;
          }
        }
      }

      if (updated.length > MAX_LOGS) {
        return updated.slice(updated.length - MAX_LOGS);
      }
      return updated;
    });
  };

  const appendSerialChunk = (chunk: string) => {
    if (!chunk) return;
    incomingSerialBuffer.push(chunk);
    if (!flushTimer) {
      if (typeof requestAnimationFrame === "function") {
        flushTimer = requestAnimationFrame(() => flushSerialBuffer());
      } else {
        flushTimer = setTimeout(flushSerialBuffer, 16);
      }
    }
  };

  const handleClearLogs = () => {
    if (flushTimer) {
      if (typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(flushTimer);
      } else {
        clearTimeout(flushTimer);
      }
      flushTimer = null;
    }
    incomingSerialBuffer = [];
    partialLine = "";
    pendingCR = false;
    lineStartedWithTimestamp = false;
    setLogs([]);
  };

  const addLog = (msg: string) => {
    if (incomingSerialBuffer.length > 0) {
      flushSerialBuffer();
    }
    partialLine = "";
    pendingCR = false;
    lineStartedWithTimestamp = false;
    setLogs((prev) => {
      const next = [...prev, msg];
      return next.length > MAX_LOGS ? next.slice(next.length - MAX_LOGS) : next;
    });
  };

  // Dedicated reactive effect managing serial monitor connection lifecycle
  const [isPortTakenOver, setIsPortTakenOver] = createSignal(false);
  const [isMonitorPaused, setIsMonitorPaused] = createSignal(false);
  let activeMonitorPort: string | null = null;
  let activeMonitorBaud: number | null = null;
  let reconnectTimer: any = null;
  let didStreamUploadLogs = false;

  createEffect(() => {
    const port = options.selectedPort();
    const open = isConsoleOpen();
    const uploading = isUploading();
    const paused = isMonitorPaused();
    const baud = baudRate();

    // Never interfere with serial monitor while backend upload orchestrates pause -> flash -> resume
    if (uploading || paused) {
      return;
    }

    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    if (open && port) {
      if (activeMonitorPort !== port.port_name || activeMonitorBaud !== baud) {
        setIsPortTakenOver(false);
        const isBaudOnlySwitch = activeMonitorPort === port.port_name && activeMonitorBaud !== null;
        activeMonitorPort = port.port_name;
        activeMonitorBaud = baud;

        if (isBaudOnlySwitch) {
          // Instant in-place baud rate switch on active serial file descriptor: 0ms delay, zero board reset
          startSerialMonitor(port.port_name, baud)
            .then((ok) => {
              if (ok) {
                setIsPortTakenOver(false);
                addLog(`[Serial Monitor] Switched to ${baud} baud`);
              }
            })
            .catch((err) => {
              const errStr = String(err);
              if (errStr.includes("PORT_UPLOADING")) return;
              if (errStr.includes("PORT_LOCKED")) {
                setIsPortTakenOver(true);
              }
              addLog(`[Serial Monitor Error] Could not switch baud rate: ${err}`);
            });
        } else {
          // Initial connection or port switch: 100ms settle delay
          reconnectTimer = setTimeout(() => {
            if (isUploading() || isMonitorPaused()) return;
            startSerialMonitor(port.port_name, baud)
              .then((ok) => {
                if (ok) {
                  setIsPortTakenOver(false);
                  addLog(`[Serial Monitor] Connected to ${port.port_name} at ${baud} baud`);
                }
              })
              .catch((err) => {
                const errStr = String(err);
                if (errStr.includes("PORT_UPLOADING")) return;
                if (errStr.includes("PORT_LOCKED")) {
                  setIsPortTakenOver(true);
                }
                addLog(`[Serial Monitor Error] Could not connect to ${port.port_name}: ${err}`);
              });
          }, 100);
        }
      }
    } else {
      if (activeMonitorPort !== null) {
        activeMonitorPort = null;
        activeMonitorBaud = null;
        stopSerialMonitor().catch(() => {});
      }
    }
  });

  onMount(() => {
    try {
      const saved = localStorage.getItem("flashcode_upload_speed");
      if (saved) {
        setUploadSpeed(saved);
      }
      const savedConsole = localStorage.getItem("flashcode_console_open");
      if (savedConsole !== null) {
        setIsConsoleOpen(savedConsole === "true");
      }
      const savedBaud = localStorage.getItem("flashcode_serial_baud_rate");
      if (savedBaud) {
        const parsed = parseInt(savedBaud, 10);
        if (!isNaN(parsed) && parsed > 0) setBaudRate(parsed);
      }
      const savedEnding = localStorage.getItem("flashcode_serial_line_ending");
      if (savedEnding && ["both", "nl", "cr", "none"].includes(savedEnding)) {
        setLineEnding(savedEnding as any);
      }
      const savedAutoScroll = localStorage.getItem("flashcode_serial_autoscroll");
      if (savedAutoScroll !== null) {
        setAutoScroll(savedAutoScroll === "true");
      }
      const savedTimestamp = localStorage.getItem("flashcode_serial_show_timestamp");
      if (savedTimestamp !== null) {
        setShowTimestamp(savedTimestamp === "true");
      }

      // Listen for incoming serial monitor chunks and upload lifecycle events from Rust backend
      try {
        listen<string>("serial-output", (event) => {
          if (event.payload !== undefined && event.payload !== null) {
            appendSerialChunk(String(event.payload));
          }
        });
        listen<{ stage?: string; type?: string; message?: string }>("upload-progress", (event) => {
          const msg = event.payload?.message;
          if (msg) {
            didStreamUploadLogs = true;
            addLog(msg);
          }
        });
        listen<{ port: string; baud_rate: number }>("serial-paused", (event) => {
          if (options.selectedPort()?.port_name === event.payload.port) {
            if (reconnectTimer) {
              clearTimeout(reconnectTimer);
              reconnectTimer = null;
            }
            setIsMonitorPaused(true);
            activeMonitorPort = event.payload.port;
            activeMonitorBaud = event.payload.baud_rate;
          }
        });
        listen<{ port: string; baud_rate: number; error?: string }>("serial-resumed", (event) => {
          if (options.selectedPort()?.port_name === event.payload.port) {
            setIsMonitorPaused(false);
            if (event.payload.error) {
              activeMonitorPort = null;
              activeMonitorBaud = null;
            } else {
              activeMonitorPort = event.payload.port;
              activeMonitorBaud = event.payload.baud_rate;
            }
          }
        });
        listen<string>("serial-disconnected", () => {
          if (isUploading() || isMonitorPaused()) {
            return;
          }
          activeMonitorPort = null;
          activeMonitorBaud = null;
          // Auto-reconnect retry: if the port is re-detected or still selected and NOT taken over, retry connecting after 800ms
          if (reconnectTimer) clearTimeout(reconnectTimer);
          reconnectTimer = setTimeout(() => {
            const p = options.selectedPort();
            if (p && isConsoleOpen() && !isUploading() && !isMonitorPaused() && !isPortTakenOver()) {
              activeMonitorPort = p.port_name;
              activeMonitorBaud = baudRate();
              startSerialMonitor(p.port_name, baudRate()).catch(() => {});
            }
          }, 800);
        });
        listen<{ port: string; new_owner?: string; reason?: string }>("port-taken-over", (event) => {
          if (options.selectedPort()?.port_name === event.payload.port) {
            if (reconnectTimer) {
              clearTimeout(reconnectTimer);
              reconnectTimer = null;
            }
            activeMonitorPort = null;
            activeMonitorBaud = null;
            setIsPortTakenOver(true);
          }
        });
      } catch (_) {}
    } catch (e) {}
  });

  onCleanup(() => {
    if (flushTimer) {
      if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(flushTimer);
      else clearTimeout(flushTimer);
      flushTimer = null;
    }
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    stopSerialMonitor().catch(() => {});
  });

  const setConsoleOpenAndPersist = (val: boolean | ((prev: boolean) => boolean)) => {
    setIsConsoleOpen((prev) => {
      const next = typeof val === "function" ? val(prev) : val;
      try {
        localStorage.setItem("flashcode_console_open", String(next));
      } catch (e) {}
      return next;
    });
  };

  const detectedSketchBaud = () => {
    const code = options.getLiveCode ? options.getLiveCode() : "";
    return detectSketchBaudRate(code);
  };

  const handleBaudRateChange = (newBaud: number) => {
    setBaudRate(newBaud);
    try {
      localStorage.setItem("flashcode_serial_baud_rate", String(newBaud));
    } catch (_) {}
  };

  const handleLineEndingChange = (ending: "both" | "nl" | "cr" | "none") => {
    setLineEnding(ending);
    try {
      localStorage.setItem("flashcode_serial_line_ending", ending);
    } catch (_) {}
  };

  const handleToggleAutoScroll = () => {
    setAutoScroll((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("flashcode_serial_autoscroll", String(next));
      } catch (_) {}
      return next;
    });
  };

  const handleToggleTimestamp = () => {
    setShowTimestamp((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("flashcode_serial_show_timestamp", String(next));
      } catch (_) {}
      return next;
    });
  };

  const handleSendSerial = async (rawText: string) => {
    if (!rawText.trim()) return;
    const port = options.selectedPort();
    if (!port) {
      addLog("[Serial Error] Cannot send message: No serial port connected.");
      return;
    }

    let suffix = "\r\n";
    if (lineEnding() === "nl") suffix = "\n";
    else if (lineEnding() === "cr") suffix = "\r";
    else if (lineEnding() === "none") suffix = "";

    const payload = rawText + suffix;
    addLog(`[TX] ${rawText}`);

    try {
      await sendSerialData(payload);
    } catch (e) {
      addLog(`[Serial TX Error] Failed to send: ${e}`);
    }
  };

  const handleResetBoard = async () => {
    const port = options.selectedPort();
    addLog("[Serial Monitor] Pulsing hardware reset (DTR/RTS)...");
    try {
      const ok = await resetTargetBoard(port?.port_name);
      if (ok) {
        addLog("[Serial Monitor] Target board reset triggered.");
      } else {
        addLog("[Serial Error] Failed to pulse target board reset.");
      }
    } catch (e: any) {
      addLog(`[Serial Error] Hardware reset error: ${e?.message || e}`);
    }
  };

  const handleExplainError = async (errorTrace: string) => {
    const board = options.selectedBoard()?.name || "ESP32";
    const translation = await aiTranslateError(errorTrace, options.getLiveCode(), board);
    options.setActiveError(translation);
    options.setActiveTab("ai");
  };

  const gatherSketchFiles = (liveCode: string) =>
    options.openFiles().map((f) => {
      const rawContent = f.id === options.activeFileId() ? liveCode : f.content;
      const cleanContent =
        typeof rawContent === "string"
          ? rawContent
          : ((rawContent as any)?.content || String(rawContent || ""));
      return {
        name: f.name,
        content: cleanContent,
      };
    });

  const handleCompile = async (
    overrideCode?: string
  ): Promise<{ success: boolean; elapsed_ms: number; stdout: string; stderr: string; error?: string }> => {
    if (isCompiling()) {
      addLog("[Compiler] Compilation already in progress, please wait...");
      return { success: false, elapsed_ms: 0, stdout: "", stderr: "Compilation already running." };
    }

    if (options.openFiles().length === 0) {
      addLog("[Compile Warning] No sketch open. Please create (Ctrl+N) or open a sketch first.");
      setIsConsoleOpen(true);
      return { success: false, elapsed_ms: 0, stdout: "", stderr: "No sketch open." };
    }

    const board = options.selectedBoard();
    if (!board) {
      addLog("[Error] Please select a target board first.");
      setIsConsoleOpen(true);
      return { success: false, elapsed_ms: 0, stdout: "", stderr: "No target board selected." };
    }

    const targetCode = typeof overrideCode === "string" ? overrideCode : options.getLiveCode();
    const effectiveFqbn = constructFullFqbn(board.fqbn, options.boardOptions?.() || {});
    setIsCompiling(true);
    setIsConsoleOpen(true);
    addLog(`\n[Compiler] Verifying code for ${board.name} (${effectiveFqbn})...`);

    if (compileAbortController) {
      compileAbortController.abort();
    }
    compileAbortController = new AbortController();
    const currentSignal = compileAbortController.signal;
    didStreamUploadLogs = false;

    try {
      const currentFiles = gatherSketchFiles(targetCode);

      // Pass code to Turbo compile engine
      const result = await compileSketch(targetCode, effectiveFqbn, "verify", currentFiles, currentSignal);
      setLastElapsedMs(result.elapsed_ms);
      setCcacheUsed(result.ccache_used);

      if (!didStreamUploadLogs) {
        if (result.stdout) {
          result.stdout.split("\n").filter(Boolean).forEach((line) => addLog(line));
        }
        if (result.stderr) {
          result.stderr.split("\n").filter(Boolean).forEach((line) => addLog(line));
        }
      }

      if (result.success) {
        setLastAction("compile");
        setLastElapsedMs(result.elapsed_ms);
        setCcacheUsed(Boolean(result.ccache_used));
        setCcacheHit(Boolean(result.ccache_hit));
        const cacheTag = result.cached_build
          ? "(cached binary)"
          : result.ccache_hit
          ? "(ccache hit)"
          : result.ccache_used
          ? "(ccache active)"
          : "";
        addLog(
          `[Success] Verification succeeded in ${result.elapsed_ms}ms! ${cacheTag}`
        );
        options.setActiveError(null);
      } else {
        addLog(`[Verify Failed] Real compiler error returned by GCC/Clang (${result.elapsed_ms}ms).`);
        handleExplainError(result.stderr || result.stdout);
      }
      return result;
    } catch (e: any) {
      if (e.name === "AbortError" || e.message?.includes("aborted")) {
        addLog("[Compiler] Compilation cancelled.");
        return { success: false, elapsed_ms: 0, stdout: "", stderr: "Compilation cancelled.", error: "Cancelled" };
      }
      const errMsg = e.message || String(e);
      addLog(`[Compilation Failed] ${errMsg}`);
      return { success: false, elapsed_ms: 0, stdout: "", stderr: errMsg, error: errMsg };
    } finally {
      setIsCompiling(false);
    }
  };

  const handleUpload = async (
    overrideCode?: string,
    forcedSpeed?: number | string
  ): Promise<{ success: boolean; elapsed_ms: number; stdout: string; stderr: string; error?: string }> => {
    if (isCompiling()) {
      addLog("[Upload] A compilation is currently running, please wait...");
      return { success: false, elapsed_ms: 0, stdout: "", stderr: "Compilation already running." };
    }

    if (isUploading()) {
      addLog("[Upload] An upload is already in progress, please wait...");
      return { success: false, elapsed_ms: 0, stdout: "", stderr: "Upload already running." };
    }

    if (options.openFiles().length === 0) {
      addLog("[Upload Warning] No sketch open. Please create (Ctrl+N) or open a sketch first.");
      setIsConsoleOpen(true);
      return { success: false, elapsed_ms: 0, stdout: "", stderr: "No sketch open." };
    }

    const board = options.selectedBoard();
    const port = options.selectedPort();

    if (!board) {
      addLog("[Error] Please select a target board first.");
      setIsConsoleOpen(true);
      return { success: false, elapsed_ms: 0, stdout: "", stderr: "No target board selected." };
    }
    if (!port) {
      addLog("[Upload Error] No USB serial port connected. Please plug in your board.");
      setIsConsoleOpen(true);
      options.setIsPortModalOpen(true);
      return { success: false, elapsed_ms: 0, stdout: "", stderr: "No USB serial port selected." };
    }

    const targetCode = typeof overrideCode === "string" ? overrideCode : options.getLiveCode();
    const effectiveFqbn = constructFullFqbn(board.fqbn, options.boardOptions?.() || {});
    setIsUploading(true);
    setIsConsoleOpen(true);
    setLastUploadFailed(false);
    addLog(`\n[Uploader] Preparing upload to ${board.name} on ${port.port_name} (${effectiveFqbn})...`);

    if (uploadAbortController) {
      uploadAbortController.abort();
    }
    uploadAbortController = new AbortController();
    const currentSignal = uploadAbortController.signal;
    didStreamUploadLogs = false;

    try {
      // In HTTP/Web mode, stop serial monitor manually; in Tauri mode, Rust backend
      // compiles first and deterministically handles pause -> flash -> resume on port.
      if (!isTauri()) {
        await stopSerialMonitor().catch(() => {});
        activeMonitorPort = null;
        activeMonitorBaud = null;
      }

      const currentFiles = gatherSketchFiles(targetCode);

      const speedToUse = forcedSpeed !== undefined ? forcedSpeed : uploadSpeed();

      const result = await uploadSketch(
        targetCode,
        effectiveFqbn,
        port.port_name,
        currentFiles,
        (line) => {
          didStreamUploadLogs = true;
          addLog(line);
        },
        speedToUse === "auto" ? undefined : speedToUse,
        currentSignal
      );

      if (!didStreamUploadLogs) {
        if (result.stdout) {
          result.stdout.split("\n").filter(Boolean).forEach((line) => addLog(line));
        }
        if (result.stderr) {
          result.stderr.split("\n").filter(Boolean).forEach((line) => addLog(line));
        }
      }

      if (result.success) {
        setLastUploadFailed(false);
        setLastAction("upload");
        setLastElapsedMs(result.elapsed_ms);
      } else {
        setLastUploadFailed(true);
      }
      return result;
    } catch (e: any) {
      if (e.name === "AbortError" || e.message?.includes("aborted")) {
        addLog("[Upload] Upload cancelled.");
        setLastUploadFailed(false);
        return { success: false, elapsed_ms: 0, stdout: "", stderr: "Upload cancelled.", error: "Cancelled" };
      }
      const errMsg = e.message || String(e);
      addLog(`[Upload Error] ${errMsg}`);
      setLastUploadFailed(true);
      return { success: false, elapsed_ms: 0, stdout: "", stderr: errMsg, error: errMsg };
    } finally {
      setIsMonitorPaused(false);
      setIsUploading(false);
    }
  };

  return {
    isCompiling,
    isUploading,
    uploadSpeed,
    setUploadSpeed,
    lastUploadFailed,
    logs,
    setLogs,
    isConsoleOpen,
    setIsConsoleOpen: setConsoleOpenAndPersist,
    lastElapsedMs,
    ccacheUsed,
    ccacheHit,
    lastAction,
    addLog,
    handleClearLogs,
    handleCompile,
    handleUpload,
    handleExplainError,
    baudRate,
    setBaudRate: handleBaudRateChange,
    lineEnding,
    setLineEnding: handleLineEndingChange,
    autoScroll,
    toggleAutoScroll: handleToggleAutoScroll,
    showTimestamp,
    toggleTimestamp: handleToggleTimestamp,
    handleSendSerial,
    handleResetBoard,
    detectedSketchBaud,
    isPortTakenOver,
    setIsPortTakenOver,
  };
}
