import { Component, Show, For, createSignal, onMount, createEffect } from "solid-js";
import { getVersion } from "@tauri-apps/api/app";
import {
  X,
  Settings,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  ExternalLink,
  Trash2,
  AlertTriangle,
  ShieldCheck,
} from "lucide-solid";
import {
  updateState,
  checkForUpdates,
  setAutoUpdateEnabled,
  isAutoUpdateEnabled,
  setReleaseChannel,
  openReleasesPage,
  checkHardwareSafety,
  ReleaseChannel,
} from "../../services/updateService";
import {
  getUninstallManifest,
  performFullUninstall,
  UninstallManifest,
} from "../../services/tauri";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenUpdateModal?: () => void;
  isCompiling?: boolean;
  isUploading?: boolean;
  hasUnsavedChanges?: boolean;
}

export const SettingsModal: Component<SettingsModalProps> = (props) => {
  const state = () => updateState();
  const [appVersion, setAppVersion] = createSignal("0.1.0");
  const [showUninstallPanel, setShowUninstallPanel] = createSignal(false);
  const [manifest, setManifest] = createSignal<UninstallManifest | null>(null);
  const [confirmText, setConfirmText] = createSignal("");
  const [isUninstalling, setIsUninstalling] = createSignal(false);
  const [uninstallError, setUninstallError] = createSignal<string | null>(null);

  onMount(async () => {
    try {
      const v = await getVersion();
      if (v) setAppVersion(v);
    } catch {}
  });

  createEffect(() => {
    if (!props.isOpen) {
      setShowUninstallPanel(false);
      setConfirmText("");
      setUninstallError(null);
    }
  });

  const handleOpenUninstallConfirm = async () => {
    setUninstallError(null);
    setConfirmText("");
    setShowUninstallPanel(true);
    const info = await getUninstallManifest();
    setManifest(info);
  };

  const handleExecuteUninstall = async () => {
    const safety = checkHardwareSafety(Boolean(props.isCompiling), Boolean(props.isUploading));
    if (!safety.safe) {
      setUninstallError(safety.reason || "Cannot uninstall while hardware operation is running.");
      return;
    }
    if (confirmText().trim() !== "UNINSTALL") return;

    setIsUninstalling(true);
    setUninstallError(null);
    try {
      await performFullUninstall();
    } catch (e: any) {
      setUninstallError(e?.message || String(e) || "Failed to initiate uninstallation.");
      setIsUninstalling(false);
    }
  };

  const getPlatformLabel = () => {
    if (typeof navigator === "undefined") return "Desktop (x86_64)";
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes("win")) return "Windows (x86_64)";
    if (ua.includes("mac")) return "macOS (Universal)";
    return "Linux (x86_64)";
  };

  const handleToggleAutoUpdate = () => {
    setAutoUpdateEnabled(!isAutoUpdateEnabled());
  };

  const formatLastChecked = (timestamp: number | null) => {
    if (!timestamp) return "Never";
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <Show when={props.isOpen}>
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
        <div class="w-full max-w-md bg-[#18181B] border border-[#27272A] rounded-xl shadow-2xl flex flex-col overflow-hidden text-zinc-100 font-sans">
          
          {/* Header */}
          <div class="flex items-center justify-between px-5 py-3.5 border-b border-[#27272A] bg-[#141416]">
            <div class="flex items-center gap-2">
              <Settings size={15} class="text-[#00F0FF]" />
              <h3 class="text-xs font-semibold uppercase tracking-wider text-zinc-200">
                Settings
              </h3>
            </div>
            <button
              onClick={props.onClose}
              class="p-1 text-zinc-400 hover:text-zinc-100 hover:bg-[#27272A] rounded transition-colors cursor-pointer"
              title="Close (Esc)"
            >
              <X size={15} />
            </button>
          </div>

          {/* Body Content */}
          <div class="p-5 flex flex-col gap-3.5 text-xs max-h-[75vh] overflow-y-auto">
            
            {/* 1. Auto-Update Toggle */}
            <div class="p-3.5 rounded-lg bg-[#1E1E22] border border-[#27272A] flex items-center justify-between">
              <div class="flex flex-col gap-0.5">
                <span class="font-medium text-zinc-200">Automatic Updates</span>
                <span class="text-[11px] text-zinc-400">
                  Check and download new versions in background
                </span>
              </div>

              {/* Toggle Switch */}
              <button
                type="button"
                role="switch"
                aria-checked={state().autoUpdateEnabled}
                onClick={handleToggleAutoUpdate}
                class={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-150 ease-in-out focus:outline-none ${
                  state().autoUpdateEnabled ? "bg-[#00F0FF]" : "bg-zinc-700"
                }`}
              >
                <span
                  class={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-black shadow transition duration-150 ease-in-out ${
                    state().autoUpdateEnabled ? "translate-x-4" : "translate-x-0 bg-zinc-300"
                  }`}
                />
              </button>
            </div>

            {/* 2. Release Channel */}
            <div class="p-3.5 rounded-lg bg-[#1E1E22] border border-[#27272A] flex items-center justify-between">
              <div class="flex flex-col gap-0.5">
                <span class="font-medium text-zinc-200">Release Channel</span>
                <span class="text-[11px] text-zinc-400">
                  Select your preferred build stability
                </span>
              </div>

              <div class="flex items-center gap-1 bg-[#141416] p-1 rounded-md border border-[#27272A]">
                {(["stable", "beta"] as ReleaseChannel[]).map((ch) => (
                  <button
                    onClick={() => setReleaseChannel(ch)}
                    class={`px-2.5 py-0.5 rounded text-[10px] font-mono uppercase font-medium transition-colors cursor-pointer ${
                      state().channel === ch
                        ? "bg-[#00F0FF] text-black font-bold"
                        : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    {ch}
                  </button>
                ))}
              </div>
            </div>

            {/* 3. Update Status & Check Action */}
            <div class="p-3.5 rounded-lg bg-[#1E1E22] border border-[#27272A] flex flex-col gap-3">
              <div class="flex items-center justify-between">
                <div>
                  <div class="font-mono text-zinc-300 text-xs">
                    FlashCode <span class="text-zinc-400 font-normal">v{appVersion()}</span>
                  </div>
                  <div class="text-[10px] text-zinc-400 font-mono mt-0.5">
                    Last checked: {formatLastChecked(state().lastChecked)}
                  </div>
                </div>

                <button
                  onClick={() => checkForUpdates(true)}
                  disabled={state().phase === "checking"}
                  class="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#27272A] hover:bg-[#323238] active:bg-[#1E1E22] text-zinc-200 border border-[#3F3F46] hover:border-[#52525B] transition-colors text-xs font-medium cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <RefreshCw
                    size={12}
                    class={state().phase === "checking" ? "animate-spin text-[#00F0FF]" : "text-zinc-300"}
                  />
                  <span>{state().phase === "checking" ? "Checking..." : "Check for Updates"}</span>
                </button>
              </div>

              {/* Status Indicator */}
              <Show when={state().phase === "uptodate"}>
                <div class="flex items-center gap-2 pt-1 text-emerald-400 text-[11px]">
                  <CheckCircle2 size={13} class="shrink-0" />
                  <span>FlashCode is up to date.</span>
                </div>
              </Show>

              <Show when={state().phase === "available"}>
                <div class="flex items-center justify-between pt-1 border-t border-[#27272A]">
                  <div class="flex items-center gap-1.5 text-[#00F0FF] text-[11px]">
                    <Sparkles size={13} class="shrink-0 animate-pulse" />
                    <span>Version {state().info?.version} is available!</span>
                  </div>
                  <button
                    onClick={() => {
                      props.onClose();
                      props.onOpenUpdateModal?.();
                    }}
                    class="px-2.5 py-1 rounded bg-[#00F0FF] hover:bg-[#00D4E2] text-black font-semibold text-[10px] transition-colors cursor-pointer"
                  >
                    View & Install
                  </button>
                </div>
              </Show>

              <Show when={state().phase === "ready"}>
                <div class="flex items-center justify-between pt-1 border-t border-[#27272A]">
                  <div class="flex items-center gap-1.5 text-emerald-400 text-[11px]">
                    <CheckCircle2 size={13} class="shrink-0" />
                    <span>Update ready to install</span>
                  </div>
                  <button
                    onClick={() => {
                      props.onClose();
                      props.onOpenUpdateModal?.();
                    }}
                    class="px-2.5 py-1 rounded bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-[10px] transition-colors cursor-pointer"
                  >
                    Restart Now
                  </button>
                </div>
              </Show>

              <Show when={state().phase === "error"}>
                <div class="flex flex-col gap-2 pt-1">
                  <div class="flex items-start gap-1.5 text-amber-400/90 text-[11px]">
                    <AlertCircle size={13} class="shrink-0 mt-0.5 text-amber-400" />
                    <span class="leading-relaxed">{state().errorMessage}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => openReleasesPage()}
                    class="self-start flex items-center gap-1.5 text-[11px] text-[#00F0FF] hover:underline cursor-pointer"
                  >
                    <ExternalLink size={11} />
                    <span>Open GitHub Releases Page</span>
                  </button>
                </div>
              </Show>
            </div>

            {/* 4. Complete Application Removal */}
            <div class="p-3.5 rounded-lg bg-[#1E1E22] border border-[#27272A] flex flex-col gap-3">
              <Show
                when={showUninstallPanel()}
                fallback={
                  <div class="flex items-center justify-between gap-3">
                    <div class="flex flex-col gap-0.5">
                      <span class="font-medium text-zinc-200">Uninstall FlashCode</span>
                      <span class="text-[11px] text-zinc-400">
                        Remove binary, shortcuts, configs, and caches
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleOpenUninstallConfirm}
                      disabled={Boolean(props.isCompiling || props.isUploading)}
                      class="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/25 hover:border-red-500/45 transition-colors text-xs font-medium cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                    >
                      <Trash2 size={12} />
                      <span>Uninstall</span>
                    </button>
                  </div>
                }
              >
                <div class="flex flex-col gap-2.5">
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-1.5 text-red-400 font-medium">
                      <AlertTriangle size={13} />
                      <span>Confirm Complete Uninstall</span>
                    </div>
                    <Show when={manifest()?.installType}>
                      <span class="text-[10px] font-mono text-zinc-400 bg-[#141416] px-2 py-0.5 rounded border border-[#27272A]">
                        {manifest()?.installType}
                      </span>
                    </Show>
                  </div>

                  <Show when={props.hasUnsavedChanges}>
                    <div class="px-2.5 py-1.5 rounded bg-amber-500/10 border border-amber-500/25 text-amber-300 text-[11px]">
                      You have unsaved editor changes. Save your sketch before uninstalling.
                    </div>
                  </Show>

                  <Show when={manifest()?.isDevBuild}>
                    <div class="px-2.5 py-1.5 rounded bg-amber-500/10 border border-amber-500/25 text-amber-300 text-[11px]">
                      Development build detected — binary removal is locked to protect your workspace.
                    </div>
                  </Show>

                  <Show when={manifest() && manifest()!.targetPaths.length > 0}>
                    <div class="flex flex-col gap-1">
                      <span class="text-[10px] uppercase tracking-wider text-zinc-400 font-medium">
                        Paths to be removed ({manifest()!.targetPaths.length})
                      </span>
                      <div class="max-h-24 overflow-y-auto rounded bg-[#141416] border border-[#27272A] p-2 font-mono text-[10px] text-zinc-400 space-y-0.5 select-text">
                        <For each={manifest()!.targetPaths}>
                          {(p) => <div class="truncate" title={p}>{p}</div>}
                        </For>
                      </div>
                    </div>
                  </Show>

                  <div class="flex items-center gap-1.5 text-[11px] text-emerald-400/90">
                    <ShieldCheck size={12} class="shrink-0" />
                    <span>Your sketches (~/Arduino) and Arduino cores stay untouched.</span>
                  </div>

                  <input
                    type="text"
                    value={confirmText()}
                    onInput={(e) => setConfirmText(e.currentTarget.value)}
                    placeholder="Type UNINSTALL to confirm"
                    disabled={isUninstalling() || Boolean(manifest()?.isDevBuild)}
                    class="w-full px-2.5 py-1.5 rounded bg-[#141416] border border-[#27272A] focus:border-red-500/50 text-xs font-mono text-zinc-100 placeholder-zinc-500 outline-none disabled:opacity-50"
                  />

                  <Show when={uninstallError()}>
                    <div class="text-[11px] text-red-400 font-mono break-words">
                      {uninstallError()}
                    </div>
                  </Show>

                  <div class="flex items-center justify-end gap-2 pt-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        setShowUninstallPanel(false);
                        setConfirmText("");
                        setUninstallError(null);
                      }}
                      disabled={isUninstalling()}
                      class="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleExecuteUninstall}
                      disabled={
                        isUninstalling() ||
                        Boolean(manifest()?.isDevBuild) ||
                        confirmText().trim() !== "UNINSTALL"
                      }
                      class="flex items-center gap-1.5 px-3 py-1 rounded bg-red-500 hover:bg-red-400 text-white font-semibold text-xs transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Trash2 size={12} />
                      <span>{isUninstalling() ? "Uninstalling..." : "Uninstall & Exit"}</span>
                    </button>
                  </div>
                </div>
              </Show>
            </div>

          </div>

          {/* Minimal Footer */}
          <div class="px-5 py-2.5 border-t border-[#27272A] bg-[#141416] flex items-center justify-between text-[11px] text-zinc-400">
            <span class="font-mono text-[10px]">{getPlatformLabel()}</span>
            <button
              onClick={props.onClose}
              class="px-3 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors text-xs font-medium cursor-pointer"
            >
              Done
            </button>
          </div>

        </div>
      </div>
    </Show>
  );
};
