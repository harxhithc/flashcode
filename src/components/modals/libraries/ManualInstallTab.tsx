import { Component, Show } from "solid-js";
import {
  Library,
  FolderArchive,
  GitBranch,
  Download,
  Loader2,
} from "lucide-solid";

export interface ManualInstallTabProps {
  manualName: string;
  onManualNameChange: (val: string) => void;
  manualVersion: string;
  onManualVersionChange: (val: string) => void;
  onManualInstallByName: () => void;
  manualZipPath: string;
  onManualZipPathChange: (val: string) => void;
  onManualInstallZip: () => void;
  manualGitUrl: string;
  onManualGitUrlChange: (val: string) => void;
  manualGitBranch: string;
  onManualGitBranchChange: (val: string) => void;
  onManualInstallGit: () => void;
  isManualBusy: boolean;
  manualLogOutput: string;
  onClearLogOutput: () => void;
}

export const ManualInstallTab: Component<ManualInstallTabProps> = (props) => {
  return (
    <div class="flex-1 overflow-y-auto p-6 space-y-6 bg-[#0F0F11]">
      {/* Option A: Install by Registry Name & Version */}
      <div class="p-5 rounded-xl bg-[#18181B] border border-[#27272A] space-y-3">
        <div class="flex items-center gap-2 text-white font-bold text-sm">
          <Library size={16} class="text-[#00F0FF]" />
          <span>Install by Library Name & Version</span>
        </div>
        <p class="text-xs text-[#A1A1AA] leading-relaxed">
          Enter an exact library identifier (e.g. <code class="text-[#00F0FF]">ArduinoJson</code>, <code class="text-[#00F0FF]">Adafruit NeoPixel</code>) and optionally pin to a specific version number.
        </p>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
          <div class="md:col-span-2">
            <input
              type="text"
              placeholder="Library Name (e.g. ArduinoJson)"
              value={props.manualName}
              onInput={(e) => props.onManualNameChange(e.currentTarget.value)}
              class="w-full bg-[#1F1F23] border border-[#27272A] focus:border-[#00F0FF] focus:outline-none rounded-lg px-3 py-2 text-xs font-mono text-white placeholder-[#71717A]"
            />
          </div>
          <div>
            <input
              type="text"
              placeholder="Version (optional, e.g. 7.2.1)"
              value={props.manualVersion}
              onInput={(e) => props.onManualVersionChange(e.currentTarget.value)}
              class="w-full bg-[#1F1F23] border border-[#27272A] focus:border-[#00F0FF] focus:outline-none rounded-lg px-3 py-2 text-xs font-mono text-white placeholder-[#71717A]"
            />
          </div>
        </div>

        <div class="flex justify-end pt-1">
          <button
            onClick={props.onManualInstallByName}
            disabled={props.isManualBusy || !props.manualName.trim()}
            class="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#00F0FF] hover:bg-[#38F9D7] text-[#0F0F11] font-bold text-xs font-mono transition-all disabled:opacity-50 cursor-pointer"
          >
            <Show when={props.isManualBusy} fallback={<Download size={13} class="stroke-[2.5]" />}>
              <Loader2 size={13} class="animate-spin" />
            </Show>
            <span>Install Library</span>
          </button>
        </div>
      </div>

      {/* Option B: Install from Local .ZIP or Folder */}
      <div class="p-5 rounded-xl bg-[#18181B] border border-[#27272A] space-y-3">
        <div class="flex items-center gap-2 text-white font-bold text-sm">
          <FolderArchive size={16} class="text-[#00F0FF]" />
          <span>Install from .ZIP File or Local Folder</span>
        </div>
        <p class="text-xs text-[#A1A1AA] leading-relaxed">
          Provide the absolute path to a downloaded library archive (.zip) or unpacked folder. FlashCode executes <code class="text-[#00F0FF]">arduino-cli lib install --zip-path</code>.
        </p>

        <div class="flex items-center gap-2 pt-1">
          <input
            type="text"
            placeholder="/home/user/Downloads/custom-library.zip"
            value={props.manualZipPath}
            onInput={(e) => props.onManualZipPathChange(e.currentTarget.value)}
            class="flex-1 bg-[#1F1F23] border border-[#27272A] focus:border-[#00F0FF] focus:outline-none rounded-lg px-3 py-2 text-xs font-mono text-white placeholder-[#71717A]"
          />
          <button
            onClick={props.onManualInstallZip}
            disabled={props.isManualBusy || !props.manualZipPath.trim()}
            class="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#00F0FF] hover:bg-[#38F9D7] text-[#0F0F11] font-bold text-xs font-mono transition-all disabled:opacity-50 cursor-pointer shrink-0"
          >
            <Show when={props.isManualBusy} fallback={<Download size={13} class="stroke-[2.5]" />}>
              <Loader2 size={13} class="animate-spin" />
            </Show>
            <span>Install from .ZIP</span>
          </button>
        </div>
      </div>

      {/* Option C: Install directly from Git Repository */}
      <div class="p-5 rounded-xl bg-[#18181B] border border-[#27272A] space-y-3">
        <div class="flex items-center gap-2 text-white font-bold text-sm">
          <GitBranch size={16} class="text-[#00F0FF]" />
          <span>Install directly from Git Repository</span>
        </div>
        <p class="text-xs text-[#A1A1AA] leading-relaxed">
          Pull directly from any GitHub or GitLab repository URL. Optional branch or commit tag.
        </p>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
          <div class="md:col-span-2">
            <input
              type="text"
              placeholder="https://github.com/arduino-libraries/WiFi101.git"
              value={props.manualGitUrl}
              onInput={(e) => props.onManualGitUrlChange(e.currentTarget.value)}
              class="w-full bg-[#1F1F23] border border-[#27272A] focus:border-[#00F0FF] focus:outline-none rounded-lg px-3 py-2 text-xs font-mono text-white placeholder-[#71717A]"
            />
          </div>
          <div>
            <input
              type="text"
              placeholder="Branch / Tag (e.g. master, 0.16.0)"
              value={props.manualGitBranch}
              onInput={(e) => props.onManualGitBranchChange(e.currentTarget.value)}
              class="w-full bg-[#1F1F23] border border-[#27272A] focus:border-[#00F0FF] focus:outline-none rounded-lg px-3 py-2 text-xs font-mono text-white placeholder-[#71717A]"
            />
          </div>
        </div>

        <div class="flex justify-end pt-1">
          <button
            onClick={props.onManualInstallGit}
            disabled={props.isManualBusy || !props.manualGitUrl.trim()}
            class="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#00F0FF] hover:bg-[#38F9D7] text-[#0F0F11] font-bold text-xs font-mono transition-all disabled:opacity-50 cursor-pointer"
          >
            <Show when={props.isManualBusy} fallback={<GitBranch size={13} />}>
              <Loader2 size={13} class="animate-spin" />
            </Show>
            <span>Install from Git</span>
          </button>
        </div>
      </div>

      {/* Toolchain Output Console */}
      <Show when={props.manualLogOutput}>
        <div class="space-y-1.5">
          <div class="text-xs font-mono text-[#71717A] flex items-center justify-between">
            <span>CLI Toolchain Output</span>
            <button
              onClick={props.onClearLogOutput}
              class="hover:text-white transition-colors"
            >
              Clear
            </button>
          </div>
          <pre class="p-4 rounded-xl bg-[#0A0A0C] border border-[#27272A] font-mono text-xs text-[#38F9D7] whitespace-pre-wrap max-h-48 overflow-y-auto">
            {props.manualLogOutput}
          </pre>
        </div>
      </Show>
    </div>
  );
};
