import { Component, Show, For } from "solid-js";
import { Send, ChevronDown, Check } from "lucide-solid";
import { TopModelItem } from "../../services/tauri";

export interface AIChatInputProps {
  inputMessage: string;
  onInputMessageChange: (val: string) => void;
  onSendMessage: () => void;
  isThinking: boolean;
  activeProvider: any;
  activeModelDisplayName: string;
  showModelDropdown: boolean;
  onToggleModelDropdown: (show: boolean) => void;
  currentActiveTopModels: TopModelItem[];
  savedProviders: any[];
  activeProviderId: string | null;
  onQuickSwitchModel: (modelId: string) => void;
  onSetActiveProvider: (provId: string) => void;
  onOpenProviders: () => void;
  setInputRef?: (el: HTMLTextAreaElement) => void;
}

export const AIChatInput: Component<AIChatInputProps> = (props) => {
  return (
    <div class="p-3 bg-[#111113]">
      <div class="rounded-xl bg-[#18181B] p-2.5 transition-all flex flex-col gap-2">
        <textarea
          ref={props.setInputRef}
          value={props.inputMessage}
          onInput={(e) => props.onInputMessageChange(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              props.onSendMessage();
            }
          }}
          rows={2}
          placeholder={
            props.activeProvider
              ? "Ask Flash to edit code, verify sketch, or upload..."
              : "Connect an AI provider to start..."
          }
          class="w-full bg-transparent text-xs text-white placeholder-[#52525B] outline-none resize-none font-mono leading-relaxed"
        />
        <div class="flex items-center justify-between pt-1 relative">
          {/* Model indicator button with upward dropdown */}
          <div class="relative">
            <button
              type="button"
              onClick={() => props.onToggleModelDropdown(!props.showModelDropdown)}
              class="flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] text-[#A1A1AA] hover:text-white hover:bg-[#27272A] transition-colors cursor-pointer select-none"
              title="Switch AI model or provider"
            >
              <span
                class={`w-1.5 h-1.5 rounded-full ${
                  props.activeProvider ? "bg-[#10B981]" : "bg-[#FF6B00]"
                }`}
              />
              <span class="font-sans font-medium max-w-[160px] truncate">
                {props.activeModelDisplayName}
              </span>
              <ChevronDown size={10} class="text-[#71717A] shrink-0" />
            </button>

            {/* Dropdown Menu (Opens upwards above the input box) */}
            <Show when={props.showModelDropdown}>
              <div
                class="fixed inset-0 z-30"
                onClick={() => props.onToggleModelDropdown(false)}
              />
              <div class="absolute left-0 bottom-full mb-1.5 w-64 bg-[#18181B] border border-[#2F2F36] rounded-xl shadow-2xl p-1.5 z-40 space-y-1 animate-in fade-in zoom-in-95 duration-100 max-h-80 overflow-y-auto">
                {/* Section 1: Models for active provider */}
                <Show when={props.activeProvider && props.currentActiveTopModels.length > 0}>
                  <div class="px-2 py-1 text-[9px] font-sans font-bold uppercase tracking-wider text-[#71717A]">
                    {props.activeProvider!.name} Models
                  </div>
                  <For each={props.currentActiveTopModels}>
                    {(tm) => {
                      const isCurrent = () => props.activeProvider?.selectedModel === tm.id;
                      return (
                        <button
                          type="button"
                          onClick={() => props.onQuickSwitchModel(tm.id)}
                          class={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left text-xs transition-colors cursor-pointer ${
                            isCurrent()
                              ? "bg-[#00F0FF]/15 text-[#00F0FF] font-medium"
                              : "text-[#D4D4D8] hover:bg-[#27272A] hover:text-white"
                          }`}
                        >
                          <div>
                            <div class="font-sans font-medium text-[11px]">{tm.name}</div>
                            <div class="text-[9px] text-[#71717A]">{tm.desc}</div>
                          </div>
                          <Show when={isCurrent()}>
                            <Check size={12} class="text-[#00F0FF] shrink-0" />
                          </Show>
                        </button>
                      );
                    }}
                  </For>
                  <div class="my-1 border-t border-[#27272A]" />
                </Show>

                {/* Section 2: Switch Provider */}
                <div class="px-2 py-1 text-[9px] font-sans font-bold uppercase tracking-wider text-[#71717A]">
                  Saved Providers
                </div>
                <For each={props.savedProviders}>
                  {(prov) => {
                    const isCurrent = () => props.activeProviderId === prov.id;
                    return (
                      <button
                        type="button"
                        onClick={() => props.onSetActiveProvider(prov.id)}
                        class={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left text-xs transition-colors cursor-pointer ${
                          isCurrent()
                            ? "bg-[#10B981]/15 text-[#34D399] font-medium"
                            : "text-[#D4D4D8] hover:bg-[#27272A] hover:text-white"
                        }`}
                      >
                        <div class="flex items-center gap-2">
                          <span
                            class={`w-1.5 h-1.5 rounded-full ${
                              isCurrent() ? "bg-[#10B981]" : "bg-[#71717A]"
                            }`}
                          />
                          <span class="font-sans text-[11px]">{prov.name}</span>
                        </div>
                        <Show when={isCurrent()}>
                          <span class="text-[9px] text-[#10B981] font-semibold">Active</span>
                        </Show>
                      </button>
                    );
                  }}
                </For>

                <div class="my-1 border-t border-[#27272A]" />

                {/* Section 3: Configure Providers */}
                <button
                  type="button"
                  onClick={() => {
                    props.onToggleModelDropdown(false);
                    props.onOpenProviders();
                  }}
                  class="w-full px-2.5 py-1.5 rounded-lg text-left text-xs text-[#A1A1AA] hover:bg-[#27272A] hover:text-white transition-colors cursor-pointer font-sans"
                >
                  Configure Providers...
                </button>
              </div>
            </Show>
          </div>

          {/* Send button */}
          <button
            type="button"
            onClick={props.onSendMessage}
            disabled={!props.inputMessage.trim() || props.isThinking}
            class="p-1.5 rounded-lg bg-[#00F0FF] hover:bg-[#38F9D7] text-[#0A0A0C] font-bold transition-all disabled:opacity-20 disabled:hover:bg-[#00F0FF] cursor-pointer"
            title="Send (Enter)"
          >
            <Send size={12} />
          </button>
        </div>
      </div>
    </div>
  );
};
