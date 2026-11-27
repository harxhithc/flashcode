import { Component, Show, For } from "solid-js";
import { Eye, EyeOff, Plus, Trash2, ShieldCheck, ChevronDown } from "lucide-solid";
import { AIConfigResponse, TopModelItem } from "../../services/tauri";

export interface AIProvidersViewProps {
  config: AIConfigResponse | null;
  selectedPresetId: string;
  onSelectPresetId: (id: string) => void;
  autoFailover: boolean;
  onToggleAutoFailover: () => void;
  apiKeyInput: string;
  onApiKeyInput: (val: string) => void;
  onAddKey?: () => void;
  onRemoveKey?: (providerId: string, keyIndex: number) => void;
  baseUrlInput: string;
  onBaseUrlInput: (val: string) => void;
  selectedModelInput: string;
  onSelectedModelInput: (val: string) => void;
  showKey: boolean;
  onToggleShowKey: () => void;
  isTesting: boolean;
  testResult: { type: "success" | "error"; message: string } | null;
  isPullingModels: boolean;
  pullStatusNotice: string | null;
  currentTopModels: TopModelItem[];
  currentAllModels: string[];
  providerToDelete: string | null;
  onSetProviderToDelete: (id: string | null) => void;
  onConfirmDelete: (id: string) => void;
  onPullModels: (id: string) => void;
  onTestConnection: () => void;
  onSaveProvider: () => void;
  onSetActive: (id: string) => void;
  onBackToChat: () => void;
}

