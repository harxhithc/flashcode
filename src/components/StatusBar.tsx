import { Component, Show } from "solid-js";
import { Check, Loader2 } from "lucide-solid";
import { BoardInfo } from "../services/tauri";

interface StatusBarProps {
  selectedBoard: BoardInfo | null;
  isCompiling: boolean;
  isUploading: boolean;
  lastElapsedMs: number | null;
  ccacheUsed: boolean;
  ccacheHit?: boolean;
  lastAction?: "compile" | "upload" | null;
}

export const StatusBar: Component<StatusBarProps> = (props) => {
  return (
    <footer class="h-6 bg-[#111113] border-t border-[#27272A] px-3 flex items-center justify-between text-[11px] select-none z-30 font-mono text-[#71717A]">
      {/* Left Status Text */}
      <div class="flex items-center gap-3">
        <Show
          when={props.isCompiling}
          fallback={
            <Show
              when={props.isUploading}
              fallback={
                <Show
                  when={props.lastElapsedMs !== null}
                  fallback={<span class="text-[#52525B]">FlashCode Ready</span>}
                >
                  <span class="flex items-center gap-1.5 text-[#E4E4E7]">
                    <Check size={12} class="text-[#10B981]" />
                    <Show
                      when={props.lastAction === "upload"}
                      fallback={
                        <>
                          <span>Build finished in {props.lastElapsedMs}ms</span>
                          <Show when={props.ccacheUsed}>
                            <span
                              class={`text-[10px] px-1 rounded ${
                                props.ccacheHit
                                  ? "bg-[#10B981]/20 text-[#10B981]"
                                  : "bg-[#00F0FF]/15 text-[#00F0FF]"
                              }`}
                            >
                              {props.ccacheHit ? "ccache hit" : "ccache"}
                            </span>
                          </Show>
                        </>
                      }
                    >
                      <span>Upload completed in {props.lastElapsedMs}ms</span>
                    </Show>
                  </span>
                </Show>
              }
            >
              <span class="flex items-center gap-1.5 text-[#FF6B00]">
                <Loader2 size={11} class="animate-spin" />
                <span>Uploading firmware to board...</span>
              </span>
            </Show>
          }
        >
          <span class="flex items-center gap-1.5 text-[#00F0FF]">
            <Loader2 size={11} class="animate-spin" />
            <span>Compiling sketch (xtensa-esp32-elf)...</span>
          </span>
        </Show>
      </div>

      {/* Right Details */}
      <div class="flex items-center gap-4 text-[#52525B]">
        <span>Target: {props.selectedBoard ? props.selectedBoard.architecture.toUpperCase() : "NONE"}</span>
        <span>UTF-8</span>
        <span>C++</span>
      </div>
    </footer>
  );
};
