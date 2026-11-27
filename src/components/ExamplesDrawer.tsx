import { Component, createSignal, createEffect, onMount, For, Show } from "solid-js";
import { X, RefreshCw, ChevronDown, ChevronRight, Search } from "lucide-solid";
import { ExampleGroup, ExampleItem, getExamples } from "../services/tauri";

interface ExamplesDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenExample: (filePath: string, fileName: string) => void;
  activeFilePath?: string;
}

export const ExamplesDrawer: Component<ExamplesDrawerProps> = (props) => {
  const [groups, setGroups] = createSignal<ExampleGroup[]>([]);
  const [totalCount, setTotalCount] = createSignal<number>(0);
  const [isLoading, setIsLoading] = createSignal<boolean>(false);
  const [searchQuery, setSearchQuery] = createSignal<string>("");

  // Set of expanded group IDs (default: builtin and core expanded)
  const [expandedGroups, setExpandedGroups] = createSignal<Set<string>>(
    new Set(["builtin", "core-esp32-esp32", "libraries"])
  );

  // Set of expanded category keys: `${groupId}:${catName}`
  const [expandedCategories, setExpandedCategories] = createSignal<Set<string>>(
    new Set(["builtin:01.Basics"])
  );

  const fetchExampleSketches = async () => {
    setIsLoading(true);
    try {
      const res = await getExamples();
      if (res.success && res.groups) {
        setGroups(res.groups);
        setTotalCount(res.total);
      }
    } catch (e) {
      console.error("Failed to load examples", e);
    } finally {
      setIsLoading(false);
    }
  };

  onMount(() => {
    fetchExampleSketches();
  });

  createEffect(() => {
    if (props.isOpen && groups().length === 0) {
      fetchExampleSketches();
    }
  });

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  const toggleCategory = (key: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const isSearching = () => searchQuery().trim().length > 0;

  // Filtered search across all items
  const filteredItems = () => {
    const q = searchQuery().trim().toLowerCase();
    if (!q) return [];

    const matches: (ExampleItem & { groupTitle: string })[] = [];
    for (const group of groups()) {
      for (const cat of group.categories) {
        for (const ex of cat.examples) {
          if (
            ex.name.toLowerCase().includes(q) ||
            ex.category.toLowerCase().includes(q) ||
            group.title.toLowerCase().includes(q)
          ) {
            matches.push({
              ...ex,
              groupTitle: group.title,
            });
          }
        }
      }
    }
    return matches;
  };

  const handleItemClick = (ex: ExampleItem) => {
    props.onOpenExample(ex.inoPath, `${ex.name}.ino`);
  };

  return (
    <Show when={props.isOpen}>
      <aside class="w-72 bg-[#141416] border-r border-[#27272A] flex flex-col font-sans text-xs select-none z-20 shrink-0">
        {/* Header */}
        <div class="h-9 px-3 border-b border-[#27272A] flex items-center justify-between text-[#A1A1AA] bg-[#18181B]">
          <div class="flex items-center gap-2 font-semibold text-[#E4E4E7] tracking-wider text-[11px] uppercase">
            <span>Examples</span>
            <Show when={totalCount() > 0}>
              <span class="text-[10px] text-[#71717A] font-mono lowercase">({totalCount()})</span>
            </Show>
          </div>

          <div class="flex items-center gap-1">
            <button
              onClick={fetchExampleSketches}
              class="p-1 rounded hover:text-white hover:bg-[#27272A] transition-colors"
              title="Refresh Examples"
            >
              <RefreshCw size={13} class={isLoading() ? "animate-spin text-[#00F0FF]" : ""} />
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

        {/* Filter Input */}
        <div class="p-2 border-b border-[#27272A] bg-[#141416]">
          <div class="relative flex items-center">
            <Search size={12} class="absolute left-2.5 text-[#71717A] pointer-events-none" />
            <input
              type="text"
              placeholder="Search examples..."
              value={searchQuery()}
              onInput={(e) => setSearchQuery(e.currentTarget.value)}
              class="w-full bg-[#18181B] border border-[#27272A] focus:border-[#00F0FF] focus:outline-none rounded pl-7 pr-7 py-1 text-xs text-[#E4E4E7] placeholder-[#71717A]"
            />
            <Show when={searchQuery().length > 0}>
              <button
                onClick={() => setSearchQuery("")}
                class="absolute right-2 text-[#71717A] hover:text-white transition-colors p-0.5"
                title="Clear search"
              >
                <X size={11} />
              </button>
            </Show>
          </div>
        </div>

        {/* Content Area */}
        <div class="flex-1 overflow-y-auto p-1.5 space-y-2 bg-[#0F0F11]">
          {/* Case 1: Search results active */}
          <Show
            when={!isSearching()}
            fallback={
              <div class="space-y-1">
                <div class="px-2 py-1 text-[10px] text-[#71717A] uppercase tracking-wider font-semibold">
                  Found {filteredItems().length} matching {filteredItems().length === 1 ? "example" : "examples"}
                </div>
                <Show
                  when={filteredItems().length > 0}
                  fallback={
                    <div class="py-8 text-center text-[#71717A] text-xs">
                      No example sketches match "{searchQuery()}".
                    </div>
                  }
                >
                  <For each={filteredItems()}>
                    {(item) => {
                      const isActive = () => props.activeFilePath === item.inoPath;
                      return (
                        <div
                          onClick={() => handleItemClick(item)}
                          class={`px-2.5 py-1.5 rounded cursor-pointer transition-colors flex items-center justify-between text-xs ${
                            isActive()
                              ? "bg-[#27272A] text-[#00F0FF] font-medium"
                              : "text-[#D4D4D8] hover:text-white hover:bg-[#1E1E22]"
                          }`}
                        >
                          <span class="truncate font-mono text-[11px]">{item.name}</span>
                          <span class="text-[10px] text-[#71717A] ml-2 truncate max-w-[100px]">
                            {item.category}
                          </span>
                        </div>
                      );
                    }}
                  </For>
                </Show>
              </div>
            }
          >
            {/* Case 2: Grouped accordion view */}
            <Show
              when={!isLoading() || groups().length > 0}
              fallback={
                <div class="py-12 text-center text-[#71717A] space-y-2">
                  <div class="animate-spin inline-block w-4 h-4 border-2 border-[#00F0FF] border-t-transparent rounded-full" />
                  <div class="text-[11px]">Scanning examples...</div>
                </div>
              }
            >
              <For each={groups()}>
                {(group) => {
                  const isGroupOpen = () => expandedGroups().has(group.id);
                  return (
                    <div class="border border-[#1F1F23] rounded bg-[#141416] overflow-hidden">
                      {/* Group Accordion Header */}
                      <button
                        onClick={() => toggleGroup(group.id)}
                        class="w-full px-2.5 py-1.5 flex items-center justify-between bg-[#18181B] hover:bg-[#1E1E22] text-[#E4E4E7] text-[11px] font-semibold transition-colors"
                      >
                        <div class="flex items-center gap-1.5 truncate">
                          <Show
                            when={isGroupOpen()}
                            fallback={<ChevronRight size={12} class="text-[#71717A] shrink-0" />}
                          >
                            <ChevronDown size={12} class="text-[#00F0FF] shrink-0" />
                          </Show>
                          <span class="truncate">{group.title}</span>
                        </div>
                        <span class="text-[10px] text-[#71717A] font-mono">
                          {group.totalCount}
                        </span>
                      </button>

                      {/* Group Categories List */}
                      <Show when={isGroupOpen()}>
                        <div class="p-1 space-y-0.5 bg-[#0F0F11]">
                          <For each={group.categories}>
                            {(cat) => {
                              const catKey = `${group.id}:${cat.name}`;
                              const isCatOpen = () => expandedCategories().has(catKey);
                              return (
                                <div class="rounded overflow-hidden">
                                  {/* Subcategory Header */}
                                  <button
                                    onClick={() => toggleCategory(catKey)}
                                    class="w-full px-2 py-1 flex items-center justify-between hover:bg-[#18181B] text-[#A1A1AA] hover:text-[#E4E4E7] text-[11px] transition-colors rounded"
                                  >
                                    <div class="flex items-center gap-1 truncate">
                                      <Show
                                        when={isCatOpen()}
                                        fallback={<ChevronRight size={10} class="text-[#71717A] shrink-0" />}
                                      >
                                        <ChevronDown size={10} class="text-[#71717A] shrink-0" />
                                      </Show>
                                      <span class="truncate font-medium">{cat.name}</span>
                                    </div>
                                    <span class="text-[9px] text-[#52525B] font-mono">
                                      {cat.examples.length}
                                    </span>
                                  </button>

                                  {/* Examples List */}
                                  <Show when={isCatOpen()}>
                                    <div class="pl-4 pr-1 py-0.5 space-y-0.5">
                                      <For each={cat.examples}>
                                        {(ex) => {
                                          const isActive = () => props.activeFilePath === ex.inoPath;
                                          return (
                                            <button
                                              onClick={() => handleItemClick(ex)}
                                              class={`w-full text-left px-2 py-1 rounded text-[11px] font-mono transition-colors truncate block ${
                                                isActive()
                                                  ? "bg-[#27272A] text-[#00F0FF] font-medium"
                                                  : "text-[#D4D4D8] hover:text-white hover:bg-[#18181B]"
                                              }`}
                                              title={ex.inoPath}
                                            >
                                              {ex.name}
                                            </button>
                                          );
                                        }}
                                      </For>
                                    </div>
                                  </Show>
                                </div>
                              );
                            }}
                          </For>
                        </div>
                      </Show>
                    </div>
                  );
                }}
              </For>
            </Show>
          </Show>
        </div>
      </aside>
    </Show>
  );
};
