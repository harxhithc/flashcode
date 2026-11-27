import { Component, For, Show } from "solid-js";
import { RecentFileItem } from "./FileExplorerDrawer";

interface EmptyStateProps {
  onNewFile: () => void;
  onOpenFile: () => void;
  onOpenSketchbook?: () => void;
  onOpenExamples?: () => void;
  recentFiles?: RecentFileItem[];
  onOpenRecent?: (path: string) => void;
  onOpenAI?: () => void;
}

export const EmptyState: Component<EmptyStateProps> = (props) => {
  const recentList = () => (props.recentFiles || []).slice(0, 6);

  return (
    <div class="h-full w-full bg-[#0F0F11] flex flex-col items-center justify-center p-6 select-none overflow-y-auto font-sans">
      <div class="max-w-md w-full flex flex-col items-center gap-6 py-4">
        {/* Minimal Header */}
        <div class="flex flex-col items-center text-center gap-2">
          <img
            src="/logo.png"
            alt="FlashCode"
            class="w-10 h-10 object-contain opacity-90"
          />
          <h1 class="text-lg font-semibold tracking-tight text-white">
            FlashCode
          </h1>
        </div>

        {/* Minimal Actions */}
        <div class="w-full flex flex-col gap-1.5">
          <button
            onClick={props.onNewFile}
            class="w-full flex items-center justify-between px-3.5 py-2 rounded-md bg-[#141416] hover:bg-[#1C1C20] border border-[#27272A] hover:border-[#3F3F46] text-xs font-medium text-[#E4E4E7] hover:text-white transition-colors text-left cursor-pointer"
          >
            <span>New Sketch</span>
            <span class="text-[10px] font-mono text-[#71717A]">Ctrl+N</span>
          </button>

          <button
            onClick={props.onOpenFile}
            class="w-full flex items-center justify-between px-3.5 py-2 rounded-md bg-[#141416] hover:bg-[#1C1C20] border border-[#27272A] hover:border-[#3F3F46] text-xs font-medium text-[#E4E4E7] hover:text-white transition-colors text-left cursor-pointer"
          >
            <span>Open File</span>
            <span class="text-[10px] font-mono text-[#71717A]">Ctrl+O</span>
          </button>

          <Show when={props.onOpenExamples}>
            <button
              onClick={props.onOpenExamples}
              class="w-full flex items-center justify-between px-3.5 py-2 rounded-md bg-[#141416] hover:bg-[#1C1C20] border border-[#27272A] hover:border-[#3F3F46] text-xs font-medium text-[#E4E4E7] hover:text-white transition-colors text-left cursor-pointer"
            >
              <span>Example Sketches</span>
            </button>
          </Show>

          <Show when={props.onOpenSketchbook}>
            <button
              onClick={props.onOpenSketchbook}
              class="w-full flex items-center justify-between px-3.5 py-2 rounded-md bg-[#141416] hover:bg-[#1C1C20] border border-[#27272A] hover:border-[#3F3F46] text-xs font-medium text-[#E4E4E7] hover:text-white transition-colors text-left cursor-pointer"
            >
              <span>Sketchbook</span>
            </button>
          </Show>
        </div>

        {/* Recent Sketches */}
        <Show when={recentList().length > 0}>
          <div class="w-full border-t border-[#1F1F24] pt-4 flex flex-col gap-1.5">
            <div class="text-[11px] font-medium text-[#71717A] px-1 uppercase tracking-wider">
              Recent
            </div>
            <div class="flex flex-col gap-0.5">
              <For each={recentList()}>
                {(recent) => {
                  const folderHint = recent.path.split("/").slice(-2, -1)[0] || "";
                  return (
                    <button
                      onClick={() => props.onOpenRecent?.(recent.path)}
                      class="flex items-center justify-between py-1.5 px-2.5 hover:bg-[#18181B] rounded-md transition-colors text-left group cursor-pointer"
                    >
                      <span class="text-xs font-mono text-[#D4D4D8] group-hover:text-[#00F0FF] transition-colors truncate">
                        {recent.name}
                      </span>
                      <Show when={folderHint}>
                        <span
                          class="text-[10px] text-[#52525B] truncate max-w-[180px] ml-2"
                          title={recent.path}
                        >
                          {folderHint}
                        </span>
                      </Show>
                    </button>
                  );
                }}
              </For>
            </div>
          </div>
        </Show>
      </div>
    </div>
  );
};
