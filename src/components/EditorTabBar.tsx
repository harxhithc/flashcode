import { Component, For, Show, onMount, onCleanup, createSignal } from "solid-js";
import { Plus, X, FileCode, FolderX } from "lucide-solid";
import { OpenFileItem } from "./TopBar";

interface EditorTabBarProps {
  openFiles: OpenFileItem[];
  activeFileId?: string;
  activeFileName: string;
  onSelectTab: (file: OpenFileItem) => void;
  onCloseTab: (file: OpenFileItem) => void;
  onCloseSketch?: () => void;
  onCloseOtherTabs?: (file: OpenFileItem) => void;
  onNewFile: () => void;
}

export const EditorTabBar: Component<EditorTabBarProps> = (props) => {
  let scrollContainer!: HTMLDivElement;

  // Context menu state for right-clicking tabs
  const [contextMenu, setContextMenu] = createSignal<{
    x: number;
    y: number;
    file: OpenFileItem;
  } | null>(null);

  const handleWheel = (e: WheelEvent) => {
    if (scrollContainer && e.deltaY !== 0) {
      e.preventDefault();
      scrollContainer.scrollLeft += e.deltaY;
    }
  };

  const handleContextMenu = (e: MouseEvent, file: OpenFileItem) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      file,
    });
  };

  const closeContextMenu = () => {
    setContextMenu(null);
  };

  onMount(() => {
    if (scrollContainer) {
      scrollContainer.addEventListener("wheel", handleWheel, { passive: false });
    }
    window.addEventListener("click", closeContextMenu);
  });

  onCleanup(() => {
    if (scrollContainer) {
      scrollContainer.removeEventListener("wheel", handleWheel);
    }
    window.removeEventListener("click", closeContextMenu);
  });

  const getFileBadgeColor = (name: string) => {
    if (name.endsWith(".ino")) return "text-[#00F0FF]";
    if (name.endsWith(".h") || name.endsWith(".hpp")) return "text-[#A78BFA]";
    if (name.endsWith(".cpp") || name.endsWith(".c")) return "text-[#60A5FA]";
    return "text-[#71717A]";
  };

  return (
    <div class="h-[35px] shrink-0 flex-none bg-[#141416] border-b border-[#27272A] flex items-stretch justify-between select-none z-20 font-sans text-xs overflow-hidden">
      {/* Scrollable Tabs Container (Flush VS Code layout) */}
      <div
        ref={scrollContainer}
        class="flex items-stretch overflow-x-auto overflow-y-hidden flex-1 min-w-0 h-full no-scrollbar"
      >
        <For each={props.openFiles}>
          {(file) => {
            const isActive = () =>
              props.activeFileId ? file.id === props.activeFileId : file.name === props.activeFileName;

            return (
              <div
                onClick={() => props.onSelectTab(file)}
                onContextMenu={(e) => handleContextMenu(e, file)}
                class={`flex items-center gap-2 px-3 h-full cursor-pointer border-r transition-colors shrink-0 group ${
                  isActive()
                    ? "bg-[#0F0F11] border-r-[#27272A] text-[#F4F4F5] font-medium"
                    : "bg-[#18181B] border-r-[#27272A]/70 text-[#909097] hover:text-[#E4E4E7] hover:bg-[#1F1F23]"
                }`}
                title={file.path || file.name}
              >
                {/* File Type Icon */}
                <FileCode size={13} class={`${getFileBadgeColor(file.name)} shrink-0`} />

                {/* File Name */}
                <span class="max-w-[150px] truncate font-mono text-xs">{file.name}</span>

                {/* Dirty / Close Button (VS Code behavior) */}
                <div class="ml-1 flex items-center justify-center w-4 h-4 shrink-0">
                  <Show
                    when={file.isDirty}
                    fallback={
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          props.onCloseTab(file);
                        }}
                        class={`p-0.5 rounded hover:bg-[#27272A] hover:text-[#EF4444] transition-colors ${
                          isActive()
                            ? "text-[#71717A] opacity-70 hover:opacity-100"
                            : "text-[#71717A] opacity-0 group-hover:opacity-100"
                        }`}
                        title="Close Tab (Ctrl+W)"
                      >
                        <X size={12} />
                      </button>
                    }
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        props.onCloseTab(file);
                      }}
                      class="relative flex items-center justify-center w-4 h-4 p-0.5 rounded hover:bg-[#27272A] text-[#71717A] hover:text-[#EF4444] transition-colors group/close"
                      title="Unsaved changes — Click to close (Ctrl+W)"
                    >
                      <span class="w-2 h-2 rounded-full bg-[#00F0FF] block group-hover/close:hidden" />
                      <X size={12} class="hidden group-hover/close:block text-[#71717A] hover:text-[#EF4444]" />
                    </button>
                  </Show>
                </div>
              </div>
            );
          }}
        </For>

        {/* New Tab Button */}
        <button
          onClick={props.onNewFile}
          class="flex items-center justify-center px-2.5 h-full text-[#71717A] hover:text-[#00F0FF] hover:bg-[#1F1F23] transition-colors shrink-0"
          title="New Sketch / Tab (Ctrl+N)"
        >
          <Plus size={13} />
        </button>
      </div>

      {/* Right: Quick Close Sketch Button */}
      <Show when={props.onCloseSketch && props.openFiles.length > 0}>
        <div class="flex items-center px-2 border-l border-[#27272A] shrink-0 h-full bg-[#141416]">
          <button
            onClick={props.onCloseSketch}
            class="flex items-center gap-1.5 px-2 py-1 rounded text-[#71717A] hover:text-[#EF4444] hover:bg-[#1E1E22] transition-colors text-[11px]"
            title="Close Sketch / Folder (Ctrl+Shift+W)"
          >
            <FolderX size={13} class="text-[#EF4444]" />
            <span class="font-medium text-[11px] hidden md:inline">Close Sketch</span>
          </button>
        </div>
      </Show>

      {/* Tab Context Menu */}
      <Show when={contextMenu()}>
        {(menu) => (
          <div
            style={{
              position: "fixed",
              left: `${Math.min(menu().x, window.innerWidth - 180)}px`,
              top: `${Math.min(menu().y, window.innerHeight - 120)}px`,
            }}
            class="bg-[#18181B] border border-[#27272A] rounded-lg shadow-2xl py-1 z-50 w-44 font-sans text-xs animate-in fade-in zoom-in-95 duration-100"
          >
            <button
              onClick={() => {
                props.onCloseTab(menu().file);
                closeContextMenu();
              }}
              class="w-full px-3 py-1.5 text-left text-[#E4E4E7] hover:bg-[#27272A] hover:text-[#EF4444] flex items-center justify-between"
            >
              <span>Close Tab</span>
              <span class="text-[10px] text-[#71717A] font-mono">Ctrl+W</span>
            </button>

            <Show when={props.onCloseOtherTabs && props.openFiles.length > 1}>
              <button
                onClick={() => {
                  props.onCloseOtherTabs?.(menu().file);
                  closeContextMenu();
                }}
                class="w-full px-3 py-1.5 text-left text-[#E4E4E7] hover:bg-[#27272A] flex items-center justify-between"
              >
                <span>Close Other Tabs</span>
              </button>
            </Show>

            <Show when={props.onCloseSketch}>
              <div class="my-1 border-t border-[#27272A]" />
              <button
                onClick={() => {
                  props.onCloseSketch?.();
                  closeContextMenu();
                }}
                class="w-full px-3 py-1.5 text-left text-[#EF4444] hover:bg-[#27272A] flex items-center justify-between font-medium"
              >
                <span>Close Sketch</span>
                <span class="text-[10px] text-[#71717A] font-mono">Ctrl+Shift+W</span>
              </button>
            </Show>
          </div>
        )}
      </Show>
    </div>
  );
};
