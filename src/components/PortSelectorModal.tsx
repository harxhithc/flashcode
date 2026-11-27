import { Component, For, Show, createSignal, createEffect, onCleanup } from "solid-js";
import { Usb, X, Check, RefreshCw, ChevronDown, Lock } from "lucide-solid";
import {
  SerialPortInfo,
  PortLockStatus,
  getPortLockStatuses,
  focusWindow,
  transferPortLock,
  getCurrentWindowLabel,
} from "../services/tauri";

interface PortSelectorModalProps {
  isOpen: boolean;
  ports: SerialPortInfo[];
  selectedPort: SerialPortInfo | null;
  uploadSpeed?: string | number;
  onSelectSpeed?: (speed: string | number) => void;
  onSelect: (port: SerialPortInfo) => void;
  onRefresh: () => void;
  onClose: () => void;
}

export const PortSelectorModal: Component<PortSelectorModalProps> = (props) => {
  const [isRefreshing, setIsRefreshing] = createSignal(false);
  const [lockedPorts, setLockedPorts] = createSignal<PortLockStatus[]>([]);
  const currentWin = getCurrentWindowLabel();

  const fetchLocks = async () => {
    try {
      const locks = await getPortLockStatuses();
      setLockedPorts(locks);
    } catch (_) {}
  };

  createEffect(() => {
    if (props.isOpen) {
      fetchLocks();
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") props.onClose();
      };
      window.addEventListener("keydown", handleKeyDown);
      onCleanup(() => window.removeEventListener("keydown", handleKeyDown));
    }
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([props.onRefresh(), fetchLocks()]);
    } finally {
      setTimeout(() => setIsRefreshing(false), 300);
    }
  };

  return (
    <Show when={props.isOpen}>
      <div
        class="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4"
        onClick={(e) => {
          if (e.target === e.currentTarget) props.onClose();
        }}
      >
        <div class="w-full max-w-md bg-[#18181B] border border-[#27272A] rounded-xl shadow-2xl overflow-hidden font-mono text-sm">
          {/* Header */}
          <div class="h-12 px-4 border-b border-[#27272A] flex items-center justify-between">
            <div class="flex items-center gap-2 text-[#E4E4E7] font-semibold">
              <Usb size={16} class="text-[#10B981]" />
              <span>Select Serial Port</span>
            </div>
            <div class="flex items-center gap-2">
              <button
                onClick={handleRefresh}
                class="p-1 rounded text-[#71717A] hover:text-white hover:bg-[#27272A] transition-colors"
                title="Rescan USB ports"
              >
                <RefreshCw size={15} class={isRefreshing() ? "animate-spin text-[#00F0FF]" : ""} />
              </button>
              <button
                onClick={props.onClose}
                class="p-1 rounded text-[#71717A] hover:text-white hover:bg-[#27272A]"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* List */}
          <div class="p-3 max-h-80 overflow-y-auto space-y-1.5">
            <Show
              when={props.ports.length > 0}
              fallback={
                <div class="text-center py-6 text-xs text-[#71717A]">
                  No microcontroller USB serial devices detected.
                  <br />
                  Plug in your board and click refresh.
                </div>
              }
            >
              <For each={props.ports}>
                {(port) => {
                  const isSelected = () => props.selectedPort?.port_name === port.port_name;
                  const lockInfo = () =>
                    lockedPorts().find(
                      (l) =>
                        l.port_name === port.port_name &&
                        ((l.owner_window && l.owner_window !== currentWin) || l.is_external_process)
                    );
                  const isLockedByOther = () => !!lockInfo();

                  return (
                    <button
                      onClick={() => {
                        if (isLockedByOther()) {
                          if (!lockInfo()!.is_external_process && lockInfo()!.owner_window) {
                            focusWindow(lockInfo()!.owner_window!);
                            props.onClose();
                            return;
                          }
                          // External OS process: Take over
                          transferPortLock(port.port_name, currentWin)
                            .then(() => {
                              props.onSelect(port);
                              props.onClose();
                            })
                            .catch(() => {});
                          return;
                        }
                        props.onSelect(port);
                        props.onClose();
                      }}
                      class={`w-full text-left p-3 rounded-lg border transition-all flex items-center justify-between ${
                        isLockedByOther()
                          ? "bg-[#18181B] border-[#F59E0B]/30 text-[#D4D4D8] hover:border-[#F59E0B] hover:bg-[#F59E0B]/5 cursor-pointer"
                          : isSelected()
                          ? "bg-[#10B981]/10 border-[#10B981]/40 text-white"
                          : "bg-[#141416] border-[#27272A] text-[#A1A1AA] hover:bg-[#1E1E22] hover:text-[#E4E4E7]"
                      }`}
                      title={
                        isLockedByOther()
                          ? lockInfo()!.is_external_process
                            ? `In use by external FlashCode instance (PID ${lockInfo()!.owner_pid || "ext"}). Click or use Take Over.`
                            : `In use by Window '${lockInfo()!.owner_window}'. Click to switch to that window.`
                          : `Select port ${port.port_name}`
                      }
                    >
                      <div>
                        <div class="font-medium text-white flex items-center gap-2">
                          <span
                            class={`w-2 h-2 rounded-full ${
                              isLockedByOther()
                                ? "bg-[#F59E0B] shadow-[0_0_8px_#F59E0B]"
                                : isSelected()
                                ? "bg-[#10B981] shadow-[0_0_8px_#10B981]"
                                : "bg-[#10B981]"
                            }`}
                          />
                          <span>{port.port_name}</span>
                          <Show when={isLockedByOther()}>
                            <span class="ml-2 px-1.5 py-0.5 rounded text-[10px] font-sans font-medium bg-[#F59E0B]/20 text-[#F59E0B] border border-[#F59E0B]/40 flex items-center gap-1">
                              <Lock size={10} />
                              <span>
                                In Use (
                                {lockInfo()!.is_external_process
                                  ? `PID ${lockInfo()!.owner_pid || "ext"}`
                                  : lockInfo()!.owner_window}
                                )
                              </span>
                            </span>
                          </Show>
                        </div>
                        <div class="text-xs text-[#71717A] mt-0.5">
                          {isLockedByOther()
                            ? lockInfo()!.is_external_process
                              ? `${port.description} — In use by another FlashCode instance (PID ${lockInfo()!.owner_pid || "ext"}). Click to take over.`
                              : `${port.description} — Click to switch to active window`
                            : port.description}
                        </div>
                      </div>
                      <Show
                        when={isLockedByOther()}
                        fallback={
                          <Show when={isSelected()}>
                            <Check size={16} class="text-[#10B981]" />
                          </Show>
                        }
                      >
                        <button
                          type="button"
                          onClick={async (e) => {
                            e.stopPropagation();
                            await transferPortLock(port.port_name, currentWin);
                            props.onSelect(port);
                            props.onClose();
                          }}
                          class="px-2 py-1 rounded text-xs font-sans font-medium bg-[#F59E0B]/20 hover:bg-[#F59E0B]/30 text-[#F59E0B] border border-[#F59E0B]/50 hover:border-[#F59E0B] transition-colors shadow-xs active:scale-95 shrink-0"
                          title={`Transfer ${port.port_name} to this window`}
                        >
                          Take Over
                        </button>
                      </Show>
                    </button>
                  );
                }}
              </For>
            </Show>
          </div>
          {/* Baud Rate Option */}
          <div class="px-4 py-2.5 bg-[#141416] border-t border-[#27272A] flex items-center justify-between text-xs">
            <span class="text-[#A1A1AA]">Upload Baud Rate:</span>
            <div class="relative flex items-center">
              <select
                value={String(props.uploadSpeed || "auto")}
                onChange={(e) => props.onSelectSpeed?.(e.currentTarget.value)}
                class="bg-[#1F1F23] border border-[#27272A] hover:border-[#3F3F46] text-[#E4E4E7] rounded-lg px-2.5 py-1 pr-6 text-xs focus:outline-hidden focus:border-[#00F0FF] cursor-pointer appearance-none transition-colors"
              >
                <option value="auto" class="bg-[#18181B] text-[#E4E4E7]">Auto (921600 ESP32 / Auto-Fallback)</option>
                <option value="921600" class="bg-[#18181B] text-[#E4E4E7]">921600 (Ultra-Fast)</option>
                <option value="460800" class="bg-[#18181B] text-[#E4E4E7]">460800 (Fast)</option>
                <option value="115200" class="bg-[#18181B] text-[#E4E4E7]">115200 (Safe Standard)</option>
                <option value="57600" class="bg-[#18181B] text-[#E4E4E7]">57600 (Low Speed)</option>
              </select>
              <ChevronDown
                size={12}
                class="absolute right-1.5 top-1/2 -translate-y-1/2 text-[#71717A] pointer-events-none"
              />
            </div>
          </div>
        </div>
      </div>
    </Show>
  );
};
