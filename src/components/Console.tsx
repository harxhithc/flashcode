import { Component, For, Index, Show, createEffect, createSignal, onMount, onCleanup } from "solid-js";
import {
  Trash2,
  X,
  ChevronDown,
  ArrowDownToLine,
  Clock,
  Terminal,
  Search,
  Copy,
  Check,
  Maximize2,
  Minimize2,
  WrapText,
  ArrowDown,
  Filter,
  Activity,
  Download,
  RotateCw,
} from "lucide-solid";
import { SerialPortInfo, STANDARD_BAUD_RATES, resetTargetBoard } from "../services/tauri";
import { hasAnsi, parseAnsiLine, stripAnsi } from "../services/ansi";
import { SerialPlotter } from "./SerialPlotter";

export interface ConsoleProps {
  logs: string[];
  isOpen: boolean;
  isUploading?: boolean;
  lastUploadFailed?: boolean;
  onRetryUpload?: () => void;
  onRetrySafeUpload?: () => void;
  onClose: () => void;
  onClear: () => void;
  onExplainError?: (errorText: string) => void;
  selectedPort?: SerialPortInfo | null;
  baudRate?: number;
  onBaudRateChange?: (baud: number) => void;
  lineEnding?: "both" | "nl" | "cr" | "none";
  onLineEndingChange?: (ending: "both" | "nl" | "cr" | "none") => void;
  autoScroll?: boolean;
  onToggleAutoScroll?: () => void;
  showTimestamp?: boolean;
  onToggleTimestamp?: () => void;
  onSendSerial?: (text: string) => void;
  onResetBoard?: () => void;
  detectedBaud?: number | null;
}

const LINE_HEIGHT = 22;
const styleCache = new Map<string, string>();
const MAX_CACHE_SIZE = 2000;

function splitByMatch(text: string, query: string): Array<{ text: string; isMatch: boolean }> {
  if (!query) return [{ text, isMatch: false }];
  const q = query.toLowerCase();
  const lower = text.toLowerCase();
  const parts: Array<{ text: string; isMatch: boolean }> = [];
  let lastIndex = 0;
  let idx = lower.indexOf(q, lastIndex);

  while (idx !== -1) {
    if (idx > lastIndex) {
      parts.push({ text: text.slice(lastIndex, idx), isMatch: false });
    }
    parts.push({ text: text.slice(idx, idx + q.length), isMatch: true });
    lastIndex = idx + q.length;
    idx = lower.indexOf(q, lastIndex);
  }

  if (lastIndex < text.length) {
    parts.push({ text: text.slice(lastIndex), isMatch: false });
  }

  return parts;
}

function getLineColor(line: string): string {
  const cacheKey = line.length > 120 ? line.slice(0, 120) : line;
  const cached = styleCache.get(cacheKey);
  if (cached) return cached;

  const lower = cacheKey.toLowerCase();
  let color = "text-[#A1A1AA]";

  if (
    lower.includes("error:") ||
    lower.includes("[upload failed]") ||
    lower.includes("[upload error]") ||
    lower.includes("[permission error]") ||
    lower.includes("fatal error") ||
    lower.includes("failed uploading")
  ) {
    color = "text-[#F87171] font-semibold";
  } else if (
    lower.includes("warning:") ||
    lower.includes("[esp32 bootloader guide]") ||
    lower.includes("[nano bootloader guide]") ||
    lower.includes("connecting........")
  ) {
    color = "text-[#FBBF24]";
  } else if (
    cacheKey.includes("[Success]") ||
    lower.includes("completed in") ||
    lower.includes("successfully") ||
    lower.includes("cache hit") ||
    lower.includes("hash of data verified") ||
    lower.includes("hard resetting via rts")
  ) {
    color = "text-[#34D399]";
  } else if (
    lower.includes("writing at 0x") ||
    lower.includes("compressed ") ||
    lower.includes("flash will be erased")
  ) {
    color = "text-[#22D3EE]";
  } else if (
    cacheKey.startsWith("[FlashCode") ||
    cacheKey.startsWith("[Compiler]") ||
    cacheKey.startsWith("[Uploader]") ||
    cacheKey.startsWith("[ccache]") ||
    cacheKey.startsWith("[Port]") ||
    cacheKey.startsWith("[Hardware]")
  ) {
    color = "text-[#00F0FF]";
  } else if (cacheKey.startsWith("[Serial")) {
    color = "text-[#38F9D7]";
  } else if (cacheKey.startsWith("[TX]")) {
    color = "text-[#38BDF8] font-medium";
  } else if (
    cacheKey.startsWith("Chip is") ||
    cacheKey.startsWith("Features:") ||
    cacheKey.startsWith("MAC:")
  ) {
    color = "text-[#D4D4D8]";
  }

  if (styleCache.size >= MAX_CACHE_SIZE) {
    styleCache.clear();
  }
  styleCache.set(cacheKey, color);
  return color;
}

