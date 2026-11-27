import { Component, For, Show } from "solid-js";
import {
  Library,
  X,
  Search,
  Download,
  Trash2,
  ExternalLink,
  Check,
  Loader2,
  RefreshCw,
  ChevronDown,
} from "lucide-solid";
import { ArduinoLibrary } from "../../../services/tauri";

export interface BrowseLibrariesTabProps {
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  onTriggerDebouncedSearch: () => void;
  onImmediateSearch: () => void;
  isLoading: boolean;
  filterInstalledOnly: boolean;
  onToggleInstalledOnly: () => void;
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
  categories: string[];
  onRefresh: () => void;
  libraries: ArduinoLibrary[];
  selectedVersions: Record<string, string>;
  onSelectVersion: (libName: string, version: string) => void;
  busyLibName: string | null;
  onInstall: (lib: ArduinoLibrary) => void;
  onUninstall: (lib: ArduinoLibrary) => void;
}

export const BrowseLibrariesTab: Component<BrowseLibrariesTabProps> = (props) => {
  return (
    <>
      {/* Search & Filter Bar (Arduino IDE Style) */}
      <div class="p-4 border-b border-[#27272A] bg-[#161619] flex flex-wrap items-center gap-2.5 shrink-0">
        {/* Search Input Box with Enter Support */}
        <div class="flex-1 min-w-[240px] relative">
          <Search
            size={15}
            class="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#71717A] pointer-events-none"
          />
          <input
            type="text"
            placeholder="Search libraries (e.g. ArduinoJson, NeoPixel, MQTT, TFT)..."
            value={props.searchQuery}
            onInput={(e) => {
              props.onSearchQueryChange(e.currentTarget.value);
              props.onTriggerDebouncedSearch();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                props.onImmediateSearch();
              }
            }}
            class="w-full bg-[#1F1F23] border border-[#27272A] focus:border-[#00F0FF] focus:outline-none rounded-lg pl-9 pr-16 py-2 text-xs font-mono text-white placeholder-[#71717A] transition-colors"
          />
          <div class="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
            <Show when={props.isLoading}>
              <Loader2 size={13} class="animate-spin text-[#00F0FF]" />
            </Show>
            <Show when={props.searchQuery}>
              <button
                type="button"
                onClick={() => {
                  props.onSearchQueryChange("");
                  props.onImmediateSearch();
                }}
                class="text-[#71717A] hover:text-white p-0.5"
                title="Clear search"
              >
                <X size={13} />
              </button>
            </Show>
          </div>
        </div>

        {/* Instant Search Button */}
        <button
          type="button"
          onClick={props.onImmediateSearch}
          class="px-3 py-2 rounded-lg text-xs font-mono bg-[#27272A] hover:bg-[#323238] text-white border border-[#3F3F46] hover:border-[#00F0FF]/50 transition-all flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
          title="Search Libraries (Enter)"
        >
          <Search size={13} class="text-[#00F0FF]" />
          <span>Search</span>
        </button>

        {/* Installed Only Filter Button (Instant 0ms Toggle) */}
        <button
          type="button"
          onClick={props.onToggleInstalledOnly}
          class={`px-3 py-2 rounded-lg text-xs font-mono border transition-all flex items-center gap-2 cursor-pointer select-none active:scale-95 ${
            props.filterInstalledOnly
              ? "bg-[#00F0FF]/15 border-[#00F0FF]/60 text-[#00F0FF] font-medium shadow-[0_0_10px_rgba(0,240,255,0.15)]"
              : "bg-[#1F1F23] border-[#27272A] text-[#A1A1AA] hover:text-white hover:bg-[#27272A]"
          }`}
          title="Filter to show only libraries currently installed on your computer"
        >
          <div
            class={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors ${
              props.filterInstalledOnly
                ? "bg-[#00F0FF] border-[#00F0FF] text-[#0F0F11]"
                : "border-[#52525B] bg-[#141416]"
            }`}
          >
            <Show when={props.filterInstalledOnly}>
              <Check size={10} strokeWidth={3} />
            </Show>
          </div>
          <span>Installed Only</span>
        </button>

        {/* Category Dropdown */}
        <div class="relative flex items-center">
          <select
            value={props.selectedCategory}
            onChange={(e) => props.onCategoryChange(e.currentTarget.value)}
            class="bg-[#1F1F23] border border-[#27272A] focus:border-[#00F0FF] focus:outline-none rounded-lg px-3 py-2 text-xs font-mono text-[#E4E4E7] cursor-pointer appearance-none pr-8 transition-colors"
          >
            <For each={props.categories}>
              {(cat) => <option value={cat}>Category: {cat}</option>}
            </For>
          </select>
          <ChevronDown
            size={14}
            class="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#71717A] pointer-events-none"
          />
        </div>

        {/* Refresh Button */}
        <button
          onClick={props.onRefresh}
          disabled={props.isLoading}
          title="Refresh Library Index"
          class="p-2 rounded-lg bg-[#1F1F23] border border-[#27272A] text-[#A1A1AA] hover:text-white hover:bg-[#27272A] transition-colors"
        >
          <RefreshCw size={14} class={props.isLoading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Library Cards List */}
      <div class="flex-1 overflow-y-auto p-4 space-y-3 bg-[#0F0F11]">
        <Show when={props.isLoading && props.libraries.length === 0}>
          <div class="h-64 flex flex-col items-center justify-center text-[#71717A] gap-2 font-mono text-xs">
            <Loader2 size={24} class="animate-spin text-[#00F0FF]" />
            <span>Searching library catalogue...</span>
          </div>
        </Show>

        <Show when={!props.isLoading && props.libraries.length === 0}>
          <div class="h-64 flex flex-col items-center justify-center text-[#71717A] gap-2 font-mono text-xs">
            <Library size={32} class="opacity-40" />
            <span>No libraries matching your query found</span>
            <button
              onClick={() => {
                props.onSearchQueryChange("");
                props.onCategoryChange("All");
                if (props.filterInstalledOnly) props.onToggleInstalledOnly();
                props.onImmediateSearch();
              }}
              class="mt-2 px-3 py-1 rounded bg-[#27272A] text-white hover:bg-[#323238] transition-colors text-[11px]"
            >
              Reset Search Filters
            </button>
          </div>
        </Show>

        <For each={props.libraries}>
          {(lib) => {
            const isBusy = () => props.busyLibName === lib.name;
            const versions = () =>
              lib.available_versions && lib.available_versions.length > 0
                ? lib.available_versions
                : [lib.latest_version || "1.0.0"];

            const currentSelectedVer = () =>
              props.selectedVersions[lib.name] ||
              lib.installed_version ||
              lib.latest_version ||
              versions()[0];

            const isInstalled = () => lib.is_installed;
            const hasVersionMismatch = () =>
              isInstalled() &&
              lib.installed_version &&
              currentSelectedVer() !== lib.installed_version;

            return (
              <div
                class={`p-4 rounded-xl border transition-all ${
                  isInstalled()
                    ? "bg-[#18181B] border-[#27272A] shadow-xs"
                    : "bg-[#141416] border-[#202023] hover:border-[#2E2E33]"
                }`}
              >
                <div class="flex items-start justify-between gap-4">
                  {/* Library Meta Info */}
                  <div class="space-y-1.5 flex-1 min-w-0">
                    <div class="flex items-center gap-2 flex-wrap">
                      <h3 class="font-bold font-mono text-white text-sm">{lib.name}</h3>

                      <Show when={lib.category}>
                        <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-[#27272A] text-[#A1A1AA] border border-[#3F3F46]">
                          {lib.category}
                        </span>
                      </Show>

                      <Show when={isInstalled()}>
                        <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-[#10B981]/15 text-[#34D399] border border-[#10B981]/30 flex items-center gap-1 font-semibold">
                          <Check size={11} strokeWidth={3} />
                          <span>INSTALLED ({lib.installed_version})</span>
                        </span>
                      </Show>

                      <Show when={lib.has_update}>
                        <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-[#00F0FF]/15 text-[#00F0FF] border border-[#00F0FF]/30 font-semibold animate-pulse">
                          UPDATE AVAILABLE: {lib.latest_version}
                        </span>
                      </Show>
                    </div>

                    <p class="text-xs text-[#D4D4D8] leading-relaxed line-clamp-2">
                      {lib.sentence || lib.paragraph || "No description provided."}
                    </p>

                    <div class="flex items-center gap-3 text-[11px] text-[#71717A] font-mono pt-0.5">
                      <Show when={lib.author}>
                        <span>By: <span class="text-[#A1A1AA]">{lib.author}</span></span>
                      </Show>
                      <Show when={lib.website}>
                        <a
                          href={lib.website}
                          target="_blank"
                          rel="noreferrer"
                          class="text-[#00F0FF] hover:underline flex items-center gap-1"
                        >
                          <span>Repository</span>
                          <ExternalLink size={10} />
                        </a>
                      </Show>
                    </div>
                  </div>

                  {/* Right Action Side: Version Selector + Install/Uninstall Buttons */}
                  <div class="flex flex-col items-end gap-2 shrink-0">
                    <div class="flex items-center gap-2">
                      {/* Version Dropdown */}
                      <div class="relative">
                        <select
                          value={currentSelectedVer()}
                          onChange={(e) => props.onSelectVersion(lib.name, e.currentTarget.value)}
                          disabled={isBusy()}
                          class="bg-[#1F1F23] border border-[#27272A] rounded-lg px-2.5 py-1 text-xs font-mono text-[#E4E4E7] cursor-pointer appearance-none pr-6 focus:border-[#00F0FF] focus:outline-none disabled:opacity-50"
                        >
                          <For each={versions()}>
                            {(ver) => <option value={ver}>{ver}</option>}
                          </For>
                        </select>
                        <ChevronDown
                          size={12}
                          class="absolute right-1.5 top-1/2 -translate-y-1/2 text-[#71717A] pointer-events-none"
                        />
                      </div>

                      {/* Main Action: Install / Update / Reinstall */}
                      <button
                        onClick={() => props.onInstall(lib)}
                        disabled={isBusy()}
                        class={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-mono font-bold transition-all disabled:opacity-50 cursor-pointer ${
                          lib.has_update
                            ? "bg-[#00F0FF] hover:bg-[#38F9D7] text-[#0A0A0C] shadow-sm shadow-[#00F0FF]/30"
                            : isInstalled() && hasVersionMismatch()
                            ? "bg-[#00F0FF]/20 hover:bg-[#00F0FF]/30 text-[#00F0FF] border border-[#00F0FF]/40"
                            : isInstalled()
                            ? "bg-[#27272A] hover:bg-[#323238] text-[#A1A1AA] hover:text-white"
                            : "bg-[#00F0FF] hover:bg-[#38F9D7] text-[#0A0A0C] shadow-sm shadow-[#00F0FF]/30"
                        }`}
                      >
                        <Show when={isBusy()} fallback={<Download size={12} class="stroke-[2.5]" />}>
                          <Loader2 size={12} class="animate-spin" />
                        </Show>
                        <span>
                          {isBusy()
                            ? "Installing..."
                            : lib.has_update
                            ? "Update"
                            : isInstalled() && hasVersionMismatch()
                            ? `Switch to ${currentSelectedVer()}`
                            : isInstalled()
                            ? "Reinstall"
                            : "Install"}
                        </span>
                      </button>

                      {/* Uninstall Button */}
                      <Show when={isInstalled()}>
                        <button
                          onClick={() => props.onUninstall(lib)}
                          disabled={isBusy()}
                          title="Uninstall Library"
                          class="p-1.5 rounded-lg text-[#71717A] hover:text-[#EF4444] hover:bg-[#EF4444]/10 transition-colors disabled:opacity-50 cursor-pointer"
                        >
                          <Trash2 size={14} />
                        </button>
                      </Show>
                    </div>
                  </div>
                </div>
              </div>
            );
          }}
        </For>
      </div>
    </>
  );
};
