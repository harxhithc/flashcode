import { Component, For, Show } from "solid-js";
import { Search, X } from "lucide-solid";
import { BoardInfo } from "../../../services/tauri";

export interface BoardsTabProps {
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  selectedFamily: string;
  onFamilyChange: (family: string) => void;
  families: string[];
  isLoadingBoards: boolean;
  onRefreshBoards: (force?: boolean) => void;
  filteredBoards: BoardInfo[];
  selectedBoard: BoardInfo | null;
  onSelectBoard: (board: BoardInfo) => void;
}

export const BoardsTab: Component<BoardsTabProps> = (props) => {
  return (
    <>
      {/* Search & Family Filter Bar */}
      <div class="p-3 border-b border-[#27272A] bg-[#161619] flex items-center gap-2.5 shrink-0">
        {/* Search Box */}
        <div class="flex-1 relative">
          <Search
            size={14}
            class="absolute left-3 top-1/2 -translate-y-1/2 text-[#71717A] pointer-events-none"
          />
          <input
            type="text"
            value={props.searchQuery}
            onInput={(e) => props.onSearchQueryChange(e.currentTarget.value)}
            placeholder="Search boards..."
            class="w-full bg-[#0F0F11] border border-[#27272A] focus:border-[#00F0FF] rounded-lg pl-8 pr-7 py-1.5 text-xs text-white placeholder-[#52525B] outline-none font-sans"
          />
          <Show when={props.searchQuery}>
            <button
              type="button"
              onClick={() => props.onSearchQueryChange("")}
              class="absolute right-2 top-1/2 -translate-y-1/2 text-[#71717A] hover:text-white cursor-pointer"
            >
              <X size={13} />
            </button>
          </Show>
        </div>

        {/* Family Filter Pills */}
        <div class="flex items-center gap-1 bg-[#0F0F11] border border-[#27272A] rounded-lg p-0.5 text-xs">
          <For each={props.families}>
            {(fam) => {
              const isSelected = () => props.selectedFamily === fam;
              return (
                <button
                  type="button"
                  onClick={() => props.onFamilyChange(fam)}
                  class={`px-2 py-1 rounded text-[11px] transition-colors cursor-pointer ${
                    isSelected()
                      ? "bg-[#27272A] text-[#00F0FF] font-medium"
                      : "text-[#A1A1AA] hover:text-white"
                  }`}
                >
                  {fam}
                </button>
              );
            }}
          </For>
        </div>

        {/* Refresh Boards */}
        <button
          type="button"
          onClick={() => props.onRefreshBoards(true)}
          disabled={props.isLoadingBoards}
          title="Refresh boards"
          class="h-7 px-2.5 rounded-lg bg-[#27272A] hover:bg-[#323238] text-[#A1A1AA] hover:text-white text-xs transition-colors disabled:opacity-50 cursor-pointer"
        >
          {props.isLoadingBoards ? "..." : "Refresh"}
        </button>
      </div>

      {/* Scrollable Boards Grid */}
      <div class="flex-1 p-3 overflow-y-auto space-y-1.5">
        <Show
          when={props.filteredBoards.length > 0}
          fallback={
            <div class="h-64 flex flex-col items-center justify-center text-center p-6 text-[#71717A]">
              <p class="text-sm font-medium text-white mb-1">No matching boards found</p>
              <button
                type="button"
                onClick={() => {
                  props.onSearchQueryChange("");
                  props.onFamilyChange("All");
                }}
                class="mt-2 text-xs text-[#00F0FF] hover:underline cursor-pointer"
              >
                Reset filters
              </button>
            </div>
          }
        >
          <div class="grid grid-cols-1 md:grid-cols-2 gap-1.5">
            <For each={props.filteredBoards}>
              {(board) => {
                const isSelected = () => props.selectedBoard?.fqbn === board.fqbn;
                const family = () => board.family || (board.fqbn.startsWith("esp32:") ? "ESP32" : board.fqbn.startsWith("arduino:") ? "Arduino" : "ESP8266");

                return (
                  <button
                    type="button"
                    onClick={() => props.onSelectBoard(board)}
                    class={`px-3 py-2 rounded-lg border text-left transition-colors cursor-pointer flex items-center justify-between ${
                      isSelected()
                        ? "bg-[#00F0FF]/15 border-[#00F0FF] text-white"
                        : "bg-[#18181B] border-[#27272A] text-[#D4D4D8] hover:border-[#3F3F46] hover:bg-[#1F1F23] hover:text-white"
                    }`}
                  >
                    <span class="font-medium text-xs truncate pr-2">
                      {board.name}
                    </span>

                    <div class="shrink-0">
                      <Show
                        when={isSelected()}
                        fallback={
                          <span class="text-[9.5px] px-1.5 py-0.5 rounded bg-[#27272A] text-[#71717A] font-sans">
                            {family()}
                          </span>
                        }
                      >
                        <span class="text-[9.5px] px-1.5 py-0.5 rounded bg-[#10B981]/20 text-[#34D399] font-medium font-sans">
                          Active
                        </span>
                      </Show>
                    </div>
                  </button>
                );
              }}
            </For>
          </div>
        </Show>
      </div>
    </>
  );
};
