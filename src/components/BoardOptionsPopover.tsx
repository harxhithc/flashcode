import { Component, For, Show, createSignal, onMount, onCleanup, createMemo } from "solid-js";
import { SlidersHorizontal, RotateCcw, Check, Copy, ChevronDown, X } from "lucide-solid";
import { BoardConfigOption, constructFullFqbn } from "../services/tauri";

export interface BoardOptionsPopoverProps {
  baseFqbn: string;
  boardName: string;
  options: BoardConfigOption[];
  selectedOptions: Record<string, string>;
  onOptionsChange: (newOptions: Record<string, string>) => void;
  onResetDefaults?: () => void;
  isLoading?: boolean;
}

export const BoardOptionsPopover: Component<BoardOptionsPopoverProps> = (props) => {
  const [isOpen, setIsOpen] = createSignal(false);
  const [copied, setCopied] = createSignal(false);
  let containerRef: HTMLDivElement | undefined;

  // Compute full FQBN with current options
  const fullFqbn = createMemo(() => {
    return constructFullFqbn(props.baseFqbn, props.selectedOptions);
  });

  // Count how many options differ from platform defaults
  const modifiedCount = createMemo(() => {
    let count = 0;
    for (const opt of props.options) {
      const currentVal = props.selectedOptions[opt.option] || opt.defaultValue;
      if (currentVal && opt.defaultValue && currentVal !== opt.defaultValue) {
        count++;
      }
    }
    return count;
  });

  const handleSelectChange = (optionKey: string, newValue: string) => {
    const updated = { ...props.selectedOptions, [optionKey]: newValue };
    props.onOptionsChange(updated);
  };

  const handleReset = () => {
    const defaults: Record<string, string> = {};
    for (const opt of props.options) {
      if (opt.defaultValue) {
        defaults[opt.option] = opt.defaultValue;
      }
    }
    props.onOptionsChange(defaults);
    props.onResetDefaults?.();
  };

  const handleCopyFqbn = async () => {
    try {
      await navigator.clipboard.writeText(fullFqbn());
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  };

  // Click outside and Escape key handling
  onMount(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef && !containerRef.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen()) {
        setIsOpen(false);
      }
    };

    window.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleKeyDown);

    onCleanup(() => {
      window.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleKeyDown);
    });
  });

  return (
    <Show when={props.options.length > 0}>
      <div class="relative inline-block" ref={containerRef}>
        {/* Trigger Button (standardized topbar dimensions h-7 px-2.5) */}
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen())}
          class={`h-7 flex items-center gap-1.5 px-2.5 rounded text-xs transition-colors font-medium border cursor-pointer ${
            isOpen()
              ? "bg-[#222226] text-[#00F0FF] border-[#00F0FF]/40 shadow-sm"
              : modifiedCount() > 0
              ? "bg-[#18181B] hover:bg-[#222226] text-[#E4E4E7] border-[#00F0FF]/30 hover:border-[#00F0FF]/60"
              : "bg-[#18181B] hover:bg-[#222226] text-[#D4D4D8] border-[#27272A] hover:border-[#3F3F46]"
          }`}
          title={`Configure options for ${props.boardName} (${props.options.length} options available)`}
        >
          <SlidersHorizontal size={13} class={modifiedCount() > 0 || isOpen() ? "text-[#00F0FF]" : "text-[#71717A]"} />
          <span class="text-xs">Config</span>
          <Show when={modifiedCount() > 0}>
            <span
              class="w-1.5 h-1.5 rounded-full bg-[#00F0FF] shrink-0"
              title={`${modifiedCount()} non-default setting(s) active`}
            />
          </Show>
          <ChevronDown size={11} class={`text-[#71717A] transition-transform ${isOpen() ? "rotate-180" : ""}`} />
        </button>

        {/* Dropdown Popover */}
        <Show when={isOpen()}>
          <div class="absolute left-0 top-full mt-1.5 z-50 w-88 bg-[#141416] border border-[#27272A] rounded-lg shadow-2xl overflow-hidden font-sans text-xs animate-in fade-in zoom-in-95 duration-100">
            {/* Popover Header */}
            <div class="px-3 py-2.5 border-b border-[#27272A] bg-[#18181B] flex items-center justify-between">
              <div class="flex items-center gap-1.5 min-w-0">
                <SlidersHorizontal size={13} class="text-[#00F0FF] shrink-0" />
                <div class="min-w-0">
                  <h4 class="font-semibold text-[#E4E4E7] text-xs leading-none">Board Options</h4>
                  <p class="text-[10px] text-[#71717A] truncate font-mono mt-0.5" title={props.boardName}>
                    {props.boardName}
                  </p>
                </div>
              </div>

              <div class="flex items-center gap-1 shrink-0 ml-2">
                <Show when={modifiedCount() > 0}>
                  <button
                    type="button"
                    onClick={handleReset}
                    class="h-6 flex items-center gap-1 px-1.5 rounded text-[11px] text-[#A1A1AA] hover:text-[#00F0FF] hover:bg-[#27272A] transition-colors cursor-pointer"
                    title="Reset all options to board defaults"
                  >
                    <RotateCcw size={11} />
                    <span>Reset</span>
                  </button>
                </Show>

                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  class="p-1 rounded text-[#71717A] hover:text-white hover:bg-[#27272A] transition-colors cursor-pointer"
                  title="Close options"
                >
                  <X size={13} />
                </button>
              </div>
            </div>

            {/* Options List */}
            <div class="max-h-76 overflow-y-auto p-3 space-y-2.5 divide-y divide-[#27272A]/40">
              <For each={props.options}>
                {(opt, idx) => {
                  const currentValue = () => props.selectedOptions[opt.option] || opt.defaultValue || (opt.values[0]?.value ?? "");
                  const isModified = () => {
                    const cur = currentValue();
                    return opt.defaultValue ? cur !== opt.defaultValue : false;
                  };

                  return (
                    <div class={`${idx() > 0 ? "pt-2.5" : ""} space-y-1`}>
                      <div class="flex items-center justify-between">
                        <label
                          for={`board-opt-${opt.option}`}
                          class="text-[11px] font-medium text-[#D4D4D8] flex items-center gap-1"
                        >
                          <span>{opt.optionLabel}</span>
                          <Show when={isModified()}>
                            <span class="text-[9px] px-1 py-0.2 rounded bg-[#00F0FF]/10 text-[#00F0FF] font-mono border border-[#00F0FF]/25">
                              custom
                            </span>
                          </Show>
                        </label>
                      </div>

                      <div class="relative flex items-center">
                        <select
                          id={`board-opt-${opt.option}`}
                          value={currentValue()}
                          onChange={(e) => handleSelectChange(opt.option, e.currentTarget.value)}
                          class={`w-full bg-[#0F0F11] border rounded px-2.5 py-1 pr-6 text-xs text-[#E4E4E7] outline-none transition-colors cursor-pointer font-sans appearance-none ${
                            isModified()
                              ? "border-[#00F0FF]/40 focus:border-[#00F0FF]"
                              : "border-[#27272A] hover:border-[#3F3F46] focus:border-[#00F0FF]"
                          }`}
                        >
                          <For each={opt.values}>
                            {(val) => (
                              <option
                                value={val.value}
                                class="bg-[#141416] text-[#E4E4E7] py-1"
                              >
                                {val.valueLabel}
                              </option>
                            )}
                          </For>
                        </select>
                        <ChevronDown
                          size={12}
                          class="absolute right-2 top-1/2 -translate-y-1/2 text-[#71717A] pointer-events-none"
                        />
                      </div>
                    </div>
                  );
                }}
              </For>
            </div>

            {/* Popover Footer (effective FQBN preview with copy button) */}
            <div class="px-3 py-2 border-t border-[#27272A] bg-[#101012] flex items-center justify-between gap-2">
              <div class="min-w-0 flex-1">
                <div class="text-[10px] text-[#71717A] truncate font-mono" title={fullFqbn()}>
                  <span class="text-[#52525B]">FQBN: </span>
                  <span class="text-[#A1A1AA]">{fullFqbn()}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleCopyFqbn}
                class="shrink-0 p-1 rounded hover:bg-[#27272A] text-[#71717A] hover:text-[#00F0FF] transition-colors cursor-pointer flex items-center gap-1 text-[10px]"
                title="Copy full FQBN with options"
              >
                <Show when={copied()} fallback={<Copy size={11} />}>
                  <Check size={11} class="text-[#10B981]" />
                </Show>
              </button>
            </div>
          </div>
        </Show>
      </div>
    </Show>
  );
};