export const AIProvidersView: Component<AIProvidersViewProps> = (props) => {
  return (
    <div class="flex-1 p-3 overflow-y-auto space-y-3">
      {/* Header */}
      <div class="text-xs font-semibold text-white tracking-wide">
        Providers
      </div>

      {/* Auto-Failover Setting */}
      <div class="rounded-lg bg-[#18181B] border border-[#27272A] px-3 py-2 flex items-center justify-between">
        <div>
          <div class="text-xs font-medium text-white">Auto-Failover</div>
          <div class="text-[10px] text-[#71717A]">Switch provider automatically on rate limits</div>
        </div>
        <button
          type="button"
          onClick={props.onToggleAutoFailover}
          class={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
            props.autoFailover ? "bg-[#00F0FF]" : "bg-[#27272A]"
          }`}
          title={props.autoFailover ? "Auto-failover enabled" : "Auto-failover disabled"}
        >
          <span
            class={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-[#0A0A0C] shadow-lg ring-0 transition duration-200 ease-in-out ${
              props.autoFailover ? "translate-x-4" : "translate-x-0"
            }`}
          />
        </button>
      </div>

      {/* Provider Grid */}
      <div class="grid grid-cols-2 gap-2">
        <For each={props.config?.presetProviders || []}>
          {(preset) => {
            const isSelected = () => props.selectedPresetId === preset.id;
            const isSaved = () => Boolean(props.config?.providers[preset.id]);
            const isActive = () => props.config?.activeProviderId === preset.id;

            return (
              <button
                onClick={() => props.onSelectPresetId(preset.id)}
                class={`px-3 py-2 rounded-lg text-left border transition-all cursor-pointer flex flex-col justify-between min-h-[50px] ${
                  isSelected()
                    ? "bg-[#1F1F24] border-[#00F0FF]/80 text-white"
                    : "bg-[#18181B] border-[#27272A] text-[#D4D4D8] hover:border-[#3F3F46] hover:bg-[#1C1C20]"
                }`}
              >
                <div class="flex items-center justify-between w-full">
                  <span class="font-sans font-medium text-xs text-white truncate">
                    {preset.name}
                  </span>
                  <Show when={isActive()}>
                    <span class="w-1.5 h-1.5 rounded-full bg-[#10B981] shrink-0" title="Active" />
                  </Show>
                </div>
                <div class="text-[10px] text-[#71717A] mt-1">
                  {(() => {
                    const prov = props.config?.providers[preset.id];
                    const keyCount = prov?.keyCount || (prov?.hasKey ? 1 : 0);
                    const countLabel = keyCount > 1 ? ` (${keyCount} keys)` : "";
                    if (isActive()) return `Active${countLabel}`;
                    if (isSaved()) return `Configured${countLabel}`;
                    return preset.requiresKey ? "Key required" : "Local";
                  })()}
                </div>
              </button>
            );
          }}
        </For>
      </div>

      {/* Active Provider Config Form */}
      <Show
        when={props.config?.presetProviders.find((p) => p.id === props.selectedPresetId)}
      >
        {(preset) => {
          const isSaved = () => Boolean(props.config?.providers[preset().id]);
          const isActive = () => props.config?.activeProviderId === preset().id;

          return (
            <div class="rounded-lg bg-[#18181B] border border-[#27272A] p-3 space-y-3">
              <div class="flex items-center justify-between pb-2 border-b border-[#27272A]">
                <div class="flex items-center gap-2">
                  <span class="text-xs font-semibold text-white">{preset().name}</span>
                  <Show when={isActive()}>
                    <span class="text-[9px] px-1.5 py-0.5 rounded bg-[#10B981]/15 text-[#34D399] font-medium">
                      Active
                    </span>
                  </Show>
                </div>

                <Show when={isSaved()}>
                  <Show
                    when={props.providerToDelete === preset().id}
                    fallback={
                      <button
                        type="button"
                        onClick={() => props.onSetProviderToDelete(preset().id)}
                        class="text-[10px] text-[#71717A] hover:text-[#EF4444] transition-colors cursor-pointer"
                      >
                        Remove
                      </button>
                    }
                  >
                    <div class="flex items-center gap-1.5 animate-in fade-in duration-150">
                      <button
                        type="button"
                        onClick={() => {
                          props.onConfirmDelete(preset().id);
                          props.onSetProviderToDelete(null);
                        }}
                        class="px-2 py-0.5 rounded bg-[#EF4444] hover:bg-[#DC2626] text-white text-[10px] font-semibold transition-colors cursor-pointer"
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        onClick={() => props.onSetProviderToDelete(null)}
                        class="px-1.5 py-0.5 rounded bg-[#27272A] hover:bg-[#3F3F46] text-[#A1A1AA] text-[10px] transition-colors cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </Show>
                </Show>
              </div>

              {/* API Keys & Auto-Failover Pool */}
              <Show when={preset().requiresKey}>
                {(_) => {
                  const savedKeysList = () => {
                    const prov = props.config?.providers[preset().id];
                    if (!prov) return [];
                    if (Array.isArray(prov.maskedKeys) && prov.maskedKeys.length > 0) {
                      return prov.maskedKeys;
                    }
                    return prov.maskedKey ? [prov.maskedKey] : [];
                  };

                  return (
                    <div class="space-y-2">
                      <div class="flex items-center justify-between">
                        <div class="flex items-center gap-1.5">
                          <label class="text-[10px] text-[#A1A1AA] font-sans font-medium">
                            API Keys {savedKeysList().length > 0 ? `(${savedKeysList().length})` : ""}
                          </label>
                          <Show when={savedKeysList().length > 1}>
                            <span
                              class="text-[9px] px-1.5 py-0.2 rounded bg-[#10B981]/15 text-[#34D399] font-medium"
                              title="Auto-failover will rotate across all keys on rate limits (429)"
                            >
                              Failover Pool Active
                            </span>
                          </Show>
                        </div>
                        <Show when={preset().keyUrl}>
                          <a
                            href={preset().keyUrl}
                            target="_blank"
                            rel="noreferrer"
                            class="text-[10px] text-[#00F0FF] hover:underline"
                          >
                            Get Key ↗
                          </a>
                        </Show>
                      </div>

                      {/* Configured Keys Pool List */}
                      <Show when={savedKeysList().length > 0}>
                        <div class="space-y-1">
                          <For each={savedKeysList()}>
                            {(maskedKey, idx) => (
                              <div class="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-[#0F0F11] border border-[#27272A] text-xs">
                                <div class="flex items-center gap-2 min-w-0">
                                  <span class="text-[9px] px-1.5 py-0.5 rounded bg-[#1F1F24] border border-[#27272A] text-[#A1A1AA] font-mono shrink-0">
                                    {idx() === 0 ? "Key 1 (Primary)" : `Key ${idx() + 1}`}
                                  </span>
                                  <span class="font-mono text-[11px] text-[#E4E4E7] truncate">
                                    {maskedKey}
                                  </span>
                                </div>
                                <Show when={props.onRemoveKey}>
                                  <button
                                    type="button"
                                    onClick={() => props.onRemoveKey?.(preset().id, idx())}
                                    class="p-1 rounded hover:bg-[#27272A] text-[#71717A] hover:text-[#EF4444] transition-colors ml-1 shrink-0 cursor-pointer"
                                    title="Remove this key from pool"
                                  >
                                    <Trash2 size={11} />
                                  </button>
                                </Show>
                              </div>
                            )}
                          </For>
                        </div>
                      </Show>

                      {/* Input to Add / Update Key */}
                      <div class="flex items-center gap-1.5">
                        <div class="relative flex-1 flex items-center">
                          <input
                            type={props.showKey ? "text" : "password"}
                            value={props.apiKeyInput}
                            onInput={(e) => props.onApiKeyInput(e.currentTarget.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && props.apiKeyInput.trim() && props.onAddKey) {
                                e.preventDefault();
                                props.onAddKey();
                              }
                            }}
                            placeholder={
                              savedKeysList().length > 0
                                ? "Paste additional key for failover..."
                                : preset().keyPlaceholder || "Enter API key"
                            }
                            class="w-full bg-[#0F0F11] border border-[#27272A] focus:border-[#00F0FF] rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-[#52525B] outline-none font-mono pr-7"
                          />
                          <button
                            type="button"
                            onClick={props.onToggleShowKey}
                            class="absolute right-2 text-[#71717A] hover:text-white"
                          >
                            <Show when={props.showKey} fallback={<Eye size={12} />}>
                              <EyeOff size={12} />
                            </Show>
                          </button>
                        </div>

                        <Show when={props.apiKeyInput.trim() && props.onAddKey}>
                          <button
                            type="button"
                            onClick={props.onAddKey}
                            class="px-2.5 py-1.5 rounded-lg bg-[#00F0FF]/15 hover:bg-[#00F0FF]/25 text-[#00F0FF] border border-[#00F0FF]/30 text-xs font-semibold transition-colors shrink-0 flex items-center gap-1 cursor-pointer"
                            title="Add key to failover pool"
                          >
                            <Plus size={12} />
                            <span>Add Key</span>
                          </button>
                        </Show>
                      </div>

                      {/* Failover Pool Explanatory Hint */}
                      <Show when={savedKeysList().length > 1}>
                        <div
                          class="flex items-center gap-1.5 text-[10px] text-[#A1A1AA] bg-[#141417] px-2.5 py-1 rounded-md border border-[#27272A]/70"
                          title="Automatically rotates keys on rate limit (429) errors"
                        >
                          <ShieldCheck size={11} class="text-[#10B981] shrink-0" />
                          <span>Auto-failover active ({savedKeysList().length} keys)</span>
                        </div>
                      </Show>
                    </div>
                  );
                }}
              </Show>

              {/* Base URL (Advanced / Ollama) */}
              <div class="space-y-1">
                <label class="text-[10px] text-[#A1A1AA] font-sans">
                  Base URL
                </label>
                <input
                  type="text"
                  value={props.baseUrlInput}
                  onInput={(e) => props.onBaseUrlInput(e.currentTarget.value)}
                  placeholder={preset().defaultBaseUrl}
                  class="w-full bg-[#0F0F11] border border-[#27272A] focus:border-[#00F0FF] rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-[#52525B] outline-none font-mono text-[11px]"
                />
              </div>

              {/* Model Selection */}
              <div class="space-y-1.5 pt-1">
                <div class="flex items-center justify-between">
                  <label class="text-[10px] text-[#A1A1AA] font-sans font-medium">
                    Models
                  </label>
                  <button
                    type="button"
                    onClick={() => props.onPullModels(preset().id)}
                    disabled={props.isPullingModels}
                    class="text-[10px] text-[#00F0FF] hover:underline cursor-pointer disabled:opacity-50"
                  >
                    {props.isPullingModels ? "Fetching..." : "Fetch Models"}
                  </button>
                </div>

                <Show when={props.pullStatusNotice}>
                  <div class="text-[9px] text-[#34D399] font-sans bg-[#10B981]/10 border border-[#10B981]/20 px-2 py-1 rounded">
                    {props.pullStatusNotice}
                  </div>
                </Show>

                {/* Top Model Selection Cards */}
                <div class="grid grid-cols-1 gap-1.5">
                  <For each={props.currentTopModels}>
                    {(tm) => {
                      const isChosen = () =>
                        props.selectedModelInput.replace(/^models\//, "") ===
                        tm.id.replace(/^models\//, "");
                      return (
                        <button
                          type="button"
                          onClick={() => props.onSelectedModelInput(tm.id.replace(/^models\//, ""))}
                          class={`px-2.5 py-1.5 rounded-lg text-left border transition-all cursor-pointer flex items-center justify-between ${
                            isChosen()
                              ? "bg-[#00F0FF]/15 border-[#00F0FF] text-white"
                              : "bg-[#0F0F11] border-[#27272A] text-[#A1A1AA] hover:border-[#3F3F46] hover:text-white"
                          }`}
                        >
                          <span class="font-sans font-medium text-xs text-white">
                            {tm.name}
                          </span>
                          <span
                            class={`text-[8px] px-1.5 py-0.5 rounded font-semibold uppercase ${
                              tm.tag === "Recommended"
                                ? "bg-[#10B981]/20 text-[#34D399]"
                                : tm.tag === "Fastest"
                                ? "bg-[#00F0FF]/20 text-[#00F0FF]"
                                : "bg-[#8B5CF6]/20 text-[#A78BFA]"
                            }`}
                          >
                            {tm.tag}
                          </span>
                        </button>
                      );
                    }}
                  </For>
                </div>

                {/* Dropdown for All Available Models */}
                <div class="pt-1">
                  <label class="text-[10px] text-[#A1A1AA] font-sans block mb-1">
                    More Models ({props.currentAllModels.length})
                  </label>
                  <div class="relative flex items-center">
                    <select
                      value={props.selectedModelInput.replace(/^models\//, "")}
                      onChange={(e) => props.onSelectedModelInput(e.currentTarget.value.replace(/^models\//, ""))}
                      class="w-full bg-[#0F0F11] border border-[#27272A] hover:border-[#3F3F46] focus:border-[#00F0FF] rounded-lg px-2.5 py-1.5 pr-8 text-xs text-[#E4E4E7] outline-none font-mono cursor-pointer appearance-none transition-colors"
                    >
                      <Show when={
                        props.selectedModelInput &&
                        !props.currentAllModels.includes(props.selectedModelInput.replace(/^models\//, ""))
                      }>
                        <option
                          value={props.selectedModelInput.replace(/^models\//, "")}
                          class="bg-[#18181B] text-[#E4E4E7]"
                        >
                          {props.selectedModelInput.replace(/^models\//, "")}
                        </option>
                      </Show>
                      <For each={props.currentAllModels}>
                        {(model) => (
                          <option value={model} class="bg-[#18181B] text-[#E4E4E7]">
                            {model}
                          </option>
                        )}
                      </For>
                    </select>
                    <ChevronDown
                      size={14}
                      class="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#71717A] pointer-events-none"
                    />
                  </div>
                </div>
              </div>

              {/* Test Feedback Notice */}
              <Show when={props.testResult}>
                <div
                  class={`p-2 rounded-lg text-[10px] leading-tight ${
                    props.testResult!.type === "success"
                      ? "bg-[#10B981]/15 text-[#34D399] border border-[#10B981]/30"
                      : "bg-[#EF4444]/15 text-[#EF4444] border border-[#EF4444]/30"
                  }`}
                >
                  <span class="break-all">{props.testResult!.message}</span>
                </div>
              </Show>

              {/* Buttons: Test & Save */}
              <div class="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={props.onTestConnection}
                  disabled={props.isTesting}
                  class="px-3 py-1.5 rounded-lg bg-[#27272A] hover:bg-[#3F3F46] text-[#E4E4E7] text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {props.isTesting ? "Testing..." : "Test"}
                </button>

                <button
                  type="button"
                  onClick={props.onSaveProvider}
                  disabled={props.isTesting}
                  class="flex-1 py-1.5 rounded-lg bg-[#00F0FF] hover:bg-[#38F9D7] text-[#0F0F11] font-bold text-xs transition-colors shadow-sm shadow-[#00F0FF]/30 disabled:opacity-50 cursor-pointer"
                >
                  Connect & Save
                </button>

                <Show when={isSaved() && !isActive()}>
                  <button
                    type="button"
                    onClick={() => props.onSetActive(preset().id)}
                    class="px-3 py-1.5 rounded-lg bg-[#10B981]/20 hover:bg-[#10B981]/30 text-[#34D399] text-xs font-semibold transition-colors cursor-pointer"
                    title="Activate this provider"
                  >
                    Use
                  </button>
                </Show>
              </div>
            </div>
          );
        }}
      </Show>

      {/* Back Button */}
      <button
        type="button"
        onClick={props.onBackToChat}
        class="w-full py-1.5 rounded-lg bg-[#18181B] hover:bg-[#222226] text-[#A1A1AA] hover:text-white text-xs font-medium transition-colors cursor-pointer"
      >
        Back to Chat
      </button>
    </div>
  );
};
