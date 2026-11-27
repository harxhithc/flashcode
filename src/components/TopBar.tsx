import { Component, Show, createSignal } from "solid-js";
import {
  Play,
  Bot,
  Cpu,
  Usb,
  Lock,
  Loader2,
  Terminal,
  ChevronDown,
  Upload,
  Maximize,
  Minimize2,
  FolderGit2,
  X,
  Sparkles,
} from "lucide-solid";
import { BoardInfo, SerialPortInfo, BoardConfigOption } from "../services/tauri";
import type { UpdatePhase } from "../services/updateService";
import { FileMenu } from "./FileMenu";
import { BoardOptionsPopover } from "./BoardOptionsPopover";

export interface OpenFileItem {
  id: string;
  name: string;
  path: string;
  content: string;
  isDirty: boolean;
}

interface TopBarProps {
  selectedBoard: BoardInfo | null;
  selectedPort: SerialPortInfo | null;
  isPortTakenOver?: boolean;
  activeFileId?: string;
  activeFileName: string;
  activeFilePath?: string;
  isDirty: boolean;
  openFiles?: OpenFileItem[];
  isCompiling: boolean;
  isUploading: boolean;
  isConsoleOpen: boolean;
  isAiOpen: boolean;
  isFullscreen?: boolean;
  onSelectBoardClick: () => void;
  onSelectPortClick: () => void;
  onCompile: () => void;
  onUpload: () => void;
  onToggleConsole: () => void;
  onToggleAi: () => void;
  onToggleFullscreen?: () => void;
  // Board Options Configuration
  boardOptions?: BoardConfigOption[];
  selectedBoardOptions?: Record<string, string>;
  onBoardOptionsChange?: (options: Record<string, string>) => void;
  onResetBoardOptionsDefaults?: () => void;
  isLoadingBoardOptions?: boolean;
  // Auto-Updater Notification Pill
  updatePhase?: UpdatePhase;
  updateVersion?: string;
  onOpenUpdateModal?: () => void;
  // File operations (Menu)
  onNewFile: () => void;
  onNewWindow?: () => void;
  onOpenFile: () => void;
  onOpenExamples?: () => void;
  onCloseFile: () => void;
  onCloseSketch?: () => void;
  onCloseAll?: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onSelectTab?: (file: OpenFileItem) => void;
  onCloseTab?: (file: OpenFileItem) => void;
}

