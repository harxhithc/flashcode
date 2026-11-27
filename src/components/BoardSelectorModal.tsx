import { Component, createSignal, createEffect, Show } from "solid-js";
import { X, Cpu } from "lucide-solid";
import { BoardInfo, getDefaultBoards } from "../services/tauri";
import { BoardsTab } from "./modals/boards/BoardsTab";

export interface BoardSelectorModalProps {
  isOpen: boolean;
  boards: BoardInfo[];
  selectedBoard: BoardInfo | null;
  onSelect: (board: BoardInfo) => void;
  onClose: () => void;
  onLog?: (message: string) => void;
  onBoardsUpdated?: (boards: BoardInfo[]) => void;
}

export const BoardSelectorModal: Component<BoardSelectorModalProps> = (props) => {
  // Search & Filter state
  const [searchQuery, setSearchQuery] = createSignal<string>("");
  const [selectedFamily, setSelectedFamily] = createSignal<string>("All");

  // Boards data state
  const [allBoards, setAllBoards] = createSignal<BoardInfo[]>(props.boards || []);
  const [isLoadingBoards, setIsLoadingBoards] = createSignal<boolean>(false);

  // Available board families for filtering
  const families = ["All", "ESP32", "Arduino", "ESP8266", "RP2040", "STM32", "Other"];

  // Fetch all boards from the engine
  const refreshBoards = async (force = false) => {
    setIsLoadingBoards(true);
    try {
      const list = await getDefaultBoards(force);
      setAllBoards(list);
      props.onBoardsUpdated?.(list);
      return list;
    } catch (e: any) {
      console.error("Failed to load boards:", e);
      return [];
    } finally {
      setIsLoadingBoards(false);
    }
  };

  // Initial load when modal opens
  createEffect(() => {
    if (props.isOpen) {
      refreshBoards();
      setSearchQuery("");
      setSelectedFamily("All");
    }
  });

  // Filtered boards list with instant 0ms local filtering
  const filteredBoards = () => {
    const q = searchQuery().trim().toLowerCase();
    const fam = selectedFamily();
    const list = allBoards();

    return list.filter((b) => {
      // Family filter
      if (fam !== "All") {
        const fqbn = (b.fqbn || "").toLowerCase();
        const name = (b.name || "").toLowerCase();
        let bFam = b.family;
        if (!bFam) {
          if (fqbn.startsWith("esp32:") || name.includes("esp32")) bFam = "ESP32";
          else if (fqbn.startsWith("arduino:avr") || (fqbn.startsWith("arduino:") && !fqbn.includes("esp32")) || name.includes("arduino")) bFam = "Arduino";
          else if (fqbn.startsWith("esp8266:") || name.includes("esp8266") || name.includes("nodemcu")) bFam = "ESP8266";
          else if (fqbn.includes("rp2040") || name.includes("rp2040") || name.includes("pico")) bFam = "RP2040";
          else if (fqbn.includes("stm32") || name.includes("stm32")) bFam = "STM32";
          else bFam = "Other";
        }
        if (bFam.toLowerCase() !== fam.toLowerCase()) return false;
      }

      // Search query
      if (q) {
        const matchesName = b.name.toLowerCase().includes(q);
        const matchesFqbn = b.fqbn.toLowerCase().includes(q);
        const matchesArch = (b.architecture || "").toLowerCase().includes(q);
        const matchesPlat = (b.platformName || "").toLowerCase().includes(q);
        return matchesName || matchesFqbn || matchesArch || matchesPlat;
      }

      return true;
    });
  };

  const handleSelectBoard = (board: BoardInfo) => {
    props.onSelect(board);
    props.onLog?.(`[Board] Selected target board: ${board.name} (${board.fqbn})`);
    props.onClose();
  };

  return (
    <Show when={props.isOpen}>
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-100 font-sans">
        <div class="bg-[#141416] border border-[#27272A] w-full max-w-4xl h-[85vh] rounded-2xl flex flex-col shadow-2xl overflow-hidden">
          {/* Modal Header */}
          <div class="h-14 px-5 border-b border-[#27272A] flex items-center justify-between bg-[#111113] shrink-0">
            <div class="flex items-center gap-2.5">
              <Cpu size={16} class="text-[#00F0FF]" />
              <span class="font-sans font-bold text-sm text-white">Select Target Board</span>
              <span class="text-[11px] px-2 py-0.5 rounded-full bg-[#18181B] text-[#A1A1AA] border border-[#27272A] font-mono">
                {allBoards().length} boards
              </span>
            </div>

            <button
              type="button"
              onClick={props.onClose}
              class="p-1.5 rounded-lg text-[#71717A] hover:text-white hover:bg-[#27272A] transition-colors cursor-pointer"
              title="Close (Esc)"
            >
              <X size={16} />
            </button>
          </div>

          {/* Browse & Select Boards */}
          <BoardsTab
            searchQuery={searchQuery()}
            onSearchQueryChange={setSearchQuery}
            selectedFamily={selectedFamily()}
            onFamilyChange={setSelectedFamily}
            families={families}
            isLoadingBoards={isLoadingBoards()}
            onRefreshBoards={refreshBoards}
            filteredBoards={filteredBoards()}
            selectedBoard={props.selectedBoard}
            onSelectBoard={handleSelectBoard}
          />
        </div>
      </div>
    </Show>
  );
};