export const Console: Component<ConsoleProps> = (props) => {
  let scrollRef: HTMLDivElement | undefined;
  let searchInputRef: HTMLInputElement | undefined;

  // View Mode: Terminal Monitor vs Serial Plotter
  const [viewMode, setViewMode] = createSignal<"terminal" | "plotter">("terminal");

  // Sizing & Maximized state
  const [panelHeight, setPanelHeight] = createSignal<number>(240);
  const [isMaximized, setIsMaximized] = createSignal<boolean>(false);

  // Serial input state & command history
  const [inputText, setInputText] = createSignal("");
  const [commandHistory, setCommandHistory] = createSignal<string[]>([]);
  let historyIndex = -1;
  let draftInput = "";

  // Viewport & Scrolling
  const [scrollTop, setScrollTop] = createSignal(0);
  const [viewportHeight, setViewportHeight] = createSignal(200);
  const [userScrolledUp, setUserScrolledUp] = createSignal(false);
  let scrollFrameId: number | null = null;

  // View options
  const [wordWrap, setWordWrap] = createSignal<boolean>(false);
  const [isSearchOpen, setIsSearchOpen] = createSignal<boolean>(false);
  const [searchQuery, setSearchQuery] = createSignal<string>("");
  const [isFilterMode, setIsFilterMode] = createSignal<boolean>(false);
  const [copied, setCopied] = createSignal<boolean>(false);
  const [isResetting, setIsResetting] = createSignal<boolean>(false);

  const handleReset = async () => {
    if (isResetting()) return;
    setIsResetting(true);
    try {
      if (props.onResetBoard) {
        props.onResetBoard();
      } else if (props.selectedPort?.port_name) {
        await resetTargetBoard(props.selectedPort.port_name);
      }
    } finally {
      setTimeout(() => setIsResetting(false), 600);
    }
  };

  onMount(() => {
    try {
      const savedHeight = localStorage.getItem("flashcode_console_height");
      if (savedHeight) {
        const parsed = parseInt(savedHeight, 10);
        if (!isNaN(parsed) && parsed >= 120 && parsed <= window.innerHeight - 80) {
          setPanelHeight(parsed);
        }
      }
      const savedWrap = localStorage.getItem("flashcode_console_word_wrap");
      if (savedWrap !== null) {
        setWordWrap(savedWrap === "true");
      }
      const savedHistory = localStorage.getItem("flashcode_serial_history");
      if (savedHistory) {
        const parsed = JSON.parse(savedHistory);
        if (Array.isArray(parsed)) setCommandHistory(parsed.slice(-50));
      }
    } catch (_) {}

    // Global keyboard shortcuts: Ctrl+L to clear, Ctrl+F to search
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (!props.isOpen) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "l") {
        e.preventDefault();
        handleClear();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setIsSearchOpen(true);
        setTimeout(() => searchInputRef?.focus(), 50);
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    onCleanup(() => {
      window.removeEventListener("keydown", handleGlobalKeyDown);
    });
  });

  // Filtered logs computation
  const activeLogs = () => {
    const raw = props.logs;
    const query = searchQuery().trim().toLowerCase();
    if (!query || !isFilterMode()) return raw;
    return raw.filter((line) => stripAnsi(line).toLowerCase().includes(query));
  };

  const matchCount = () => {
    const query = searchQuery().trim().toLowerCase();
    if (!query) return 0;
    let count = 0;
    const raw = props.logs;
    for (let i = 0; i < raw.length; i++) {
      if (stripAnsi(raw[i]).toLowerCase().includes(query)) count++;
    }
    return count;
  };

  const totalCount = () => activeLogs().length;

  const startIndex = () => {
    const st = scrollTop();
    const idx = Math.floor(st / LINE_HEIGHT) - 10;
    return Math.max(0, idx);
  };

  const endIndex = () => {
    const st = scrollTop();
    const vh = viewportHeight();
    const idx = Math.ceil((st + vh) / LINE_HEIGHT) + 10;
    return Math.min(totalCount(), idx);
  };

  const topSpacerHeight = () => startIndex() * LINE_HEIGHT;
  const bottomSpacerHeight = () => Math.max(0, (totalCount() - endIndex()) * LINE_HEIGHT);

  const visibleLogs = () => {
    const logs = activeLogs();
    const start = startIndex();
    const end = endIndex();
    const items: { index: number; line: string }[] = [];
    for (let i = start; i < end; i++) {
      items.push({ index: i, line: logs[i] });
    }
    return items;
  };

  // Scroll event handler with bottom threshold detection
  const onContainerScroll = (e: Event) => {
    const target = e.currentTarget as HTMLDivElement;
    const st = target.scrollTop;
    setScrollTop(st);
    if (target.clientHeight) {
      setViewportHeight(target.clientHeight);
    }

    // Stick-to-bottom detection: if within 30px of bottom, user is at bottom
    const distanceFromBottom = target.scrollHeight - st - target.clientHeight;
    if (distanceFromBottom <= 30) {
      if (userScrolledUp()) setUserScrolledUp(false);
    } else {
      if (!userScrolledUp()) setUserScrolledUp(true);
    }
  };

  // Autoscroll effect: only scroll to bottom if user has NOT scrolled up and autoscroll is enabled
  createEffect(() => {
    const _ = props.logs.length;
    if (props.autoScroll !== false && !userScrolledUp() && scrollRef && viewMode() === "terminal") {
      if (scrollFrameId !== null && typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(scrollFrameId);
      }
      if (typeof requestAnimationFrame === "function") {
        scrollFrameId = requestAnimationFrame(() => {
          if (scrollRef && !userScrolledUp()) {
            scrollRef.scrollTop = scrollRef.scrollHeight;
            setScrollTop(scrollRef.scrollTop);
          }
          scrollFrameId = null;
        });
      } else {
        scrollRef.scrollTop = scrollRef.scrollHeight;
        setScrollTop(scrollRef.scrollTop);
      }
    }
  });

  const scrollToBottom = () => {
    setUserScrolledUp(false);
    if (scrollRef) {
      scrollRef.scrollTop = scrollRef.scrollHeight;
      setScrollTop(scrollRef.scrollTop);
    }
  };

  const handleClear = () => {
    styleCache.clear();
    props.onClear();
  };

  const handleCopyAll = () => {
    const clean = props.logs.map(stripAnsi).join("\n");
    navigator.clipboard.writeText(clean).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const handleExportLogs = () => {
    const clean = props.logs.map(stripAnsi).join("\n");
    const blob = new Blob([clean], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    a.href = url;
    a.download = `flashcode-serial-log-${timestamp}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleToggleWrap = () => {
    const next = !wordWrap();
    setWordWrap(next);
    try {
      localStorage.setItem("flashcode_console_word_wrap", String(next));
    } catch (_) {}
  };

  const handleSend = (e?: Event) => {
    if (e) e.preventDefault();
    const text = inputText();
    if (!text.trim() || !props.selectedPort) return;

    // Save to command history
    setCommandHistory((prev) => {
      const next = prev.filter((cmd) => cmd !== text);
      next.push(text);
      if (next.length > 50) next.shift();
      try {
        localStorage.setItem("flashcode_serial_history", JSON.stringify(next));
      } catch (_) {}
      return next;
    });

    historyIndex = -1;
    draftInput = "";
    props.onSendSerial?.(text);
    setInputText("");
  };

  const handleInputKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      const history = commandHistory();
      if (history.length === 0) return;

      if (historyIndex === -1) {
        draftInput = inputText();
      }

      if (historyIndex + 1 < history.length) {
        historyIndex++;
        setInputText(history[history.length - 1 - historyIndex]);
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const history = commandHistory();
      if (history.length === 0) return;

      if (historyIndex > 0) {
        historyIndex--;
        setInputText(history[history.length - 1 - historyIndex]);
      } else if (historyIndex === 0) {
        historyIndex = -1;
        setInputText(draftInput);
      }
    } else if (e.key === "Escape") {
      setInputText("");
      historyIndex = -1;
    }
  };

  // Top draggable divider resize logic
  const handleResizeStart = (e: MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = panelHeight();
    document.body.style.cursor = "ns-resize";
    document.body.style.userSelect = "none";

    const onMouseMove = (ev: MouseEvent) => {
      const delta = startY - ev.clientY;
      const minH = 120;
      const maxH = window.innerHeight - 100;
      const newH = Math.min(Math.max(minH, startH + delta), maxH);
      setPanelHeight(newH);
    };

    const onMouseUp = () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      try {
        localStorage.setItem("flashcode_console_height", String(panelHeight()));
      } catch (_) {}
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const hasError = () => {
    const logs = props.logs;
    const len = logs.length;
    const start = len > 200 ? len - 200 : 0;
    for (let i = start; i < len; i++) {
      const lower = logs[i].toLowerCase();
      if (lower.includes("error:") || lower.includes("[upload failed]") || lower.includes("fatal error")) {
        return true;
      }
    }
    return false;
  };

  return (
    <Show when={props.isOpen}>
      <section
        style={{
          height: isMaximized() ? "100%" : `${panelHeight()}px`,
        }}
        class={`bg-[#0D0D0F] border-t border-[#27272A] flex flex-col font-mono text-xs z-20 relative select-none ${
          isMaximized() ? "fixed inset-x-0 bottom-0 top-12 z-30" : ""
        }`}
      >
        {/* Draggable Top Resize Handle */}
        <Show when={!isMaximized()}>
          <div
            onMouseDown={handleResizeStart}
            onDblClick={() => setPanelHeight(240)}
            class="h-1.5 w-full bg-transparent hover:bg-[#00F0FF]/40 cursor-ns-resize absolute top-0 inset-x-0 z-30 transition-colors"
            title="Drag to resize console (Double-click to reset)"
          />
        </Show>

        {/* Console & Serial Monitor Header Toolbar */}
        <div class="h-10 bg-[#141416] px-2.5 border-b border-[#27272A] flex items-center justify-between select-none gap-2 font-sans text-xs shrink-0 z-10 shadow-xs overflow-hidden">
          {/* Left: Port status & TX message input */}
          <div class="flex items-center gap-1.5 text-[#A1A1AA] flex-1 min-w-0 font-sans overflow-hidden">
            {/* Monitor / Plotter Mode Switcher */}
            <div class="flex items-center rounded bg-[#18181B] p-0.5 border border-[#27272A] shrink-0">
              <button
                type="button"
                onClick={() => setViewMode("terminal")}
                class={`h-6 flex items-center gap-1.5 px-2 rounded text-xs transition-colors font-medium cursor-pointer ${
                  viewMode() === "terminal"
                    ? "bg-[#27272A] text-white shadow-xs"
                    : "text-[#71717A] hover:text-[#D4D4D8]"
                }`}
                title="Serial Monitor Terminal"
              >
                <Terminal size={12} class={viewMode() === "terminal" ? "text-[#10B981]" : ""} />
                <span>Monitor</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("plotter")}
                class={`h-6 flex items-center gap-1.5 px-2 rounded text-xs transition-colors font-medium cursor-pointer ${
                  viewMode() === "plotter"
                    ? "bg-[#27272A] text-white shadow-xs"
                    : "text-[#71717A] hover:text-[#D4D4D8]"
                }`}
                title="Live Serial Waveform Plotter"
              >
                <Activity size={12} class={viewMode() === "plotter" ? "text-[#00F0FF]" : ""} />
                <span>Plotter</span>
              </button>
            </div>

            {/* Target Hardware Reset (DTR/RTS) */}
            <button
              type="button"
              onClick={handleReset}
              disabled={!props.selectedPort || props.isUploading}
              class={`h-7 px-2 flex items-center gap-1.5 rounded text-xs transition-colors border font-medium shrink-0 ${
                props.selectedPort && !props.isUploading
                  ? "bg-[#18181B] hover:bg-[#222226] text-[#D4D4D8] hover:text-[#00F0FF] border-[#27272A] hover:border-[#00F0FF]/40 cursor-pointer shadow-xs active:scale-95"
                  : "bg-[#18181B]/40 text-[#52525B] border-[#27272A] cursor-not-allowed opacity-60"
              }`}
              title={props.selectedPort ? "Reboot / Reset Target Board (Pulsing DTR/RTS)" : "Connect a port to reset target"}
            >
              <RotateCw size={12} class={isResetting() ? "animate-spin text-[#00F0FF]" : "text-[#71717A]"} />
              <span class="hidden xl:inline">Reset</span>
            </button>

            {/* Separator */}
            <div class="h-4 w-px bg-[#27272A] mx-0.5 shrink-0 hidden sm:block" />

            {/* Serial Message Input Form with Command History (Up/Down) */}
            <form onSubmit={handleSend} class="flex items-center flex-1 min-w-0 max-w-[320px]">
              <div class="relative flex items-center flex-1 min-w-0">
                <input
                  type="text"
                  value={inputText()}
                  onInput={(e) => setInputText(e.currentTarget.value)}
                  onKeyDown={handleInputKeyDown}
                  placeholder={props.selectedPort ? "Send message (Enter, ↑↓)..." : "Select port to send..."}
                  disabled={!props.selectedPort || props.isUploading}
                  class="h-7 w-full min-w-[70px] bg-[#18181B] border border-[#27272A] hover:border-[#3F3F46] focus:border-[#00F0FF] text-[#E4E4E7] placeholder-[#71717A] rounded px-2 text-xs outline-none font-mono transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                />
              </div>
            </form>

            {/* Smart sketch baud suggestion badge */}
            <Show when={props.detectedBaud && props.detectedBaud !== (props.baudRate || 115200)}>
              <button
                type="button"
                onClick={() => props.onBaudRateChange?.(props.detectedBaud!)}
                class="h-7 hidden 2xl:flex items-center gap-1.5 px-2 rounded text-xs transition-colors border font-medium bg-[#00F0FF]/10 hover:bg-[#00F0FF]/20 text-[#00F0FF] border-[#00F0FF]/30 cursor-pointer shrink-0"
                title={`Sketch uses Serial.begin(${props.detectedBaud}). Click to switch baud rate.`}
              >
                <span class="font-mono text-xs">Sketch: {props.detectedBaud}</span>
              </button>
            </Show>

            <Show when={hasError()}>
              <span class="h-7 hidden 2xl:flex items-center px-2 rounded text-[11px] font-medium text-[#EF4444] bg-[#EF4444]/10 border border-[#EF4444]/30 shrink-0">
                Errors Detected
              </span>
            </Show>
          </div>

          {/* Center: Search & Filter Toolbar */}
          <div class="flex items-center gap-1.5 shrink-0">
            <Show when={isSearchOpen() && viewMode() === "terminal"}>
              <div class="flex items-center gap-1.5 bg-[#18181B] border border-[#27272A] rounded px-2 h-7 animate-in fade-in duration-150 shrink-0">
                <Search size={12} class="text-[#71717A] shrink-0" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery()}
                  onInput={(e) => setSearchQuery(e.currentTarget.value)}
                  placeholder="Filter logs..."
                  class="bg-transparent text-xs text-[#E4E4E7] placeholder-[#71717A] outline-none font-mono w-24 sm:w-36"
                />
                <Show when={searchQuery().trim()}>
                  <span class="text-[10px] text-[#71717A] font-mono shrink-0">
                    {matchCount()} matches
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsFilterMode(!isFilterMode())}
                    class={`p-1 rounded text-[10px] transition-colors border ${
                      isFilterMode()
                        ? "bg-[#00F0FF]/20 text-[#00F0FF] border-[#00F0FF]/40"
                        : "bg-transparent text-[#71717A] hover:text-[#E4E4E7] border-transparent"
                    }`}
                    title={isFilterMode() ? "Showing matching lines only" : "Filter view to matching lines"}
                  >
                    <Filter size={11} />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery("");
                      setIsFilterMode(false);
                    }}
                    class="text-[#71717A] hover:text-[#E4E4E7] text-xs p-0.5"
                  >
                    <X size={11} />
                  </button>
                </Show>
              </div>
            </Show>
          </div>

          {/* Right: Arduino IDE-style controls */}
          <div class="flex items-center gap-1 shrink-0 font-sans ml-auto">
            {/* Quick Retry Actions on Upload Failure */}
            <Show when={props.lastUploadFailed && !props.isUploading}>
              <Show when={props.onRetrySafeUpload}>
                <button
                  type="button"
                  onClick={props.onRetrySafeUpload}
                  class="h-7 flex items-center gap-1.5 px-2 rounded text-xs transition-colors border font-medium bg-[#10B981]/15 hover:bg-[#10B981]/25 text-[#10B981] border-[#10B981]/40 cursor-pointer shrink-0"
                  title="Retry upload with fail-safe 115200 baud rate"
                >
                  Retry Safe (115200)
                </button>
              </Show>
              <Show when={props.onRetryUpload}>
                <button
                  type="button"
                  onClick={props.onRetryUpload}
                  class="h-7 flex items-center gap-1.5 px-2 rounded text-xs transition-colors border font-medium bg-[#FF6B00]/15 hover:bg-[#FF6B00]/25 text-[#FF6B00] border-[#FF6B00]/40 cursor-pointer shrink-0"
                  title="Retry upload with standard settings"
                >
                  Retry Upload
                </button>
              </Show>
            </Show>

            <Show when={hasError() && props.onExplainError}>
              <button
                type="button"
                onClick={() => props.onExplainError!(props.logs.join("\n"))}
                class="h-7 hidden sm:flex items-center gap-1.5 px-2 rounded text-xs transition-colors border font-medium bg-[#00F0FF]/15 hover:bg-[#00F0FF]/25 text-[#00F0FF] border-[#00F0FF]/40 cursor-pointer shrink-0"
                title="Explain errors with Flash AI"
              >
                Explain Error
              </button>
            </Show>

            {/* Search Toggle */}
            <Show when={viewMode() === "terminal"}>
              <button
                type="button"
                onClick={() => {
                  const next = !isSearchOpen();
                  setIsSearchOpen(next);
                  if (next) setTimeout(() => searchInputRef?.focus(), 50);
                  else {
                    setSearchQuery("");
                    setIsFilterMode(false);
                  }
                }}
                class={`h-7 w-7 flex items-center justify-center rounded text-xs transition-colors border cursor-pointer shrink-0 ${
                  isSearchOpen()
                    ? "bg-[#00F0FF]/15 text-[#00F0FF] border-[#00F0FF]/40 shadow-xs"
                    : "bg-[#18181B] hover:bg-[#222226] text-[#71717A] hover:text-[#E4E4E7] border-[#27272A] hover:border-[#3F3F46]"
                }`}
                title="Search and filter logs (Ctrl+F)"
              >
                <Search size={13} />
              </button>

              {/* Word Wrap Toggle */}
              <button
                type="button"
                onClick={handleToggleWrap}
                class={`h-7 w-7 hidden xl:flex items-center justify-center rounded text-xs transition-colors border cursor-pointer shrink-0 ${
                  wordWrap()
                    ? "bg-[#00F0FF]/15 text-[#00F0FF] border-[#00F0FF]/40 shadow-xs"
                    : "bg-[#18181B] hover:bg-[#222226] text-[#71717A] hover:text-[#E4E4E7] border-[#27272A] hover:border-[#3F3F46]"
                }`}
                title={wordWrap() ? "Word wrap enabled" : "Word wrap disabled (preformatted monospace)"}
              >
                <WrapText size={13} />
              </button>
            </Show>

            {/* Line Ending Selector */}
            <div class="relative flex items-center shrink-0" title="Line Ending for Serial Transmission">
              <select
                value={props.lineEnding || "both"}
                onChange={(e) => props.onLineEndingChange?.(e.currentTarget.value as any)}
                class="h-7 flex items-center rounded bg-[#18181B] hover:bg-[#222226] text-xs text-[#D4D4D8] hover:text-white border border-[#27272A] hover:border-[#3F3F46] pl-2 pr-5 font-medium cursor-pointer appearance-none transition-colors outline-none"
              >
                <option value="both" class="bg-[#18181B] text-[#E4E4E7]">Both NL & CR</option>
                <option value="nl" class="bg-[#18181B] text-[#E4E4E7]">Newline</option>
                <option value="cr" class="bg-[#18181B] text-[#E4E4E7]">Carriage Return</option>
                <option value="none" class="bg-[#18181B] text-[#E4E4E7]">No line ending</option>
              </select>
              <ChevronDown size={12} class="absolute right-1.5 top-1/2 -translate-y-1/2 text-[#71717A] pointer-events-none" />
            </div>

            {/* Baud Rate Selector */}
            <div class="relative flex items-center shrink-0" title="Serial Monitor Baud Rate">
              <select
                value={props.baudRate || 115200}
                onChange={(e) => props.onBaudRateChange?.(Number(e.currentTarget.value))}
                class="h-7 flex items-center rounded bg-[#18181B] hover:bg-[#222226] text-xs text-[#D4D4D8] hover:text-white border border-[#27272A] hover:border-[#3F3F46] pl-2 pr-5 font-medium font-mono cursor-pointer appearance-none transition-colors outline-none"
              >
                <For each={STANDARD_BAUD_RATES}>
                  {(baud) => (
                    <option value={baud} class="bg-[#18181B] text-[#E4E4E7]">
                      {baud} baud
                    </option>
                  )}
                </For>
              </select>
              <ChevronDown size={12} class="absolute right-1.5 top-1/2 -translate-y-1/2 text-[#71717A] pointer-events-none" />
            </div>

            {/* Separator */}
            <div class="h-4 w-px bg-[#27272A] mx-0.5 shrink-0" />

            <Show when={viewMode() === "terminal"}>
              {/* Autoscroll Toggle */}
              <button
                type="button"
                onClick={() => {
                  if (userScrolledUp()) {
                    scrollToBottom();
                  } else {
                    props.onToggleAutoScroll?.();
                  }
                }}
                class={`h-7 w-7 flex items-center justify-center rounded text-xs transition-colors border cursor-pointer font-medium shrink-0 ${
                  props.autoScroll !== false && !userScrolledUp()
                    ? "bg-[#00F0FF]/15 text-[#00F0FF] border-[#00F0FF]/40 shadow-xs"
                    : "bg-[#18181B] hover:bg-[#222226] text-[#71717A] hover:text-[#E4E4E7] border-[#27272A] hover:border-[#3F3F46]"
                }`}
                title={
                  props.autoScroll !== false && !userScrolledUp()
                    ? "Autoscroll enabled"
                    : "Autoscroll paused (click to resume)"
                }
              >
                <ArrowDownToLine
                  size={13}
                  class={props.autoScroll !== false && !userScrolledUp() ? "text-[#00F0FF]" : "text-[#71717A]"}
                />
              </button>

              {/* Timestamp Toggle */}
              <button
                type="button"
                onClick={props.onToggleTimestamp}
                class={`h-7 w-7 hidden xl:flex items-center justify-center rounded text-xs transition-colors border cursor-pointer font-medium shrink-0 ${
                  props.showTimestamp
                    ? "bg-[#00F0FF]/15 text-[#00F0FF] border-[#00F0FF]/40 shadow-xs"
                    : "bg-[#18181B] hover:bg-[#222226] text-[#71717A] hover:text-[#E4E4E7] border-[#27272A] hover:border-[#3F3F46]"
                }`}
                title={props.showTimestamp ? "Timestamps enabled" : "Timestamps disabled"}
              >
                <Clock size={13} class={props.showTimestamp ? "text-[#00F0FF]" : "text-[#71717A]"} />
              </button>

              {/* Copy All Logs */}
              <button
                type="button"
                onClick={handleCopyAll}
                class="h-7 w-7 hidden lg:flex items-center justify-center rounded text-xs transition-colors border bg-[#18181B] hover:bg-[#222226] text-[#71717A] hover:text-[#E4E4E7] border-[#27272A] hover:border-[#3F3F46] cursor-pointer shrink-0"
                title={copied() ? "Copied!" : "Copy all logs to clipboard"}
              >
                <Show when={copied()} fallback={<Copy size={13} />}>
                  <Check size={13} class="text-[#10B981]" />
                </Show>
              </button>

              {/* Export Log File */}
              <button
                type="button"
                onClick={handleExportLogs}
                class="h-7 w-7 hidden lg:flex items-center justify-center rounded text-xs transition-colors border bg-[#18181B] hover:bg-[#222226] text-[#71717A] hover:text-[#E4E4E7] border-[#27272A] hover:border-[#3F3F46] cursor-pointer shrink-0"
                title="Export logs to file (.txt)"
              >
                <Download size={13} />
              </button>
            </Show>

            {/* Clear Console */}
            <button
              type="button"
              onClick={handleClear}
              class="h-7 w-7 flex items-center justify-center rounded text-xs transition-colors border bg-[#18181B] hover:bg-[#222226] text-[#71717A] hover:text-[#E4E4E7] border-[#27272A] hover:border-[#3F3F46] cursor-pointer shrink-0"
              title="Clear Console (Ctrl+L)"
            >
              <Trash2 size={13} />
            </button>

            {/* Maximize / Restore Toggle */}
            <button
              type="button"
              onClick={() => setIsMaximized(!isMaximized())}
              class="h-7 w-7 flex items-center justify-center rounded text-xs transition-colors border bg-[#18181B] hover:bg-[#222226] text-[#71717A] hover:text-[#E4E4E7] border-[#27272A] hover:border-[#3F3F46] cursor-pointer shrink-0"
              title={isMaximized() ? "Restore panel size" : "Maximize console"}
            >
              <Show when={isMaximized()} fallback={<Maximize2 size={13} />}>
                <Minimize2 size={13} />
              </Show>
            </button>

            {/* Close Panel */}
            <button
              type="button"
              onClick={props.onClose}
              class="h-7 w-7 flex items-center justify-center rounded text-xs transition-colors border bg-[#18181B] hover:bg-[#222226] text-[#71717A] hover:text-[#EF4444] border-[#27272A] hover:border-[#3F3F46] cursor-pointer shrink-0"
              title="Close Serial Monitor"
            >
              <X size={13} />
            </button>
          </div>
        </div>

        {/* Content Area: Terminal Monitor or Live Plotter */}
        <Show
          when={viewMode() === "terminal"}
          fallback={<SerialPlotter logs={props.logs} />}
        >
          {/* High-Performance Virtualized Console Log Area */}
          <div
            ref={scrollRef}
            onScroll={onContainerScroll}
            class="flex-1 overflow-y-auto font-mono select-text text-xs relative bg-[#0D0D0F] overscroll-contain"
            classList={{
              "overflow-x-auto": !wordWrap(),
            }}
          >
            <div class="px-3 py-1.5 min-w-full inline-block">
              <div style={{ height: `${topSpacerHeight()}px` }} aria-hidden="true" />
              <Index each={visibleLogs()}>
                {(item) => {
                  const line = () => item().line;
                  const isAnsi = () => hasAnsi(line());
                  const query = () => searchQuery().trim();

                  return (
                    <div
                      style={{ "min-height": `${LINE_HEIGHT}px`, "line-height": `${LINE_HEIGHT}px` }}
                      class={`${
                        isAnsi() ? "text-[#E4E4E7]" : getLineColor(line())
                      } ${wordWrap() ? "whitespace-pre-wrap break-all" : "whitespace-pre"}`}
                    >
                      <Show
                        when={isAnsi()}
                        fallback={
                          <Show
                            when={query()}
                            fallback={line()}
                          >
                            <For each={splitByMatch(line(), query())}>
                              {(part) => (
                                <Show when={part.isMatch} fallback={part.text}>
                                  <mark class="bg-[#00F0FF]/30 text-[#00F0FF] rounded-xs px-0.5 font-bold">
                                    {part.text}
                                  </mark>
                                </Show>
                              )}
                            </For>
                          </Show>
                        }
                      >
                        <For each={parseAnsiLine(line())}>
                          {(span) => (
                            <span
                              class={span.color || "text-[#E4E4E7]"}
                              classList={{ "font-bold": span.bold }}
                            >
                              <Show when={query()} fallback={span.text}>
                                <For each={splitByMatch(span.text, query())}>
                                  {(part) => (
                                    <Show when={part.isMatch} fallback={part.text}>
                                      <mark class="bg-[#00F0FF]/30 text-[#00F0FF] rounded-xs px-0.5 font-bold">
                                        {part.text}
                                      </mark>
                                    </Show>
                                  )}
                                </For>
                              </Show>
                            </span>
                          )}
                        </For>
                      </Show>
                    </div>
                  );
                }}
              </Index>
              <div style={{ height: `${bottomSpacerHeight()}px` }} aria-hidden="true" />
            </div>

            {/* Floating Action Button: Scroll to Bottom Indicator */}
            <Show when={userScrolledUp()}>
              <button
                type="button"
                onClick={scrollToBottom}
                class="sticky bottom-2 float-right mr-2 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#18181B]/95 hover:bg-[#27272A] border border-[#00F0FF]/50 text-[#00F0FF] shadow-xl text-xs font-sans font-medium transition-all hover:scale-105 active:scale-95 cursor-pointer z-20 backdrop-blur-xs"
              >
                <ArrowDown size={13} class="animate-bounce" />
                <span>Scroll to bottom</span>
              </button>
            </Show>
          </div>
        </Show>
      </section>
    </Show>
  );
};