export const TopBar: Component<TopBarProps> = (props) => {
  const [isFileMenuOpen, setIsFileMenuOpen] = createSignal(false);

  // Derive sketch / project name from active file or first file
  const projectName = () => {
    if (!props.openFiles || props.openFiles.length === 0) return null;
    const mainFile = props.openFiles.find((f) => f.name.endsWith(".ino")) || props.openFiles[0];
    if (mainFile.path) {
      const parts = mainFile.path.split("/");
      // If inside sketch folder /path/to/MySketch/MySketch.ino, use folder name
      if (parts.length >= 2) {
        const folderName = parts[parts.length - 2];
        const fileName = parts[parts.length - 1].replace(/\.ino$/, "");
        if (folderName === fileName) return folderName;
      }
    }
    return mainFile.name.replace(/\.ino$/, "");
  };

  const hasUnsavedFiles = () => {
    return props.openFiles?.some((f) => f.isDirty) ?? props.isDirty;
  };

  return (
    <header class="h-10 bg-[#141416] border-b border-[#27272A] px-3 flex items-center justify-between select-none z-30 font-sans text-xs">
      {/* 1. Left Group: File Menu, Build & Flash Actions, Hardware Selectors */}
      <div class="flex items-center gap-1.5 shrink-0 flex-none">
        {/* File Menu (New, Open, Examples, Save, Save As, Close) */}
        <FileMenu
          isOpen={isFileMenuOpen()}
          onToggle={() => setIsFileMenuOpen(!isFileMenuOpen())}
          onClose={() => setIsFileMenuOpen(false)}
          onNewFile={props.onNewFile}
          onNewWindow={props.onNewWindow}
          onOpenFile={props.onOpenFile}
          onOpenExamples={props.onOpenExamples}
          onCloseFile={props.onCloseFile}
          onCloseSketch={props.onCloseSketch}
          onCloseAll={props.onCloseAll}
          onSave={props.onSave}
          onSaveAs={props.onSaveAs}
        />

        {/* Separator */}
        <div class="h-4 w-px bg-[#27272A] mx-0.5" />

        {/* Verify / Compile Button */}
        <button
          onClick={() => props.onCompile()}
          disabled={props.isCompiling || props.isUploading || !props.openFiles || props.openFiles.length === 0}
          class={`h-7 flex items-center gap-1.5 px-2.5 rounded text-xs transition-colors border font-medium ${
            props.isCompiling
              ? "bg-[#27272A] text-[#71717A] border-[#3F3F46] cursor-wait"
              : !props.openFiles || props.openFiles.length === 0
              ? "bg-[#18181B]/40 text-[#52525B] border-[#27272A] cursor-not-allowed opacity-60"
              : "bg-[#18181B] hover:bg-[#222226] text-[#E4E4E7] border-[#27272A] hover:border-[#3F3F46]"
          }`}
          title={!props.openFiles || props.openFiles.length === 0 ? "Open or create a sketch to verify" : "Verify Code (Ctrl+B / Ctrl+R)"}
        >
          <Show
            when={props.isCompiling}
            fallback={<Play size={13} class={!props.openFiles || props.openFiles.length === 0 ? "text-[#52525B]" : "text-[#00F0FF] fill-current"} />}
          >
            <Loader2 size={13} class="animate-spin text-[#00F0FF]" />
          </Show>
          <span>Verify</span>
        </button>

        {/* Upload Button (Refined Emerald Green Accent) */}
        <button
          onClick={() => props.onUpload()}
          disabled={props.isCompiling || props.isUploading || !props.openFiles || props.openFiles.length === 0}
          class={`h-7 flex items-center gap-1.5 px-2.5 rounded text-xs transition-colors border font-medium ${
            props.isUploading
              ? "bg-[#10B981]/15 text-[#10B981] border-[#10B981]/40 cursor-wait"
              : !props.openFiles || props.openFiles.length === 0
              ? "bg-[#18181B]/40 text-[#52525B] border-[#27272A] cursor-not-allowed opacity-60"
              : "bg-[#10B981]/10 hover:bg-[#10B981]/20 text-[#34D399] hover:text-[#10B981] border-[#10B981]/25 hover:border-[#10B981]/45"
          }`}
          title={!props.openFiles || props.openFiles.length === 0 ? "Open or create a sketch to upload" : "Upload to Board (Ctrl+U)"}
        >
          <Show
            when={props.isUploading}
            fallback={<Upload size={13} class={!props.openFiles || props.openFiles.length === 0 ? "text-[#52525B]" : "text-[#10B981]"} />}
          >
            <Loader2 size={13} class="animate-spin text-[#10B981]" />
          </Show>
          <span>Upload</span>
        </button>

        {/* Separator */}
        <div class="h-4 w-px bg-[#27272A] mx-0.5" />

        {/* Board Selector Dropdown Button */}
        <button
          onClick={props.onSelectBoardClick}
          class="h-7 flex items-center gap-1.5 px-2.5 rounded bg-[#18181B] hover:bg-[#222226] text-xs text-[#D4D4D8] border border-[#27272A] hover:border-[#3F3F46] transition-colors font-medium"
          title="Select Target Board (Boards Manager)"
        >
          <Cpu size={13} class="text-[#00F0FF] shrink-0" />
          <span class="max-w-[130px] truncate">
            {props.selectedBoard ? props.selectedBoard.name : "Select Board"}
          </span>
          <ChevronDown size={12} class="text-[#71717A] shrink-0" />
        </button>

        {/* Board Options Config Popover (Upload Speed, CPU Freq, Flash Freq, Partition Scheme, etc.) */}
        <Show when={props.selectedBoard && props.boardOptions && props.boardOptions.length > 0}>
          <BoardOptionsPopover
            baseFqbn={props.selectedBoard!.fqbn}
            boardName={props.selectedBoard!.name}
            options={props.boardOptions!}
            selectedOptions={props.selectedBoardOptions || {}}
            onOptionsChange={props.onBoardOptionsChange || (() => {})}
            onResetDefaults={props.onResetBoardOptionsDefaults}
            isLoading={props.isLoadingBoardOptions}
          />
        </Show>

        {/* Serial Port Dropdown Button (Standardized Padding, Icon, & Balanced Width) */}
        <button
          onClick={props.onSelectPortClick}
          class={`h-7 min-w-[115px] flex items-center gap-1.5 px-2.5 rounded text-xs border transition-colors font-medium ${
            props.isPortTakenOver
              ? "bg-[#F59E0B]/10 hover:bg-[#F59E0B]/20 text-[#F59E0B] border-[#F59E0B]/40 hover:border-[#F59E0B]"
              : "bg-[#18181B] hover:bg-[#222226] text-[#D4D4D8] border-[#27272A] hover:border-[#3F3F46]"
          }`}
          title={
            props.isPortTakenOver
              ? `Port ${props.selectedPort ? props.selectedPort.port_name : ""} was taken over by another window/process. Click to reassign or take over.`
              : "Select USB Serial Port"
          }
        >
          <span
            class={`w-2 h-2 rounded-full shrink-0 ${
              props.isPortTakenOver
                ? "bg-[#F59E0B] animate-pulse shadow-[0_0_8px_#F59E0B]"
                : props.selectedPort
                ? "bg-[#10B981]"
                : "bg-[#52525B]"
            }`}
          />
          <Show
            when={props.isPortTakenOver}
            fallback={<Usb size={13} class="text-[#71717A] shrink-0" />}
          >
            <Lock size={12} class="text-[#F59E0B] shrink-0" />
          </Show>
          <span class="max-w-[110px] truncate font-mono text-xs">
            {props.isPortTakenOver
              ? `${props.selectedPort ? props.selectedPort.port_name : "Port"} (Locked)`
              : props.selectedPort
              ? props.selectedPort.port_name
              : "No Port"}
          </span>
          <ChevronDown size={12} class="text-[#71717A] shrink-0 ml-auto" />
        </button>

        {/* Project / Sketch Folder Button (Unified with Left Toolbar) */}
        <Show when={projectName()}>
          <div class="h-4 w-px bg-[#27272A] mx-0.5" />
          <div
            class="h-7 flex items-center gap-1.5 px-2.5 rounded bg-[#18181B] hover:bg-[#222226] text-xs text-[#D4D4D8] border border-[#27272A] hover:border-[#3F3F46] transition-colors font-medium group"
            title={`Active Sketch: ${projectName()}`}
          >
            <FolderGit2 size={13} class="text-[#00F0FF] shrink-0" />
            <span class="max-w-[130px] truncate font-mono text-xs font-medium text-[#E4E4E7]">
              {projectName()}
            </span>
            <Show when={props.openFiles && props.openFiles.length > 1}>
              <span class="text-[11px] text-[#71717A] font-mono shrink-0">
                ({props.openFiles!.length})
              </span>
            </Show>
            <Show when={hasUnsavedFiles()}>
              <span
                class="w-2 h-2 rounded-full bg-[#00F0FF] shrink-0 animate-pulse"
                title="Unsaved changes in sketch"
              />
            </Show>
            <Show when={props.onCloseSketch}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  props.onCloseSketch?.();
                }}
                class="p-0.5 rounded hover:bg-[#27272A] text-[#71717A] hover:text-[#EF4444] transition-colors ml-0.5 shrink-0"
                title="Close Sketch / Folder (Ctrl+Shift+W)"
              >
                <X size={12} />
              </button>
            </Show>
          </div>
        </Show>
      </div>

      {/* 2. Center: Clean Spacer */}
      <div class="flex-1 min-w-0" />

      {/* 3. Right Group: Update Badge, Flash Agent, Serial Monitor & Fullscreen (PERMANENTLY ANCHORED) */}
      <div class="flex items-center gap-1.5 shrink-0 flex-none">
        {/* Background Auto-Update Pill (only shown when update is available, downloading, or ready) */}
        <Show when={props.updatePhase === "available" || props.updatePhase === "downloading" || props.updatePhase === "ready"}>
          <button
            type="button"
            onClick={() => props.onOpenUpdateModal?.()}
            class={`h-7 flex items-center gap-1.5 px-2.5 rounded text-xs transition-colors border cursor-pointer font-medium ${
              props.updatePhase === "ready"
                ? "bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border-emerald-500/40"
                : "bg-[#00F0FF]/12 hover:bg-[#00F0FF]/20 text-[#00F0FF] border-[#00F0FF]/35"
            }`}
            title={
              props.updatePhase === "ready"
                ? `FlashCode v${props.updateVersion || ""} is ready — click to restart & apply`
                : `FlashCode v${props.updateVersion || ""} update available`
            }
          >
            <Sparkles size={12} class={props.updatePhase === "ready" ? "text-emerald-400" : "text-[#00F0FF] animate-pulse"} />
            <span>
              {props.updatePhase === "ready"
                ? `Restart v${props.updateVersion || ""}`
                : props.updatePhase === "downloading"
                ? "Updating..."
                : `Update v${props.updateVersion || ""}`}
            </span>
          </button>
        </Show>

        {/* Flash Agent Toggle Button */}
        <button
          onClick={props.onToggleAi}
          class={`h-7 flex items-center gap-1.5 px-2.5 rounded text-xs transition-colors border cursor-pointer font-medium ${
            props.isAiOpen
              ? "bg-[#00F0FF]/15 text-[#00F0FF] border-[#00F0FF]/40 shadow-sm"
              : "bg-[#18181B] hover:bg-[#222226] text-[#A1A1AA] hover:text-white border-[#27272A] hover:border-[#3F3F46]"
          }`}
          title="Toggle Flash AI Agent"
        >
          <Bot size={13} class={props.isAiOpen ? "text-[#00F0FF]" : "text-[#71717A]"} />
          <span>Flash Agent</span>
        </button>

        {/* Serial Monitor Toggle Button */}
        <button
          onClick={props.onToggleConsole}
          class={`h-7 flex items-center gap-1.5 px-2.5 rounded text-xs transition-colors border cursor-pointer font-medium ${
            props.isConsoleOpen
              ? "bg-[#27272A] text-white border-[#3F3F46]"
              : "bg-[#18181B] hover:bg-[#222226] text-[#A1A1AA] hover:text-white border-[#27272A] hover:border-[#3F3F46]"
          }`}
          title="Toggle Serial Monitor"
        >
          <Terminal size={13} class={props.isConsoleOpen ? "text-[#10B981]" : "text-[#71717A]"} />
          <span>Serial Monitor</span>
        </button>

        {/* Fullscreen Toggle */}
        <button
          onClick={props.onToggleFullscreen}
          class={`h-7 w-7 flex items-center justify-center rounded text-xs transition-colors border ${
            props.isFullscreen
              ? "bg-[#00F0FF]/15 text-[#00F0FF] border-[#00F0FF]/40"
              : "bg-[#18181B] hover:bg-[#222226] text-[#A1A1AA] hover:text-white border-[#27272A] hover:border-[#3F3F46]"
          }`}
          title={props.isFullscreen ? "Exit Fullscreen (F11)" : "Enter Fullscreen (F11)"}
        >
          <Show when={props.isFullscreen} fallback={<Maximize size={13} class="text-[#71717A]" />}>
            <Minimize2 size={13} class="text-[#00F0FF]" />
          </Show>
        </button>
      </div>
    </header>
  );
};
