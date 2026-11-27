import { Component, createSignal, createEffect, onMount, For, Show } from "solid-js";
import {
  FileCode,
  FilePlus,
  FolderOpen,
  X,
  Clock,
  Trash2,
  Folder,
  Plus,
  RefreshCw,
  FolderGit2,
  ChevronDown,
  ChevronRight,
  FileText,
} from "lucide-solid";
import { OpenFileItem } from "./TopBar";
import {
  SketchbookItem,
  getSketchbook,
  createSketchbookSketch,
} from "../services/tauri";

export interface RecentFileItem {
  name: string;
  path: string;
  lastOpened: number;
}

interface FileExplorerDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  openFiles: OpenFileItem[];
  activeFileId?: string;
  activeFilePath?: string;
  activeFileName: string;
  recentFiles: RecentFileItem[];
  onSelectFile: (file: OpenFileItem) => void;
  onOpenRecentFile: (filePath: string) => void;
  onCloseFile: (file: OpenFileItem) => void;
  onNewFile: () => void;
  onOpenFile: () => void;
  onClearRecents?: () => void;
  onRemoveRecent?: (filePath: string) => void;
  onOpenSketchFromSketchbook?: (sketch: SketchbookItem) => void;
  onAddNewTabToSketch?: (fileName: string) => void;
}

