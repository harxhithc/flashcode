import { Component, Show, createMemo } from "solid-js";
import {
  X,
  Sparkles,
  Download,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  Radio,
  ArrowRight,
  Loader2,
  ExternalLink,
} from "lucide-solid";
import {
  updateState,
  checkForUpdates,
  downloadAndStageUpdate,
  applyUpdateAndRelaunch,
  setReleaseChannel,
  checkHardwareSafety,
  openReleasesPage,
  ReleaseChannel,
} from "../../services/updateService";

interface UpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  isCompiling: boolean;
  isUploading: boolean;
}

export const UpdateModal: Component<UpdateModalProps> = (props) => {
  const state = () => updateState();

  const safety = createMemo(() => {
    return checkHardwareSafety(props.isCompiling, props.isUploading);
  });

  const formatBytes = (bytes: number) => {
    if (bytes <= 0) return "0 MB";
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  return (
    <Show when={props.isOpen}>
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
        <div class="w-full max-w-lg bg-[#18181B] border border-[#27272A] rounded-xl shadow-2xl flex flex-col overflow-hidden text-zinc-100 font-sans">
          
          {/* Header */}
          <div class="flex items-center justify-between px-5 py-3.5 border-b border-[#27272A] bg-[#141416]">
            <div class="flex items-center gap-2.5">
              <div class="p-1.5 rounded-md bg-[#00F0FF]/10 text-[#00F0FF]">
                <Sparkles size={16} />
              </div>
              <div>
                <h3 class="text-sm font-semibold tracking-wide text-zinc-100">
                  FlashCode Software Updates
                </h3>
                <p class="text-[11px] text-zinc-400 font-mono">
                  Enterprise Auto-Update Engine
                </p>
              </div>
            </div>
            <button
              onClick={props.onClose}
              class="p-1 text-zinc-400 hover:text-zinc-100 hover:bg-[#27272A] rounded-md transition-colors"
              title="Close"
            >
              <X size={16} />
            </button>
          </div>

          {/* Body Content */}
          <div class="p-5 flex flex-col gap-4 text-xs">
            
            {/* Checking State */}
            <Show when={state().phase === "checking"}>
              <div class="flex flex-col items-center justify-center py-8 gap-3 text-zinc-400">
                <Loader2 size={28} class="animate-spin text-[#00F0FF]" />
                <p class="text-xs">Querying enterprise update distribution service...</p>
              </div>
            </Show>

            {/* Up To Date State */}
            <Show when={state().phase === "uptodate"}>
              <div class="flex flex-col items-center text-center py-6 gap-3">
                <div class="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20">
                  <CheckCircle2 size={24} />
                </div>
                <div>
                  <h4 class="text-sm font-medium text-zinc-200">FlashCode is Up to Date</h4>
                  <p class="text-zinc-400 mt-1">
                    You are running the latest version for the{" "}
                    <span class="text-[#00F0FF] uppercase font-mono">{state().channel}</span> channel.
                  </p>
                </div>
                <div class="flex items-center gap-2 text-[11px] text-zinc-400 font-mono bg-[#1E1E22] px-3 py-1.5 rounded-md border border-[#27272A]">
                  <ShieldCheck size={14} class="text-emerald-400" />
                  <span>Ed25519 Cryptographic Signature Verified</span>
                </div>
              </div>
            </Show>

            {/* Update Available State */}
            <Show when={state().phase === "available" && state().info}>
              <div class="flex flex-col gap-3">
                {/* Version Transition Banner */}
                <div class="flex items-center justify-between p-3 rounded-lg bg-[#1E1E22] border border-[#27272A]">
                  <div class="flex items-center gap-3">
                    <span class="px-2 py-0.5 rounded text-[11px] font-mono bg-zinc-800 text-zinc-400">
                      v{state().info?.currentVersion || "0.1.0"}
                    </span>
                    <ArrowRight size={14} class="text-[#00F0FF]" />
                    <span class="px-2 py-0.5 rounded text-[11px] font-mono bg-[#00F0FF]/15 text-[#00F0FF] font-semibold border border-[#00F0FF]/30">
                      v{state().info?.version}
                    </span>
                  </div>
                  <span class="text-[11px] text-emerald-400 font-medium">New Release Available</span>
                </div>

                {/* Release Notes */}
                <div class="flex flex-col gap-1.5">
                  <span class="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">
                    Release Notes & Improvements
                  </span>
                  <div class="h-32 overflow-y-auto p-3 rounded-lg bg-[#121214] border border-[#27272A] font-mono text-[11px] text-zinc-300 leading-relaxed whitespace-pre-wrap select-text">
                    {state().info?.notes}
                  </div>
                </div>

                {/* Channel Selector */}
                <div class="flex items-center justify-between pt-1">
                  <span class="text-zinc-400">Release Channel:</span>
                  <div class="flex items-center gap-1 bg-[#121214] p-1 rounded-md border border-[#27272A]">
                    {(["stable", "beta", "lts"] as ReleaseChannel[]).map((ch) => (
                      <button
                        onClick={() => setReleaseChannel(ch)}
                        class={`px-2.5 py-0.5 rounded text-[10px] font-mono transition-colors uppercase ${
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
              </div>
            </Show>

            {/* Downloading State */}
            <Show when={state().phase === "downloading"}>
              <div class="flex flex-col gap-3 py-4">
                <div class="flex items-center justify-between text-xs">
                  <span class="text-zinc-300 flex items-center gap-1.5">
                    <Loader2 size={13} class="animate-spin text-[#00F0FF]" />
                    Downloading verified update package...
                  </span>
                  <span class="font-mono text-[#00F0FF] font-medium">{state().progress}%</span>
                </div>

                {/* Progress Bar */}
                <div class="w-full h-2 bg-[#27272A] rounded-full overflow-hidden">
                  <div
                    class="h-full bg-gradient-to-r from-[#00F0FF] to-[#3B82F6] transition-all duration-300 ease-out"
                    style={{ width: `${state().progress}%` }}
                  />
                </div>

                <div class="flex items-center justify-between text-[11px] text-zinc-400 font-mono">
                  <span>{formatBytes(state().downloadedBytes)} / {formatBytes(state().totalBytes)}</span>
                  <span>TLS 1.3 + Ed25519 Stream</span>
                </div>
              </div>
            </Show>

            {/* Update Ready (Downloaded & Staged) */}
            <Show when={state().phase === "ready"}>
              <div class="flex flex-col gap-3">
                <div class="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-start gap-2.5">
                  <CheckCircle2 size={18} class="text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <h5 class="font-medium text-emerald-300">Update Downloaded & Verified</h5>
                    <p class="text-[11px] text-zinc-400 mt-0.5">
                      Version {state().info?.version} is staged and ready to be applied.
                    </p>
                  </div>
                </div>

                {/* Hardware Safety Blocker */}
                <Show when={!safety().safe}>
                  <div class="p-3 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-start gap-2.5 text-amber-300">
                    <AlertTriangle size={18} class="shrink-0 mt-0.5" />
                    <div>
                      <h5 class="font-medium">Hardware Safety Interlock Active</h5>
                      <p class="text-[11px] text-amber-200/80 mt-0.5">
                        {safety().reason} Restarting is locked until this operation finishes to protect the target device.
                      </p>
                    </div>
                  </div>
                </Show>

                <p class="text-[11px] text-zinc-400">
                  You can restart now to launch the new version immediately, or continue working and let FlashCode apply the update automatically upon exit.
                </p>
              </div>
            </Show>

            {/* Error State */}
            <Show when={state().phase === "error"}>
              <div class="p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex flex-col gap-2 text-red-300">
                <div class="flex items-start gap-2.5">
                  <AlertTriangle size={18} class="shrink-0 mt-0.5 text-red-400" />
                  <div class="flex-1">
                    <h5 class="font-medium">Update Process Encountered an Issue</h5>
                    <p class="text-[11px] text-red-200/80 mt-1 font-mono break-words">
                      {state().errorMessage}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => openReleasesPage()}
                  class="self-start flex items-center gap-1.5 text-[11px] text-[#00F0FF] hover:underline cursor-pointer ml-6"
                >
                  <ExternalLink size={12} />
                  <span>Download Manually from GitHub Releases</span>
                </button>
              </div>
            </Show>

          </div>

          {/* Footer Actions */}
          <div class="px-5 py-3.5 border-t border-[#27272A] bg-[#141416] flex items-center justify-between">
            <div class="flex items-center gap-1.5 text-[10px] text-zinc-400 font-mono">
              <Radio size={12} class="text-[#00F0FF]" />
              <span>Channel: {state().channel.toUpperCase()}</span>
            </div>

            <div class="flex items-center gap-2">
              {/* Available State Buttons */}
              <Show when={state().phase === "available"}>
                <button
                  onClick={props.onClose}
                  class="px-3 py-1.5 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-[#27272A] transition-colors text-xs"
                >
                  Remind Later
                </button>
                <button
                  onClick={downloadAndStageUpdate}
                  class="flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-[#00F0FF] hover:bg-[#00D4E2] text-black font-semibold transition-colors text-xs shadow-sm"
                >
                  <Download size={13} />
                  <span>Download & Install</span>
                </button>
              </Show>

              {/* Ready State Buttons */}
              <Show when={state().phase === "ready"}>
                <button
                  onClick={props.onClose}
                  class="px-3 py-1.5 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-[#27272A] transition-colors text-xs"
                >
                  Apply on Exit
                </button>
                <button
                  onClick={() =>
                    applyUpdateAndRelaunch({
                      isCompiling: props.isCompiling,
                      isUploading: props.isUploading,
                    })
                  }
                  disabled={!safety().safe}
                  class={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md font-semibold transition-colors text-xs shadow-sm ${
                    safety().safe
                      ? "bg-emerald-500 hover:bg-emerald-400 text-black cursor-pointer"
                      : "bg-zinc-700 text-zinc-400 cursor-not-allowed opacity-60"
                  }`}
                >
                  <RefreshCw size={13} />
                  <span>Restart FlashCode Now</span>
                </button>
              </Show>

              {/* Up to Date / Error / Idle State Buttons */}
              <Show when={state().phase === "uptodate" || state().phase === "error" || state().phase === "idle"}>
                <button
                  onClick={() => checkForUpdates(true)}
                  class="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#27272A] hover:bg-[#323238] text-zinc-200 transition-colors text-xs"
                >
                  <RefreshCw size={12} />
                  <span>Check Again</span>
                </button>
                <button
                  onClick={props.onClose}
                  class="px-3.5 py-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors text-xs"
                >
                  Close
                </button>
              </Show>
            </div>
          </div>

        </div>
      </div>
    </Show>
  );
};
