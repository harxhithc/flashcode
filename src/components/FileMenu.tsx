import { Component, Show } from "solid-js";
import {
  FilePlus,
  FolderOpen,
  Save,
  FileCode,
  BookOpen,
  X,
  FolderX,
  ChevronDown,
  AppWindow,
} from "lucide-solid";

interface FileMenuProps {
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  onNewFile: () => void;
  onNewWindow?: () => void;
  onOpenFile: () => void;
  onOpenExamples?: () => void;
  onCloseFile: () => void;
  onCloseSketch?: () => void;
  onCloseAll?: () => void;
  onSave: () => void;
  onSaveAs: () => void;
}

export const FileMenu: Component<FileMenuProps> = (props) => {
  return (
    <div class="relative">
      {/* File Menu Trigger Button */}
      <button
        onClick={props.onToggle}
        class={`h-7 flex items-center gap-1.5 px-2.5 rounded text-xs font-sans transition-colors ${
          props.isOpen
            ? "bg-[#27272A] text-white"
            : "text-[#A1A1AA] hover:text-white hover:bg-[#1E1E22]"
        }`}
      >
        <span>File</span>
        <ChevronDown size={12} class="text-[#71717A]" />
      </button>

      {/* Dropdown Menu (Arduino IDE style: New, Open, Close, Save, Save As) */}
      <Show when={props.isOpen}>
        {/* Backdrop for closing */}
        <div class="fixed inset-0 z-40" onClick={props.onClose} />

        <div class="absolute left-0 top-full mt-1 w-52 bg-[#18181B] border border-[#27272A] rounded-lg shadow-2xl py-1.5 z-50 font-sans text-xs">
          {/* New Sketch */}
          <button
            onClick={() => {
              props.onNewFile();
              props.onClose();
            }}
            class="w-full px-3 py-1.5 flex items-center justify-between text-[#E4E4E7] hover:bg-[#27272A] transition-colors"
          >
            <div class="flex items-center gap-2">
              <FilePlus size={14} class="text-[#00F0FF]" />
              <span>New Sketch</span>
            </div>
            <span class="text-[10px] text-[#71717A] font-mono">Ctrl+N</span>
          </button>

          {/* New Window */}
          <button
            onClick={() => {
              props.onNewWindow?.();
              props.onClose();
            }}
            class="w-full px-3 py-1.5 flex items-center justify-between text-[#E4E4E7] hover:bg-[#27272A] transition-colors"
          >
            <div class="flex items-center gap-2">
              <AppWindow size={14} class="text-[#A78BFA]" />
              <span>New Window</span>
            </div>
            <span class="text-[10px] text-[#71717A] font-mono">Ctrl+Shift+N</span>
          </button>

          {/* Open File... */}
          <button
            onClick={() => {
              props.onOpenFile();
              props.onClose();
            }}
            class="w-full px-3 py-1.5 flex items-center justify-between text-[#E4E4E7] hover:bg-[#27272A] transition-colors"
          >
            <div class="flex items-center gap-2">
              <FileCode size={14} class="text-[#60A5FA]" />
              <span>Open File...</span>
            </div>
            <span class="text-[10px] text-[#71717A] font-mono">Ctrl+O</span>
          </button>

          {/* Examples */}
          <Show when={props.onOpenExamples}>
            <button
              onClick={() => {
                props.onOpenExamples?.();
                props.onClose();
              }}
              class="w-full px-3 py-1.5 flex items-center justify-between text-[#E4E4E7] hover:bg-[#27272A] transition-colors"
            >
              <div class="flex items-center gap-2">
                <BookOpen size={14} class="text-[#38BDF8]" />
                <span>Examples</span>
              </div>
            </button>
          </Show>

          {/* Close File */}
          <button
            onClick={() => {
              props.onCloseFile();
              props.onClose();
            }}
            class="w-full px-3 py-1.5 flex items-center justify-between text-[#E4E4E7] hover:bg-[#27272A] hover:text-[#EF4444] transition-colors"
            title="Close active file"
          >
            <div class="flex items-center gap-2">
              <X size={14} class="text-[#EF4444]" />
              <span>Close Tab</span>
            </div>
            <span class="text-[10px] text-[#71717A] font-mono">Ctrl+W</span>
          </button>

          {/* Close Sketch / Folder */}
          <Show when={props.onCloseSketch}>
            <button
              onClick={() => {
                props.onCloseSketch?.();
                props.onClose();
              }}
              class="w-full px-3 py-1.5 flex items-center justify-between text-[#E4E4E7] hover:bg-[#27272A] hover:text-[#EF4444] transition-colors"
              title="Close the entire sketch folder"
            >
              <div class="flex items-center gap-2">
                <FolderX size={14} class="text-[#EF4444]" />
                <span>Close Sketch</span>
              </div>
              <span class="text-[10px] text-[#71717A] font-mono">Ctrl+Shift+W</span>
            </button>
          </Show>

          {/* Close All Tabs */}
          <Show when={props.onCloseAll}>
            <button
              onClick={() => {
                props.onCloseAll?.();
                props.onClose();
              }}
              class="w-full px-3 py-1.5 flex items-center justify-between text-[#E4E4E7] hover:bg-[#27272A] hover:text-[#EF4444] transition-colors"
              title="Close all open tabs and return to homepage"
            >
              <div class="flex items-center gap-2">
                <X size={14} class="text-[#71717A]" />
                <span>Close All Tabs</span>
              </div>
            </button>
          </Show>

          <div class="my-1 border-t border-[#27272A]" />

          {/* Save */}
          <button
            onClick={() => {
              props.onSave();
              props.onClose();
            }}
            class="w-full px-3 py-1.5 flex items-center justify-between text-[#E4E4E7] hover:bg-[#27272A] transition-colors"
          >
            <div class="flex items-center gap-2">
              <Save size={14} class="text-[#10B981]" />
              <span>Save</span>
            </div>
            <span class="text-[10px] text-[#71717A] font-mono">Ctrl+S</span>
          </button>

          {/* Save As */}
          <button
            onClick={() => {
              props.onSaveAs();
              props.onClose();
            }}
            class="w-full px-3 py-1.5 flex items-center justify-between text-[#E4E4E7] hover:bg-[#27272A] transition-colors"
          >
            <div class="flex items-center gap-2">
              <FolderOpen size={14} class="text-[#A78BFA]" />
              <span>Save As...</span>
            </div>
            <span class="text-[10px] text-[#71717A] font-mono">Ctrl+Shift+S</span>
          </button>
        </div>
      </Show>
    </div>
  );
};