export const FileExplorerDrawer: Component<FileExplorerDrawerProps> = (props) => {
  const [sketchbookList, setSketchbookList] = createSignal<SketchbookItem[]>([]);
  const [sketchbookDir, setSketchbookDir] = createSignal<string>("~/Arduino");
  const [isLoadingSketchbook, setIsLoadingSketchbook] = createSignal<boolean>(false);

  // Inline "New Tab to Sketch" input
  const [isAddingTab, setIsAddingTab] = createSignal<boolean>(false);
  const [newTabName, setNewTabName] = createSignal<string>("");

  // Collapsible section toggles
  const [isSketchbookCollapsed, setIsSketchbookCollapsed] = createSignal<boolean>(false);
  const [isRecentsCollapsed, setIsRecentsCollapsed] = createSignal<boolean>(false);

  const refreshSketchbook = async () => {
    setIsLoadingSketchbook(true);
    try {
      const data = await getSketchbook();
      setSketchbookList(data.sketches || []);
      setSketchbookDir(data.sketchbook_dir || "~/Arduino");
    } catch (e) {
      console.error("Failed to load sketchbook", e);
    } finally {
      setIsLoadingSketchbook(false);
    }
  };

  onMount(() => {
    refreshSketchbook();
  });

  createEffect(() => {
    if (props.isOpen) {
      refreshSketchbook();
    }
  });

  const handleCreateNewSketchInSketchbook = async () => {
    try {
      const res = await createSketchbookSketch();
      if (res.success && res.main_file) {
        await refreshSketchbook();
        const found = sketchbookList().find((s) => s.dir_path === res.dir_path);
        if (found && props.onOpenSketchFromSketchbook) {
          props.onOpenSketchFromSketchbook(found);
        } else {
          props.onOpenRecentFile(res.main_file);
        }
      }
    } catch (e) {
      console.error("Failed to create sketch in sketchbook", e);
    }
  };

  const handleConfirmAddTab = () => {
    const name = newTabName().trim();
    if (!name) return;
    props.onAddNewTabToSketch?.(name);
    setNewTabName("");
    setIsAddingTab(false);
  };

  // Derive current sketch name from active file path
  const currentSketchFolderName = () => {
    const active = props.openFiles.find((f) => f.id === props.activeFileId) || props.openFiles[0];
    if (active && active.path && active.path !== "untitled") {
      const parts = active.path.split("/").filter(Boolean);
      if (parts.length >= 2) {
        return parts[parts.length - 2];
      }
    }
    return "Current Sketch";
  };

  return (
    <Show when={props.isOpen}>
      <aside class="w-68 bg-[#141416] border-r border-[#27272A] flex flex-col font-sans text-xs select-none z-20 shrink-0">
        {/* Header */}
        <div class="h-9 px-3 border-b border-[#27272A] flex items-center justify-between text-[#A1A1AA] bg-[#18181B]">
          <div class="flex items-center gap-1.5 font-semibold text-[#E4E4E7] tracking-wider text-[11px] uppercase">
            <FolderGit2 size={13} class="text-[#00F0FF]" />
            <span>Sketchbook & Files</span>
          </div>

          <div class="flex items-center gap-1">
            <button
              onClick={handleCreateNewSketchInSketchbook}
              class="p-1 rounded hover:text-white hover:bg-[#27272A] transition-colors"
              title="New Sketch in Sketchbook"
            >
              <FilePlus size={13} />
            </button>
            <button
              onClick={props.onOpenFile}
              class="p-1 rounded hover:text-white hover:bg-[#27272A] transition-colors"
              title="Open File / Sketch... (Ctrl+O)"
            >
              <FolderOpen size={13} />
            </button>
            <button
              onClick={refreshSketchbook}
              class="p-1 rounded hover:text-white hover:bg-[#27272A] transition-colors"
              title="Refresh Sketchbook"
            >
              <RefreshCw size={13} class={isLoadingSketchbook() ? "animate-spin" : ""} />
            </button>
            <button
              onClick={props.onClose}
              class="p-1 rounded hover:text-white hover:bg-[#27272A] transition-colors"
              title="Close Panel"
            >
              <X size={13} />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div class="flex-1 overflow-y-auto p-2 space-y-4 bg-[#0F0F11]">
          {/* Section 1: Current Sketch Files / Tabs */}
          <div>
            <div class="px-2 py-1 text-[10px] uppercase tracking-wider text-[#71717A] font-semibold flex items-center justify-between">
              <span class="flex items-center gap-1 text-[#E4E4E7]">
                <Folder size={11} class="text-[#00F0FF]" />
                <span class="truncate max-w-[120px]">{currentSketchFolderName()}</span>
                <span class="text-[#71717A]">({props.openFiles.length})</span>
              </span>
              <button
                onClick={() => setIsAddingTab((prev) => !prev)}
                class="flex items-center gap-0.5 text-[10px] text-[#00F0FF] hover:text-[#38F9D7] transition-colors px-1 py-0.5 rounded hover:bg-[#27272A]"
                title="Add new header (.h) or source (.cpp) tab to sketch"
              >
                <Plus size={11} />
                <span>New Tab</span>
              </button>
            </div>

            {/* Inline Add Tab Input Box */}
            <Show when={isAddingTab()}>
              <div class="p-2 mb-1 rounded bg-[#18181B] border border-[#00F0FF]/40 space-y-1.5 animate-in fade-in duration-100">
                <div class="text-[10px] text-[#A1A1AA]">File name (e.g. config.h, display.cpp):</div>
                <div class="flex items-center gap-1">
                  <input
                    type="text"
                    placeholder="pins.h"
                    value={newTabName()}
                    onInput={(e) => setNewTabName(e.currentTarget.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleConfirmAddTab();
                      if (e.key === "Escape") setIsAddingTab(false);
                    }}
                    autofocus
                    class="flex-1 bg-[#1F1F23] border border-[#27272A] focus:border-[#00F0FF] focus:outline-none rounded px-2 py-1 text-xs font-mono text-white"
                  />
                  <button
                    onClick={handleConfirmAddTab}
                    class="px-2 py-1 rounded bg-[#00F0FF] hover:bg-[#38F9D7] text-[#0F0F11] font-bold text-[11px] transition-colors"
                  >
                    Add
                  </button>
                  <button
                    onClick={() => setIsAddingTab(false)}
                    class="p-1 rounded text-[#71717A] hover:text-white"
                  >
                    <X size={12} />
                  </button>
                </div>
              </div>
            </Show>

            <div class="space-y-0.5 mt-1">
              <Show when={props.openFiles.length === 0}>
                <div class="px-2 py-3 text-center text-[#52525B] text-[11px] font-mono">
                  No sketch files open
                </div>
              </Show>
              <For each={props.openFiles}>
                {(file) => {
                  const isActive = () =>
                    props.activeFileId ? file.id === props.activeFileId : file.name === props.activeFileName;

                  const isHeader = () => file.name.endsWith(".h") || file.name.endsWith(".hpp");
                  const isCpp = () => file.name.endsWith(".cpp") || file.name.endsWith(".c");
                  const isIno = () => file.name.endsWith(".ino");

                  return (
                    <div
                      onClick={() => props.onSelectFile(file)}
                      class={`group flex items-center justify-between px-2.5 py-1.5 rounded cursor-pointer transition-colors ${
                        isActive()
                          ? "bg-[#27272A] text-white shadow-xs"
                          : "text-[#A1A1AA] hover:bg-[#18181B] hover:text-[#E4E4E7]"
                      }`}
                    >
                      <div class="flex items-center gap-2 truncate">
                        <Show when={isIno()}>
                          <FileCode size={13} class={isActive() ? "text-[#00F0FF]" : "text-[#71717A]"} />
                        </Show>
                        <Show when={isHeader()}>
                          <FileText size={13} class={isActive() ? "text-[#A78BFA]" : "text-[#71717A]"} />
                        </Show>
                        <Show when={isCpp()}>
                          <FileCode size={13} class={isActive() ? "text-[#34D399]" : "text-[#71717A]"} />
                        </Show>
                        <span class="truncate font-mono text-[11px]">{file.name}</span>
                        <Show when={file.isDirty}>
                          <span
                            class="w-1.5 h-1.5 rounded-full bg-[#00F0FF] flex-shrink-0"
                            title="Unsaved changes"
                          />
                        </Show>
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          props.onCloseFile(file);
                        }}
                        class="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-[#3F3F46] text-[#71717A] hover:text-[#EF4444] transition-opacity"
                        title="Close File (Ctrl+W)"
                      >
                        <X size={11} />
                      </button>
                    </div>
                  );
                }}
              </For>
            </div>
          </div>

          {/* Section 2: Sketchbook (~/Arduino) */}
          <div class="pt-2 border-t border-[#1F1F23]">
            <div
              onClick={() => setIsSketchbookCollapsed((prev) => !prev)}
              class="px-2 py-1 text-[10px] uppercase tracking-wider text-[#71717A] font-semibold flex items-center justify-between cursor-pointer hover:text-[#E4E4E7]"
            >
              <span class="flex items-center gap-1">
                <Show when={isSketchbookCollapsed()} fallback={<ChevronDown size={11} />}>
                  <ChevronRight size={11} />
                </Show>
                <span>Sketchbook ({sketchbookList().length})</span>
              </span>
              <span class="text-[9px] text-[#52525B] font-mono lowercase truncate max-w-[90px]">
                {sketchbookDir()}
              </span>
            </div>

            <Show when={!isSketchbookCollapsed()}>
              <div class="space-y-0.5 mt-1">
                <Show
                  when={sketchbookList().length > 0}
                  fallback={
                    <div class="px-2.5 py-2 text-[#52525B] text-[11px] text-center">
                      No sketches found in ~/Arduino.
                    </div>
                  }
                >
                  <For each={sketchbookList()}>
                    {(sketch) => {
                      const fileCount = () => sketch.files?.length || 1;
                      return (
                        <div
                          onClick={() => {
                            if (props.onOpenSketchFromSketchbook) {
                              props.onOpenSketchFromSketchbook(sketch);
                            } else {
                              props.onOpenRecentFile(sketch.main_file);
                            }
                          }}
                          class="group flex items-center justify-between px-2.5 py-1.5 rounded cursor-pointer text-[#A1A1AA] hover:bg-[#18181B] hover:text-[#E4E4E7] transition-colors"
                          title={sketch.main_file}
                        >
                          <div class="flex items-center gap-2 truncate min-w-0">
                            <Folder size={13} class="text-[#00F0FF] flex-shrink-0" />
                            <div class="truncate">
                              <div class="truncate font-medium text-[11px] text-[#E4E4E7]">
                                {sketch.name}
                              </div>
                            </div>
                          </div>

                          <span class="text-[10px] font-mono text-[#52525B] flex-shrink-0">
                            {fileCount()} {fileCount() === 1 ? "file" : "files"}
                          </span>
                        </div>
                      );
                    }}
                  </For>
                </Show>
              </div>
            </Show>
          </div>

          {/* Section 3: Recent Sketches */}
          <div class="pt-2 border-t border-[#1F1F23]">
            <div
              onClick={() => setIsRecentsCollapsed((prev) => !prev)}
              class="px-2 py-1 text-[10px] uppercase tracking-wider text-[#71717A] font-semibold flex items-center justify-between cursor-pointer hover:text-[#E4E4E7]"
            >
              <span class="flex items-center gap-1">
                <Show when={isRecentsCollapsed()} fallback={<ChevronDown size={11} />}>
                  <ChevronRight size={11} />
                </Show>
                <Clock size={10} />
                <span>Recent Sketches</span>
              </span>
              <Show when={props.recentFiles.length > 0 && props.onClearRecents}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    props.onClearRecents?.();
                  }}
                  class="text-[9px] text-[#71717A] hover:text-[#EF4444] transition-colors"
                  title="Clear Recent List"
                >
                  Clear
                </button>
              </Show>
            </div>

            <Show when={!isRecentsCollapsed()}>
              <Show
                when={props.recentFiles.length > 0}
                fallback={
                  <div class="px-2.5 py-2 text-[#52525B] text-[11px] text-center">
                    No recent sketches yet.
                  </div>
                }
              >
                <div class="space-y-0.5 mt-1">
                  <For each={props.recentFiles}>
                    {(recent) => (
                      <div
                        onClick={() => props.onOpenRecentFile(recent.path)}
                        class="group flex items-center justify-between px-2.5 py-1.5 rounded cursor-pointer text-[#A1A1AA] hover:bg-[#18181B] hover:text-[#E4E4E7] transition-colors"
                        title={recent.path}
                      >
                        <div class="flex flex-col truncate min-w-0 pr-1">
                          <div class="flex items-center gap-1.5">
                            <FileCode size={12} class="text-[#60A5FA] flex-shrink-0" />
                            <span class="truncate font-medium text-[11px]">{recent.name}</span>
                          </div>
                          <span class="text-[9px] text-[#52525B] truncate mt-0.5 font-mono">
                            {recent.path}
                          </span>
                        </div>

                        <Show when={props.onRemoveRecent}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              props.onRemoveRecent!(recent.path);
                            }}
                            class="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-[#27272A] text-[#71717A] hover:text-[#EF4444] transition-opacity flex-shrink-0"
                            title="Remove from recents"
                          >
                            <Trash2 size={11} />
                          </button>
                        </Show>
                      </div>
                    )}
                  </For>
                </div>
              </Show>
            </Show>
          </div>
        </div>
      </aside>
    </Show>
  );
};
