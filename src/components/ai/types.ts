export interface AgentAction {
  id: string;
  type: "edit_code" | "compile" | "flash";
  status: "idle" | "running" | "success" | "failed";
  label: string;
  previousCode?: string;
  appliedCode?: string;
  elapsed_ms?: number;
  error?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "flash";
  text: string;
  actions?: AgentAction[];
  autoSwitchedFrom?: string;
  providerName?: string;
  model?: string;
  isQuotaExceeded?: boolean;
  timestamp?: number;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
}

export const STORAGE_KEY_SESSIONS = "flashcode_ai_chat_sessions_v1";
export const STORAGE_KEY_ACTIVE = "flashcode_ai_active_session_id_v1";

export const INTRO_MESSAGE: ChatMessage = {
  id: "intro",
  role: "flash",
  text: "Hi, I'm **Flash**! I'm your embedded systems AI Agent.\n\nI can write firmware, modify your opened sketch directly in the editor, and trigger fast compiles or USB uploads on command.",
  timestamp: Date.now(),
};

export function loadInitialSessions(): { sessions: ChatSession[]; activeId: string } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SESSIONS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const savedActive = localStorage.getItem(STORAGE_KEY_ACTIVE);
        const activeExists = parsed.some((s) => s.id === savedActive);
        const activeId = activeExists ? (savedActive as string) : parsed[0].id;
        return { sessions: parsed, activeId };
      }
    }
  } catch (e) {}

  const defaultId = `sess_${Date.now()}`;
  const defaultSession: ChatSession = {
    id: defaultId,
    title: "New Chat",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages: [INTRO_MESSAGE],
  };
  return { sessions: [defaultSession], activeId: defaultId };
}

export function deriveSessionTitle(prompt: string): string {
  const clean = prompt
    .replace(/^[\s#*`_~>-]+/, "")
    .replace(/\n.*/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return "Chat Session";
  const capped = clean.length > 34 ? clean.slice(0, 34).trim() + "..." : clean;
  return capped.charAt(0).toUpperCase() + capped.slice(1);
}

export function formatRelativeTime(timestamp: number): string {
  if (!timestamp) return "Recently";
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
