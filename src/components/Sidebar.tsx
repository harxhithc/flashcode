import { Component } from "solid-js";
import { FileCode, BookOpen, Cpu, Library, Settings, Bot } from "lucide-solid";

export type ActiveTab = "files" | "examples" | "boards" | "libraries" | "ai" | "settings" | null;

interface SidebarProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  onOpenSettings?: () => void;
}

export const Sidebar: Component<SidebarProps> = (props) => {
  const navItems = [
    { id: "files" as const, label: "Sketches & Files", icon: FileCode },
    { id: "examples" as const, label: "Example Sketches", icon: BookOpen },
    { id: "boards" as const, label: "Boards Manager", icon: Cpu },
    { id: "libraries" as const, label: "Library Manager", icon: Library },
    { id: "ai" as const, label: "Flash Agent", icon: Bot },
  ];

  return (
    <aside class="w-14 bg-[#141416] border-r border-[#27272A] flex flex-col items-center py-3 justify-between select-none z-20">
      {/* Top Section */}
      <div class="flex flex-col items-center gap-3 w-full">
        {/* FlashCode Logo */}
        <div class="mb-2 flex items-center justify-center p-0.5 group cursor-pointer" title="FlashCode">
          <img
            src="/logo.png"
            alt="FlashCode"
            class="w-7 h-7 object-contain opacity-85 group-hover:opacity-100 transition-opacity"
          />
        </div>

        {/* Navigation Buttons */}
        <div class="flex flex-col gap-1 w-full px-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = () => props.activeTab === item.id;
            return (
              <button
                onClick={() => props.onTabChange(isActive() ? null : item.id)}
                title={item.label}
                class={`w-10 h-10 rounded-md flex items-center justify-center transition-all duration-150 ${
                  isActive()
                    ? "bg-[#27272A] text-[#00F0FF] shadow-sm"
                    : "text-[#A1A1AA] hover:text-[#F4F4F5] hover:bg-[#1E1E22]"
                }`}
              >
                <Icon size={19} />
              </button>
            );
          })}
        </div>
      </div>

      {/* Bottom Settings */}
      <div class="px-2 w-full">
        <button
          onClick={() => {
            if (props.onOpenSettings) {
              props.onOpenSettings();
            } else {
              props.onTabChange(props.activeTab === "settings" ? null : "settings");
            }
          }}
          title="Settings"
          class={`w-10 h-10 rounded-md flex items-center justify-center transition-all duration-150 ${
            props.activeTab === "settings"
              ? "bg-[#27272A] text-[#00F0FF]"
              : "text-[#A1A1AA] hover:text-[#F4F4F5] hover:bg-[#1E1E22]"
          }`}
        >
          <Settings size={19} />
        </button>
      </div>
    </aside>
  );
};
