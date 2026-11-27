import { Component, createSignal, createEffect, onMount, untrack, Show } from "solid-js";
import { X } from "lucide-solid";
import {
  ArduinoLibrary,
  searchLibraries,
  getInstalledLibraries,
  installLibrary,
  uninstallLibrary,
  installLibraryZip,
  installLibraryGit,
} from "../services/tauri";

import { BrowseLibrariesTab } from "./modals/libraries/BrowseLibrariesTab";
import { ManualInstallTab } from "./modals/libraries/ManualInstallTab";

export interface LibraryManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLog?: (message: string) => void;
}

export const LibraryManagerModal: Component<LibraryManagerModalProps> = (props) => {
  // Navigation tabs: "browse" | "manual"
  const [activeTab, setActiveTab] = createSignal<"browse" | "manual">("browse");

  // Search & Filter state
  const [searchQuery, setSearchQuery] = createSignal<string>("");
  const [selectedCategory, setSelectedCategory] = createSignal<string>("All");
  const [filterInstalledOnly, setFilterInstalledOnly] = createSignal<boolean>(false);

  // Data state
  const [libraries, setLibraries] = createSignal<ArduinoLibrary[]>([]);
  const [installedLibraries, setInstalledLibraries] = createSignal<ArduinoLibrary[]>([]);
  const [isLoading, setIsLoading] = createSignal<boolean>(false);

  // Selected version per library name: Record<libraryName, chosenVersion>
  const [selectedVersions, setSelectedVersions] = createSignal<Record<string, string>>({});

  // Operation state: libraryName currently being installed or uninstalled
  const [busyLibName, setBusyLibName] = createSignal<string | null>(null);
  const [statusNotice, setStatusNotice] = createSignal<{ type: "success" | "error"; text: string } | null>(null);

  // Manual Install Form state
  const [manualName, setManualName] = createSignal<string>("");
  const [manualVersion, setManualVersion] = createSignal<string>("");
  const [manualZipPath, setManualZipPath] = createSignal<string>("");
  const [manualGitUrl, setManualGitUrl] = createSignal<string>("");
  const [manualGitBranch, setManualGitBranch] = createSignal<string>("");
  const [manualLogOutput, setManualLogOutput] = createSignal<string>("");
  const [isManualBusy, setIsManualBusy] = createSignal<boolean>(false);

  const categories = [
    "All",
    "Communication",
    "Data Processing",
    "Data Storage",
    "Device Control",
    "Display",
    "Sensors",
    "Signal Input/Output",
    "Timing",
    "Other",
  ];

  // Fetch installed libraries
  const refreshInstalled = async () => {
    try {
      const list = await getInstalledLibraries();
      setInstalledLibraries(list);
      return list;
    } catch (e) {
      console.error(e);
      return [];
    }
  };

  let searchRequestId = 0;
  let debounceTimer: any = null;

  // Perform search with monotonic request sequencing to eliminate race conditions
  const doSearch = async (query: string, category: string, installedOnly: boolean) => {
    const requestId = ++searchRequestId;
    setIsLoading(true);

    try {
      // Immediate 0ms local response when installedOnly is active
      if (installedOnly && installedLibraries().length > 0) {
        const q = query.trim().toLowerCase();
        const matched = installedLibraries().filter((l) => {
          const matchesQ =
            !q ||
            l.name.toLowerCase().includes(q) ||
            (l.author && l.author.toLowerCase().includes(q)) ||
            (l.sentence && l.sentence.toLowerCase().includes(q));
          const matchesCat =
            category === "All" ||
            (l.category && l.category.toLowerCase() === category.toLowerCase());
          return matchesQ && matchesCat;
        });
        setLibraries(matched);
      }

      const res = await searchLibraries(query, category, installedOnly);

      // If a newer search request was triggered while waiting, drop this stale result!
      if (requestId !== searchRequestId) {
        return;
      }

      setLibraries(res.libraries || []);

      // Default selected versions to latest or installed
      const currentSelections = { ...selectedVersions() };
      for (const lib of res.libraries) {
        if (!currentSelections[lib.name]) {
          currentSelections[lib.name] =
            lib.installed_version ||
            lib.latest_version ||
            (lib.available_versions?.[0] ?? "latest");
        }
      }
      setSelectedVersions(currentSelections);
    } catch (e) {
      console.error(e);
    } finally {
      if (requestId === searchRequestId) {
        setIsLoading(false);
      }
    }
  };

  // Immediate search trigger (for Enter key or Search button)
  const handleImmediateSearch = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    doSearch(searchQuery(), selectedCategory(), filterInstalledOnly());
  };

  // Debounced search trigger (300ms while typing)
  const triggerDebouncedSearch = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      doSearch(searchQuery(), selectedCategory(), filterInstalledOnly());
    }, 300);
  };

  const handleInstalledOnlyToggle = () => {
    const nextVal = !filterInstalledOnly();
    setFilterInstalledOnly(nextVal);
    doSearch(searchQuery(), selectedCategory(), nextVal);
  };

  const handleCategoryChange = (newCat: string) => {
    setSelectedCategory(newCat);
    doSearch(searchQuery(), newCat, filterInstalledOnly());
  };

  onMount(() => {
    refreshInstalled();
  });

  // Re-fetch when modal opens
  createEffect(() => {
    if (props.isOpen) {
      untrack(() => {
        refreshInstalled();
        doSearch(searchQuery(), selectedCategory(), filterInstalledOnly());
      });
    }
  });

  // Install Library Action
  const handleInstall = async (lib: ArduinoLibrary) => {
    const versionToInstall = selectedVersions()[lib.name] || lib.latest_version || "";
    setBusyLibName(lib.name);
    setStatusNotice({
      type: "success",
      text: `Installing ${lib.name} (${versionToInstall || "latest"})...`,
    });
    props.onLog?.(`[Library Manager] Starting install: ${lib.name} ${versionToInstall}...`);

    try {
      const res = await installLibrary(lib.name, versionToInstall);
      if (res.success) {
        setStatusNotice({
          type: "success",
          text: `Successfully installed ${lib.name} ${versionToInstall}!`,
        });
        props.onLog?.(`[Library Manager] Successfully installed ${lib.name} ${versionToInstall}`);
        await refreshInstalled();
        await doSearch(searchQuery(), selectedCategory(), filterInstalledOnly());
      } else {
        setStatusNotice({
          type: "error",
          text: `Failed to install ${lib.name}: ${res.stderr || "Unknown error"}`,
        });
        props.onLog?.(`[Library Manager Error] ${res.stderr || "Installation failed"}`);
      }
    } catch (e: any) {
      setStatusNotice({
        type: "error",
        text: `Error: ${e.message || String(e)}`,
      });
      props.onLog?.(`[Library Manager Exception] ${e.message || String(e)}`);
    } finally {
      setBusyLibName(null);
    }
  };

  // Uninstall Library Action
  const handleUninstall = async (lib: ArduinoLibrary) => {
    setBusyLibName(lib.name);
    setStatusNotice({
      type: "success",
      text: `Uninstalling ${lib.name}...`,
    });
    props.onLog?.(`[Library Manager] Uninstalling ${lib.name}...`);

    try {
      const res = await uninstallLibrary(lib.name);
      if (res.success) {
        setStatusNotice({
          type: "success",
          text: `Successfully uninstalled ${lib.name}.`,
        });
        props.onLog?.(`[Library Manager] Successfully uninstalled ${lib.name}`);
        await refreshInstalled();
        await doSearch(searchQuery(), selectedCategory(), filterInstalledOnly());
      } else {
        setStatusNotice({
          type: "error",
          text: `Failed to uninstall ${lib.name}: ${res.stderr || "Unknown error"}`,
        });
        props.onLog?.(`[Library Manager Error] ${res.stderr || "Uninstall failed"}`);
      }
    } catch (e: any) {
      setStatusNotice({
        type: "error",
        text: `Error: ${e.message || String(e)}`,
      });
      props.onLog?.(`[Library Manager Exception] ${e.message || String(e)}`);
    } finally {
      setBusyLibName(null);
    }
  };

  // Manual Install by Name
  const handleManualInstallByName = async () => {
    const name = manualName().trim();
    if (!name) return;
    setIsManualBusy(true);
    setManualLogOutput(`[FlashCode CLI] Invoking: arduino-cli lib install "${name}${manualVersion() ? `@${manualVersion()}` : ""}"...\n`);

    try {
      const res = await installLibrary(name, manualVersion().trim() || undefined);
      setManualLogOutput((prev) => prev + (res.stdout || "") + "\n" + (res.stderr || ""));
      if (res.success) {
        setStatusNotice({
          type: "success",
          text: `Successfully installed "${name}"!`,
        });
        await refreshInstalled();
        setManualName("");
        setManualVersion("");
      } else {
        setStatusNotice({
          type: "error",
          text: `Manual installation of ${name} failed. Check console output.`,
        });
      }
    } catch (e: any) {
      setManualLogOutput((prev) => prev + `\n[Error] ${e.message || e}`);
    } finally {
      setIsManualBusy(false);
    }
  };

  // Manual Install from ZIP
  const handleManualInstallZip = async () => {
    const zipPath = manualZipPath().trim();
    if (!zipPath) return;
    setIsManualBusy(true);
    setManualLogOutput(`[FlashCode CLI] Installing library from ZIP archive: ${zipPath}...\n`);

    try {
      const res = await installLibraryZip(zipPath);
      setManualLogOutput((prev) => prev + (res.stdout || "") + "\n" + (res.stderr || ""));
      if (res.success) {
        setStatusNotice({
          type: "success",
          text: `Successfully installed library from ZIP archive!`,
        });
        await refreshInstalled();
        setManualZipPath("");
      } else {
        setStatusNotice({
          type: "error",
          text: `ZIP installation failed. Check output log.`,
        });
      }
    } catch (e: any) {
      setManualLogOutput((prev) => prev + `\n[Error] ${e.message || e}`);
    } finally {
      setIsManualBusy(false);
    }
  };

  // Manual Install from Git
  const handleManualInstallGit = async () => {
    const gitUrl = manualGitUrl().trim();
    if (!gitUrl) return;
    setIsManualBusy(true);
    setManualLogOutput(`[FlashCode CLI] Cloning and installing library from Git repository: ${gitUrl}...\n`);

    try {
      const res = await installLibraryGit(gitUrl, manualGitBranch().trim() || undefined);
      setManualLogOutput((prev) => prev + (res.stdout || "") + "\n" + (res.stderr || ""));
      if (res.success) {
        setStatusNotice({
          type: "success",
          text: `Successfully installed library from Git repository!`,
        });
        await refreshInstalled();
        setManualGitUrl("");
        setManualGitBranch("");
      } else {
        setStatusNotice({
          type: "error",
          text: `Git installation failed. Check output log.`,
        });
      }
    } catch (e: any) {
      setManualLogOutput((prev) => prev + `\n[Error] ${e.message || e}`);
    } finally {
      setIsManualBusy(false);
    }
  };

  return (
    <Show when={props.isOpen}>
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-100 font-sans">
        <div class="bg-[#141416] border border-[#27272A] w-full max-w-4xl h-[85vh] rounded-2xl flex flex-col shadow-2xl overflow-hidden">
          {/* Header */}
          <div class="h-14 px-5 border-b border-[#27272A] flex items-center justify-between bg-[#111113] shrink-0">
            <div class="flex items-center gap-3">
              <span class="font-sans font-bold text-sm text-white">Library Manager</span>

              {/* Navigation Tabs */}
              <div class="flex items-center gap-1 bg-[#18181B] border border-[#27272A] rounded-lg p-1 text-xs">
                <button
                  type="button"
                  onClick={() => setActiveTab("browse")}
                  class={`px-3 py-1 rounded-md transition-all cursor-pointer font-sans ${
                    activeTab() === "browse"
                      ? "bg-[#27272A] text-[#00F0FF] font-semibold"
                      : "text-[#A1A1AA] hover:text-white"
                  }`}
                >
                  Library Catalog
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("manual")}
                  class={`px-3 py-1 rounded-md transition-all cursor-pointer font-sans ${
                    activeTab() === "manual"
                      ? "bg-[#27272A] text-[#00F0FF] font-semibold"
                      : "text-[#A1A1AA] hover:text-white"
                  }`}
                >
                  Manual / ZIP / Git
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={props.onClose}
              class="p-1.5 rounded-lg text-[#71717A] hover:text-white hover:bg-[#27272A] transition-colors cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>

          {/* Status Feedback Notice Banner */}
          <Show when={statusNotice()}>
            <div
              class={`px-4 py-2 text-xs font-mono flex items-center justify-between border-b shrink-0 ${
                statusNotice()!.type === "success"
                  ? "bg-[#10B981]/15 border-[#10B981]/30 text-[#34D399]"
                  : "bg-[#EF4444]/15 border-[#EF4444]/30 text-[#EF4444]"
              }`}
            >
              <span>{statusNotice()!.text}</span>
              <button
                type="button"
                onClick={() => setStatusNotice(null)}
                class="hover:opacity-75 cursor-pointer"
              >
                <X size={13} />
              </button>
            </div>
          </Show>

          {/* Tab 1: Browse Catalog */}
          <Show when={activeTab() === "browse"}>
            <BrowseLibrariesTab
              searchQuery={searchQuery()}
              onSearchQueryChange={setSearchQuery}
              onTriggerDebouncedSearch={triggerDebouncedSearch}
              onImmediateSearch={handleImmediateSearch}
              isLoading={isLoading()}
              filterInstalledOnly={filterInstalledOnly()}
              onToggleInstalledOnly={handleInstalledOnlyToggle}
              selectedCategory={selectedCategory()}
              onCategoryChange={handleCategoryChange}
              categories={categories}
              onRefresh={() => {
                refreshInstalled();
                doSearch(searchQuery(), selectedCategory(), filterInstalledOnly());
              }}
              libraries={libraries()}
              selectedVersions={selectedVersions()}
              onSelectVersion={(name, ver) => setSelectedVersions((prev) => ({ ...prev, [name]: ver }))}
              busyLibName={busyLibName()}
              onInstall={handleInstall}
              onUninstall={handleUninstall}
            />
          </Show>

          {/* Tab 2: Manual Installation Tab */}
          <Show when={activeTab() === "manual"}>
            <ManualInstallTab
              manualName={manualName()}
              onManualNameChange={setManualName}
              manualVersion={manualVersion()}
              onManualVersionChange={setManualVersion}
              onManualInstallByName={handleManualInstallByName}
              manualZipPath={manualZipPath()}
              onManualZipPathChange={setManualZipPath}
              onManualInstallZip={handleManualInstallZip}
              manualGitUrl={manualGitUrl()}
              onManualGitUrlChange={setManualGitUrl}
              manualGitBranch={manualGitBranch()}
              onManualGitBranchChange={setManualGitBranch}
              onManualInstallGit={handleManualInstallGit}
              isManualBusy={isManualBusy()}
              manualLogOutput={manualLogOutput()}
              onClearLogOutput={() => setManualLogOutput("")}
            />
          </Show>
        </div>
      </div>
    </Show>
  );
};
