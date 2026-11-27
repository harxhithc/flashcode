import { Component, Show, For } from "solid-js";
import { Clock, MessageSquare, Search, Trash2, X } from "lucide-solid";
import { ChatSession, formatRelativeTime } from "./types";

export interface AIHistoryViewProps {
  sessions: ChatSession[];
  filteredSessions: ChatSession[];
  currentSessionId: string;
  historySearch: string;
  onSearchChange: (query: string) => void;
  onSelectSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  onCreateNewChat: () => void;
  onClearAllHistory: () => void;
  onBackToChat: () => void;
}

export const AIHistoryView: Component<AIHistoryViewProps> = (props) => {
  return (
    <div class="flex-1 flex flex-col overflow-hidden bg-[#141416]">
      {/* Top Toolbar: Search & New Chat Action */}
      <div class="p-3 border-b border-[#27272A] space-y-2.5 bg-[#111113]">
        <div class="flex items-center justify-between">
          <div class="text-xs font-sans font-semibold text-white">
            Chat Sessions <span class="text-[10px] text-[#71717A] font-normal">({props.sessions.length})</span>
          </div>
          <button
            type="button"
            onClick={props.onCreateNewChat}
            class="px-2.5 py-1 rounded-lg bg-[#00F0FF]/15 hover:bg-[#00F0FF]/25 border border-[#00F0FF]/30 text-[#00F0FF] text-[11px] font-sans font-semibold transition-colors cursor-pointer"
          >
            New Chat
          </button>
        </div>

        {/* Search filter input */}
        <div class="relative flex items-center">
          <Search size={12} class="absolute left-2.5 text-[#71717A]" />
          <input
            type="text"
            value={props.historySearch}
            onInput={(e) => props.onSearchChange(e.currentTarget.value)}
            placeholder="Search past conversations..."
            class="w-full bg-[#18181B] border border-[#27272A] focus:border-[#00F0FF] rounded-lg pl-8 pr-7 py-1.5 text-xs text-white placeholder-[#52525B] outline-none font-mono"
          />
          <Show when={props.historySearch}>
            <button
              type="button"
              onClick={() => props.onSearchChange("")}
              class="absolute right-2 text-[#71717A] hover:text-white"
            >
              <X size={12} />
            </button>
          </Show>
        </div>
      </div>

      {/* Sessions List */}
      <div class="flex-1 p-3 overflow-y-auto space-y-2">
        <Show
          when={props.filteredSessions.length > 0}
          fallback={
            <div class="h-48 flex flex-col items-center justify-center text-center p-4 text-[#71717A]">
              <MessageSquare size={24} class="mb-2 text-[#3F3F46]" />
              <p class="text-xs font-sans">No matching chat sessions</p>
              <Show when={props.historySearch}>
                <button
                  type="button"
                  onClick={() => props.onSearchChange("")}
                  class="mt-2 text-[11px] text-[#00F0FF] hover:underline"
                >
                  Clear search filter
                </button>
              </Show>
            </div>
          }
        >
          <For each={props.filteredSessions}>
            {(session) => {
              const isActive = () => session.id === props.currentSessionId;
              const messageCount = () => (session.messages || []).filter((m) => m.id !== "intro").length;

              return (
                <div
                  class={`group rounded-xl border transition-all p-2.5 relative flex flex-col justify-between cursor-pointer ${
                    isActive()
                      ? "bg-[#18181B] border-[#00F0FF]/50 shadow-sm shadow-[#00F0FF]/10"
                      : "bg-[#161619] border-[#27272A] hover:border-[#3F3F46] hover:bg-[#1C1C20]"
                  }`}
                  onClick={() => {
                    props.onSelectSession(session.id);
                  }}
                >
                  <div class="flex items-start justify-between gap-2">
                    <div class="min-w-0 flex-1">
                      <div class="flex items-center gap-1.5 mb-1">
                        <span
                          class={`w-1.5 h-1.5 rounded-full shrink-0 ${
                            isActive() ? "bg-[#00F0FF] shadow-[0_0_6px_#00F0FF]" : "bg-[#52525B]"
                          }`}
                        />
                        <h4
                          class={`text-xs font-sans font-medium truncate ${
                            isActive() ? "text-white font-semibold" : "text-[#D4D4D8] group-hover:text-white"
                          }`}
                        >
                          {session.title}
                        </h4>
                      </div>

                      <div class="flex items-center gap-2 text-[10px] text-[#71717A] font-sans pl-3">
                        <span class="flex items-center gap-1">
                          <Clock size={10} />
                          <span>{formatRelativeTime(session.updatedAt || session.createdAt)}</span>
                        </span>
                        <span>•</span>
                        <span>{messageCount()} {messageCount() === 1 ? "msg" : "msgs"}</span>
                      </div>
                    </div>

                    {/* Direct Delete Session Action (Single Click) */}
                    <div class="shrink-0 flex items-center" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          props.onDeleteSession(session.id);
                        }}
                        class="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-[#71717A] hover:text-[#EF4444] hover:bg-[#EF4444]/10 transition-all cursor-pointer"
                        title="Delete conversation"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            }}
          </For>
        </Show>
      </div>

      {/* Bottom Actions: Back to Chat & Clear All History */}
      <div class="p-3 border-t border-[#27272A] bg-[#111113] flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={props.onBackToChat}
          class="px-3 py-1.5 rounded-lg bg-[#18181B] hover:bg-[#222226] text-[#A1A1AA] hover:text-white text-[11px] font-sans transition-colors cursor-pointer"
        >
          Back to Chat
        </button>

        <Show when={props.sessions.length > 1}>
          <button
            type="button"
            onClick={props.onClearAllHistory}
            class="px-2.5 py-1.5 rounded-lg text-[#71717A] hover:text-[#EF4444] hover:bg-[#EF4444]/10 text-[10.5px] font-sans transition-colors cursor-pointer"
            title="Clear all chat history"
          >
            Clear All
          </button>
        </Show>
      </div>
    </div>
  );
};
