import { Component, createSignal, createEffect, onMount, onCleanup, Show, For } from "solid-js";
import {
  Settings,
  X,
  ChevronDown,
  SquarePen,
  History,
} from "lucide-solid";
import {
  ErrorTranslationResponse,
  getAIConfig,
  saveAIProvider,
  testAIProvider,
  deleteAIProvider,
  setActiveAIProvider,
  chatWithFlash,
  AIConfigResponse,
  TopModelItem,
  pullAIModels,
  sanitizeCppCode,
  setAIAutoFailover,
  removeAIProviderKey,
} from "../services/tauri";

import {
  AgentAction,
  ChatMessage,
  ChatSession,
  STORAGE_KEY_SESSIONS,
  STORAGE_KEY_ACTIVE,
  INTRO_MESSAGE,
  loadInitialSessions,
  deriveSessionTitle,
} from "./ai/types";

import { AIProvidersView } from "./ai/AIProvidersView";
import { AIHistoryView } from "./ai/AIHistoryView";
import { AIChatMessageItem } from "./ai/AIChatMessageItem";
import { AIChatInput } from "./ai/AIChatInput";

// Re-export types for backward compatibility across the app
export type { AgentAction, ChatMessage, ChatSession };

export interface AICopilotDrawerProps {
  isOpen: boolean;
  width?: number;
  viewMode?: "chat" | "providers" | "history";
  onViewModeChange?: (mode: "chat" | "providers" | "history") => void;
  onWidthChange?: (width: number) => void;
  onResetWidth?: () => void;
  onClose: () => void;
  activeError: ErrorTranslationResponse | null;
  onApplyFix: (fixCode: string) => void;
  onInsertCode?: (code: string) => void;
  onApplyCode: (newCode: string, reason?: string) => void;
  onCompile: (overrideCode?: string) => Promise<{ success: boolean; elapsed_ms: number; stdout: string; stderr: string; error?: string }>;
  onUpload: (overrideCode?: string) => Promise<{ success: boolean; elapsed_ms: number; stdout: string; stderr: string; error?: string }>;
  currentCode?: string;
  selectedBoard?: any;
  selectedPort?: any;
  isCompiling?: boolean;
  isUploading?: boolean;
}

export const AICopilotDrawer: Component<AICopilotDrawerProps> = (props) => {
  // Navigation mode: "chat" | "providers" | "history"
  const [internalViewMode, setInternalViewMode] = createSignal<"chat" | "providers" | "history">(props.viewMode || "chat");
  createEffect(() => {
    if (props.viewMode) {
      setInternalViewMode(props.viewMode);
    }
  });
  const viewMode = () => internalViewMode();
  const setViewMode = (mode: "chat" | "providers" | "history") => {
    setInternalViewMode(mode);
    if (props.isOpen) {
      props.onViewModeChange?.(mode);
    }
  };

  // Sessions state
  const initialData = loadInitialSessions();
  const [sessions, setSessions] = createSignal<ChatSession[]>(initialData.sessions);
  const [currentSessionId, setCurrentSessionId] = createSignal<string>(initialData.activeId);
  const [historySearch, setHistorySearch] = createSignal<string>("");

  const activeSession = () => sessions().find((s) => s.id === currentSessionId()) || sessions()[0];
  const [chatMessages, setChatMessages] = createSignal<ChatMessage[]>(activeSession()?.messages || [INTRO_MESSAGE]);

  // Model switcher dropdown state
  const [showModelDropdown, setShowModelDropdown] = createSignal<boolean>(false);

  // Provider configuration state
  const [config, setConfig] = createSignal<AIConfigResponse | null>(null);
  const [selectedPresetId, setSelectedPresetId] = createSignal<string>("groq");
  const [apiKeyInput, setApiKeyInput] = createSignal<string>("");
  const [baseUrlInput, setBaseUrlInput] = createSignal<string>("");
  const [selectedModelInput, setSelectedModelInput] = createSignal<string>("");
  const [showKey, setShowKey] = createSignal<boolean>(false);

  // Testing & Status state
  const [isTesting, setIsTesting] = createSignal<boolean>(false);
  const [testResult, setTestResult] = createSignal<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Dynamic live model pulling state
  const [isPullingModels, setIsPullingModels] = createSignal<boolean>(false);
  const [pullStatusNotice, setPullStatusNotice] = createSignal<string | null>(null);
  const [pulledModelsData, setPulledModelsData] = createSignal<
    Record<string, { topModels: TopModelItem[]; allModels: string[] }>
  >({});

  // Smart Auto-Failover setting
  const [autoFailover, setAutoFailover] = createSignal<boolean>(true);

  // Inline delete confirmation state (no browser system dialogs)
  const [providerToDelete, setProviderToDelete] = createSignal<string | null>(null);

  // Chat conversation input & execution state
  const [inputMessage, setInputMessage] = createSignal<string>("");
  const [isThinking, setIsThinking] = createSignal<boolean>(false);
  const [copiedCodeId, setCopiedCodeId] = createSignal<string | null>(null);
  const [appliedCodeId, setAppliedCodeId] = createSignal<string | null>(null);

  let chatInputRef: HTMLTextAreaElement | undefined;
  let chatContainerRef: HTMLDivElement | undefined;
  let messagesEndRef: HTMLDivElement | undefined;
  const [userScrolledUp, setUserScrolledUp] = createSignal<boolean>(false);

  // Automatically synchronize active session messages to persistent storage
  createEffect(() => {
    const msgs = chatMessages();
    const currId = currentSessionId();
    setSessions((prev) => {
      const updated = prev.map((s) => {
        if (s.id === currId) {
          return {
            ...s,
            updatedAt: Date.now(),
            messages: msgs,
          };
        }
        return s;
      });
      try {
        localStorage.setItem(STORAGE_KEY_SESSIONS, JSON.stringify(updated));
        localStorage.setItem(STORAGE_KEY_ACTIVE, currId);
      } catch (e) {}
      return updated;
    });
  });

  // Session Management Handlers
  const handleCreateNewChat = () => {
    const newId = `sess_${Date.now()}`;
    const newSession: ChatSession = {
      id: newId,
      title: "New Chat",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [INTRO_MESSAGE],
    };
    setSessions((prev) => [newSession, ...prev]);
    setCurrentSessionId(newId);
    setChatMessages([INTRO_MESSAGE]);
    setViewMode("chat");
    setUserScrolledUp(false);
    setTimeout(() => {
      scrollToBottom("auto", true);
      chatInputRef?.focus();
    }, 50);
  };

  const handleSwitchSession = (sessionId: string) => {
    const target = sessions().find((s) => s.id === sessionId);
    if (!target) return;
    setCurrentSessionId(sessionId);
    setChatMessages(target.messages || [INTRO_MESSAGE]);
    setViewMode("chat");
    setUserScrolledUp(false);
    setTimeout(() => {
      scrollToBottom("auto", true);
      chatInputRef?.focus();
    }, 50);
  };

  const handleDeleteSession = (sessionId: string) => {
    setSessions((prev) => {
      const remaining = prev.filter((s) => s.id !== sessionId);
      if (remaining.length === 0) {
        const freshId = `sess_${Date.now()}`;
        const freshSession: ChatSession = {
          id: freshId,
          title: "New Chat",
          createdAt: Date.now(),
          updatedAt: Date.now(),
          messages: [INTRO_MESSAGE],
        };
        setCurrentSessionId(freshId);
        setChatMessages([INTRO_MESSAGE]);
        try {
          localStorage.setItem(STORAGE_KEY_SESSIONS, JSON.stringify([freshSession]));
          localStorage.setItem(STORAGE_KEY_ACTIVE, freshId);
        } catch (e) {}
        return [freshSession];
      }

      if (currentSessionId() === sessionId) {
        const nextActive = remaining[0];
        setCurrentSessionId(nextActive.id);
        setChatMessages(nextActive.messages || [INTRO_MESSAGE]);
      }
      try {
        localStorage.setItem(STORAGE_KEY_SESSIONS, JSON.stringify(remaining));
        localStorage.setItem(STORAGE_KEY_ACTIVE, currentSessionId());
      } catch (e) {}
      return remaining;
    });
  };

  const handleClearAllHistory = () => {
    const freshId = `sess_${Date.now()}`;
    const freshSession: ChatSession = {
      id: freshId,
      title: "New Chat",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [INTRO_MESSAGE],
    };
    setSessions([freshSession]);
    setCurrentSessionId(freshId);
    setChatMessages([INTRO_MESSAGE]);
    setViewMode("chat");
    try {
      localStorage.setItem(STORAGE_KEY_SESSIONS, JSON.stringify([freshSession]));
      localStorage.setItem(STORAGE_KEY_ACTIVE, freshId);
    } catch (e) {}
  };

  const filteredSessions = () => {
    const q = historySearch().trim().toLowerCase();
    if (!q) return sessions();
    return sessions().filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        (s.messages || []).some((m) => m.text.toLowerCase().includes(q))
    );
  };

  const isNearBottom = () => {
    if (!chatContainerRef) return true;
    const threshold = 80;
    return (
      chatContainerRef.scrollHeight -
        chatContainerRef.scrollTop -
        chatContainerRef.clientHeight <=
      threshold
    );
  };

  const handleChatScroll = () => {
    if (!chatContainerRef) return;
    setUserScrolledUp(!isNearBottom());
  };

  const scrollToBottom = (behavior: ScrollBehavior = "smooth", force = false) => {
    if (!chatContainerRef) return;
    if (force || !userScrolledUp() || isNearBottom()) {
      requestAnimationFrame(() => {
        if (messagesEndRef) {
          messagesEndRef.scrollIntoView({ behavior, block: "end" });
        } else if (chatContainerRef) {
          chatContainerRef.scrollTo({
            top: chatContainerRef.scrollHeight,
            behavior,
          });
        }
      });
    }
  };

  // Keep chat scrolled to bottom as messages and thinking indicators change
  createEffect(() => {
    chatMessages().length;
    isThinking();
    if (!userScrolledUp()) {
      setTimeout(() => scrollToBottom("smooth"), 40);
      setTimeout(() => scrollToBottom("smooth"), 120);
    }
  });

  // Panel resizing state
  const [isResizing, setIsResizing] = createSignal<boolean>(false);

  const handleStartResize = (e: MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    const startX = e.clientX;
    const startWidth = props.width || 320;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = startX - moveEvent.clientX;
      const maxAllowed = Math.floor(window.innerWidth * 0.45);
      const minAllowed = Math.min(260, maxAllowed);
      const newWidth = Math.round(Math.max(minAllowed, Math.min(maxAllowed, startWidth + delta)));
      props.onWidthChange?.(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      document.body.style.removeProperty("cursor");
      document.body.style.removeProperty("user-select");
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  onCleanup(() => {
    document.body.style.removeProperty("cursor");
    document.body.style.removeProperty("user-select");
  });

  // Load config on mount
  const refreshConfig = async () => {
    try {
      const cfg = await getAIConfig();
      setConfig(cfg);
      if (cfg.autoFailover !== undefined) {
        setAutoFailover(Boolean(cfg.autoFailover));
      }
      if (cfg.activeProviderId && cfg.providers[cfg.activeProviderId]) {
        const prov = cfg.providers[cfg.activeProviderId];
        setSelectedPresetId(prov.id);
        setSelectedModelInput(prov.selectedModel);
        setBaseUrlInput(prov.baseUrl || "");
      }
    } catch (e) {
      console.error("Failed to load AI config", e);
    }
  };

  const handleToggleAutoFailover = async () => {
    const nextVal = !autoFailover();
    setAutoFailover(nextVal);
    try {
      await setAIAutoFailover(nextVal);
    } catch (e) {
      console.error("Failed to save auto-failover setting", e);
    }
  };

  onMount(() => {
    refreshConfig();
  });

  // When selectedPreset changes, populate sensible defaults
  createEffect(() => {
    const presetId = selectedPresetId();
    const cfg = config();
    if (!cfg) return;

    const preset = cfg.presetProviders.find((p) => p.id === presetId);
    const existing = cfg.providers[presetId];

    if (existing) {
      const cleanModel = (existing.selectedModel || "").replace(/^models\//, "");
      setSelectedModelInput(cleanModel || preset?.defaultModel || "");
      setBaseUrlInput(existing.baseUrl || preset?.defaultBaseUrl || "");
      setApiKeyInput("");
    } else if (preset) {
      setSelectedModelInput(preset.defaultModel);
      setBaseUrlInput(preset.defaultBaseUrl);
      setApiKeyInput("");
    }
    setTestResult(null);
  });

  // Active provider helper
  const activeProvider = () => {
    const cfg = config();
    if (!cfg || !cfg.activeProviderId) return null;
    return cfg.providers[cfg.activeProviderId] || null;
  };

  // Prettify model name for display
  const activeModelDisplayName = () => {
    const act = activeProvider();
    if (!act) return "Setup AI Provider";
    const raw = (act.selectedModel || "").replace(/^models\//, "");
    if (raw === "openai/gpt-oss-20b") return `${act.name} • GPT-OSS 20B`;
    if (raw === "openai/gpt-oss-120b") return `${act.name} • GPT-OSS 120B`;
    if (raw === "qwen/qwen3.8-27b") return `${act.name} • Qwen 3.8 27B`;
    if (raw.includes("codestral-22b")) return `${act.name} • Codestral 22B`;
    if (raw.includes("nemotron-70b")) return `${act.name} • Nemotron 70B`;
    if (raw.includes("deepseek-coder")) return `${act.name} • DeepSeek Coder`;
    if (raw.includes("deepseek-v4")) return `${act.name} • DeepSeek V4.1`;
    if (raw.includes("codellama-70b")) return `${act.name} • CodeLlama 70B`;
    if (raw.includes("codegemma")) return `${act.name} • CodeGemma 7B`;
    if (raw.includes("gemini-3.8-flash")) return `${act.name} • 3.8 Flash`;
    if (raw.includes("gemini-3.7-flash")) return `${act.name} • 3.7 Flash`;
    if (raw.includes("gemini-3.1-pro")) return `${act.name} • 3.1 Pro`;
    if (raw.includes("gemini-3.1-flash-lite")) return `${act.name} • 3.1 Flash-Lite`;
    if (raw.includes("gemini-3.5-flash")) return `${act.name} • 3.5 Flash`;
    if (raw === "gemini-2.5-flash") return `${act.name} • 2.5 Flash`;
    if (raw === "gemini-2.0-flash") return `${act.name} • 2.0 Flash`;
    if (raw === "gemini-2.5-pro") return `${act.name} • 2.5 Pro`;
    if (raw === "o3-mini") return `${act.name} • o3-mini`;
    if (raw === "gpt-4o-mini") return `${act.name} • 4o-Mini`;
    if (raw === "gpt-4o") return `${act.name} • GPT-4o`;
    if (raw.includes("claude-3-7-sonnet")) return `${act.name} • Claude 3.7 Sonnet`;
    if (raw.includes("claude-3-5-sonnet")) return `${act.name} • Claude 3.5 Sonnet`;
    if (raw.includes("claude-3-5-haiku")) return `${act.name} • Claude 3.5 Haiku`;
    const shortName = raw.split("/").pop() || raw;
    return `${act.name} • ${shortName}`;
  };

  // Switch active provider
  const handleSetActive = async (id: string) => {
    try {
      await setActiveAIProvider(id);
      await refreshConfig();
      setShowModelDropdown(false);
      setViewMode("chat");
    } catch (e) {
      console.error(e);
    }
  };

  // Model selection & dynamic pulling helpers
  const currentTopModels = () => {
    const pId = selectedPresetId();
    const pulled = pulledModelsData()[pId];
    if (pulled && pulled.topModels && pulled.topModels.length > 0) {
      return pulled.topModels;
    }
    const preset = config()?.presetProviders.find((p) => p.id === pId);
    return preset?.topModels || [];
  };

  const currentAllModels = () => {
    const pId = selectedPresetId();
    const pulled = pulledModelsData()[pId];
    if (pulled && pulled.allModels && pulled.allModels.length > 0) {
      return pulled.allModels;
    }
    const preset = config()?.presetProviders.find((p) => p.id === pId);
    return preset?.models || [];
  };

  const currentActiveTopModels = () => {
    const act = activeProvider();
    if (!act) return [];
    const pulled = pulledModelsData()[act.id];
    if (pulled && pulled.topModels && pulled.topModels.length > 0) {
      return pulled.topModels;
    }
    const preset = config()?.presetProviders.find((p) => p.id === act.id);
    return preset?.topModels || [];
  };

  const handlePullModels = async (providerId: string) => {
    setIsPullingModels(true);
    setPullStatusNotice(null);
    try {
      const res = await pullAIModels({
        providerId,
        apiKey: apiKeyInput().trim() || undefined,
        baseUrl: baseUrlInput().trim() || undefined,
      });

      if (res.success) {
        setPulledModelsData((prev) => ({
          ...prev,
          [providerId]: {
            topModels: res.topModels,
            allModels: res.allModels,
          },
        }));

        if (
          !selectedModelInput() ||
          selectedModelInput() === "mixtral-8x7b-32768" ||
          !res.allModels.includes(selectedModelInput())
        ) {
          if (res.topModels.length > 0) {
            setSelectedModelInput(res.topModels[0].id);
          }
        }

        setPullStatusNotice(res.message || `Pulled ${res.pulledCount || res.allModels.length} models`);
        setTimeout(() => setPullStatusNotice(null), 4000);
      } else {
        setPullStatusNotice(res.error || "Failed to pull live models");
        setTimeout(() => setPullStatusNotice(null), 4000);
      }
    } catch (err: any) {
      setPullStatusNotice(err.message || "Failed to pull live models");
      setTimeout(() => setPullStatusNotice(null), 4000);
    } finally {
      setIsPullingModels(false);
    }
  };

  const handleQuickSwitchModel = async (modelId: string) => {
    const act = activeProvider();
    if (!act) return;
    try {
      await saveAIProvider({
        providerId: act.id,
        selectedModel: modelId,
        makeActive: true,
      });
      await refreshConfig();
      setShowModelDropdown(false);
    } catch (e) {
      console.error("Failed to switch model", e);
    }
  };

  // Test connection to selected provider
  const handleTestConnection = async () => {
    const presetId = selectedPresetId();
    setIsTesting(true);
    setTestResult(null);

    try {
      const res = await testAIProvider({
        providerId: presetId,
        apiKey: apiKeyInput().trim(),
        baseUrl: baseUrlInput().trim() || undefined,
        selectedModel: selectedModelInput().trim() || undefined,
      });

      if (res.success) {
        setTestResult({
          type: "success",
          message: res.message || `Connected successfully in ${res.latencyMs}ms!`,
        });
      } else {
        setTestResult({
          type: "error",
          message: res.error || "Connection test failed. Check key and endpoint.",
        });
      }
    } catch (err: any) {
      setTestResult({
        type: "error",
        message: err.message || "Failed to contact local AI backend daemon.",
      });
    } finally {
      setIsTesting(false);
    }
  };

  // Save provider and activate
  const handleSaveProvider = async () => {
    const presetId = selectedPresetId();
    setIsTesting(true);
    setTestResult(null);

    try {
      const res = await saveAIProvider({
        providerId: presetId,
        apiKey: apiKeyInput().trim() || undefined,
        baseUrl: baseUrlInput().trim() || undefined,
        selectedModel: selectedModelInput().trim() || undefined,
        makeActive: true,
      });

      if (res.success) {
        await refreshConfig();
        setTestResult({
          type: "success",
          message: "Provider connected and saved as active!",
        });
        setTimeout(() => {
          setViewMode("chat");
        }, 800);
      }
    } catch (err: any) {
      setTestResult({
        type: "error",
        message: err.message || "Failed to save provider config.",
      });
    } finally {
      setIsTesting(false);
    }
  };

  // Add a new API key to the active failover pool
  const handleAddKey = async () => {
    const key = apiKeyInput().trim();
    if (!key) return;
    const presetId = selectedPresetId();
    setIsTesting(true);
    setTestResult(null);

    try {
      const res = await saveAIProvider({
        providerId: presetId,
        addKey: key,
        makeActive: false,
      });

      if (res.success) {
        setApiKeyInput("");
        await refreshConfig();
        setTestResult({
          type: "success",
          message: "API key added to auto-failover pool!",
        });
        setTimeout(() => setTestResult(null), 3000);
      }
    } catch (err: any) {
      setTestResult({
        type: "error",
        message: err.message || "Failed to add API key to pool.",
      });
    } finally {
      setIsTesting(false);
    }
  };

  // Remove a key by index from the pool
  const handleRemoveKey = async (providerId: string, keyIndex: number) => {
    try {
      const res = await removeAIProviderKey(providerId, keyIndex);
      if (res.success) {
        await refreshConfig();
        setTestResult({
          type: "success",
          message: "API key removed from pool.",
        });
        setTimeout(() => setTestResult(null), 2500);
      }
    } catch (err: any) {
      console.error("Failed to remove key:", err);
    }
  };

  // Delete provider
  const handleConfirmDelete = async (id: string) => {
    try {
      await deleteAIProvider(id);
      await refreshConfig();
      setTestResult({
        type: "success",
        message: `Credentials for ${id} removed successfully.`,
      });
      setTimeout(() => setTestResult(null), 3000);
    } catch (e: any) {
      console.error(e);
      setTestResult({
        type: "error",
        message: e.message || "Failed to remove credentials",
      });
    }
  };

  // Chat message submit & Agent Action Engine
  const handleSendMessage = async (customPrompt?: string) => {
    const text = (customPrompt || inputMessage()).trim();
    if (!text || isThinking()) return;

    // Gather previous dialogue turns for multi-turn conversational context
    const previousTurns = chatMessages()
      .filter((m) => m.id !== "intro" && !m.isQuotaExceeded)
      .map((m) => {
        let content = m.text;
        if (m.role === "flash" && m.actions) {
          const editAct = m.actions.find((a) => a.type === "edit_code" && a.appliedCode);
          if (editAct?.appliedCode && !content.includes(editAct.appliedCode)) {
            content += `\n\n\`\`\`cpp\n${editAct.appliedCode}\n\`\`\``;
          }
        }
        return {
          role: m.role === "user" ? "user" : "assistant",
          content,
        };
      });

    // Auto-derive a clean session title from the user's first prompt
    const currSess = activeSession();
    if (currSess && (currSess.title === "New Chat" || currSess.messages.filter((m) => m.role === "user").length === 0)) {
      const derived = deriveSessionTitle(text);
      setSessions((prev) =>
        prev.map((s) => (s.id === currentSessionId() ? { ...s, title: derived } : s))
      );
    }

    const userMsg: ChatMessage = {
      id: String(Date.now()),
      role: "user",
      text,
      timestamp: Date.now(),
    };

    setChatMessages((prev) => [...prev, userMsg]);
    setInputMessage("");
    setIsThinking(true);
    setUserScrolledUp(false);
    scrollToBottom("smooth", true);
    setTimeout(() => scrollToBottom("smooth", true), 30);
    setTimeout(() => scrollToBottom("smooth", true), 100);

    try {
      const res = await chatWithFlash(
        text,
        props.currentCode || "",
        props.selectedBoard,
        props.selectedPort,
        previousTurns
      );

      const replyRaw = res.reply || "";
      const actions: AgentAction[] = [];

      // 1. Check for edit_code action with strict markdown fence stripping
      const editMatch = replyRaw.match(/<flash_action\s+type="edit_code">([\s\S]*?)<\/flash_action>/i);
      const previousCode = props.currentCode || "";
      let appliedCode = "";
      if (editMatch) {
        appliedCode = sanitizeCppCode(editMatch[1]);
        if (appliedCode) {
          props.onApplyCode(appliedCode, "AI Agent modified sketch.ino");
          actions.push({
            id: `act-edit-${Date.now()}`,
            type: "edit_code",
            status: "success",
            label: "Applied code modifications to sketch.ino",
            previousCode,
            appliedCode,
          });
        }
      } else {
        // Fallback: Check if response contains a complete C++ sketch block without action tags
        const codeBlockMatch = replyRaw.match(/```(?:cpp|c\+\+|c|arduino|ino)?\s*\n([\s\S]*?)\n```/i);
        if (codeBlockMatch) {
          const candidate = sanitizeCppCode(codeBlockMatch[1]);
          const isFullSketch = candidate.includes("setup()") || candidate.includes("loop()") || candidate.includes("#include");
          const userAskedCode = /\b(?:code|sketch|write|create|give me|blink|program|firmware|example)\b/i.test(text);
          if (candidate && (isFullSketch || userAskedCode)) {
            appliedCode = candidate;
            props.onApplyCode(appliedCode, "AI Agent generated sketch.ino");
            actions.push({
              id: `act-edit-${Date.now()}`,
              type: "edit_code",
              status: "success",
              label: "Applied generated sketch to editor",
              previousCode,
              appliedCode,
            });
          }
        }
      }

      // Detect actions either via agent action tags or user request
      const userAskedVerify = /\b(?:verify|compile|check code|build)\b/i.test(text) && !/\b(?:don't|do not)\s+(?:verify|compile)\b/i.test(text);
      const userAskedUpload = /\b(?:upload|flash|burn to board)\b/i.test(text) && !/\b(?:don't|do not)\s+(?:upload|flash)\b/i.test(text);

      // 2. Check for compile action
      const hasCompile = /<flash_action\s+type="(?:compile|verify)"\s*\/?>/i.test(replyRaw) || userAskedVerify;

      // 3. Check for flash action
      const hasFlash = /<flash_action\s+type="(?:flash|upload)"\s*\/?>/i.test(replyRaw) || userAskedUpload;

      // Clean raw action tags from visible reply text
      let cleanReply = replyRaw
        .replace(/<flash_action\s+type="edit_code">[\s\S]*?<\/flash_action>/gi, "")
        .replace(/<flash_action\s+type="[^"]*"\s*\/?>/gi, "")
        .trim();

      // STRICT: If code was applied to the editor, strip all code blocks and markdown headings from chat message
      if (appliedCode) {
        cleanReply = cleanReply
          .replace(/```[\s\S]*?```/gi, "")
          .replace(/^#{1,6}\s+.*$/gm, "")
          .trim();
      }

      // If provider was auto-switched on rate limit, refresh UI config
      if (res.autoSwitchedFrom) {
        await refreshConfig();
      }

      const flashMsgId = String(Date.now() + 1);
      const flashMsg: ChatMessage = {
        id: flashMsgId,
        role: "flash",
        text: cleanReply || (appliedCode ? "I have updated the sketch in your editor." : replyRaw),
        actions: actions.length > 0 ? actions : undefined,
        autoSwitchedFrom: res.autoSwitchedFrom,
        providerName: res.providerName,
        model: res.model,
        isQuotaExceeded: res.isQuotaExceeded,
      };

      setChatMessages((prev) => [...prev, flashMsg]);
      setTimeout(() => scrollToBottom("smooth", true), 40);
      setTimeout(() => scrollToBottom("smooth", true), 120);

      // Execute compile if requested by agent
      if (hasCompile) {
        const compileActionId = `act-comp-${Date.now()}`;
        setChatMessages((prev) =>
          prev.map((m) =>
            m.id === flashMsgId
              ? {
                  ...m,
                  actions: [
                    ...(m.actions || []),
                    {
                      id: compileActionId,
                      type: "compile",
                      status: "running",
                      label: "Verifying firmware with compiler...",
                    },
                  ],
                }
              : m
          )
        );

        const compResult = await props.onCompile(appliedCode || props.currentCode);
        setChatMessages((prev) =>
          prev.map((m) =>
            m.id === flashMsgId
              ? {
                  ...m,
                  actions: (m.actions || []).map((a) =>
                    a.id === compileActionId
                      ? {
                          ...a,
                          status: compResult.success ? "success" : "failed",
                          label: compResult.success
                            ? `Verification succeeded in ${compResult.elapsed_ms}ms`
                            : "Compiler verification failed",
                          elapsed_ms: compResult.elapsed_ms,
                          error: compResult.stderr || compResult.error,
                        }
                      : a
                  ),
                }
              : m
          )
        );
      }

      // Execute flash if requested by agent
      if (hasFlash) {
        const flashActionId = `act-flash-${Date.now()}`;
        setChatMessages((prev) =>
          prev.map((m) =>
            m.id === flashMsgId
              ? {
                  ...m,
                  actions: [
                    ...(m.actions || []),
                    {
                      id: flashActionId,
                      type: "flash",
                      status: "running",
                      label: "Uploading firmware to microcontroller...",
                    },
                  ],
                }
              : m
          )
        );

        const flashResult = await props.onUpload(appliedCode || props.currentCode);
        setChatMessages((prev) =>
          prev.map((m) =>
            m.id === flashMsgId
              ? {
                  ...m,
                  actions: (m.actions || []).map((a) =>
                    a.id === flashActionId
                      ? {
                          ...a,
                          status: flashResult.success ? "success" : "failed",
                          label: flashResult.success
                            ? `Uploaded to board in ${flashResult.elapsed_ms}ms`
                            : "Upload failed",
                          elapsed_ms: flashResult.elapsed_ms,
                          error: flashResult.stderr || flashResult.error,
                        }
                      : a
                  ),
                }
              : m
          )
        );
      }
    } catch (err: any) {
      setChatMessages((prev) => [
        ...prev,
        {
          id: String(Date.now() + 1),
          role: "flash",
          text: `Flash encountered an error: ${err.message || err}`,
        },
      ]);
      setTimeout(() => scrollToBottom("smooth", true), 40);
    } finally {
      setIsThinking(false);
    }
  };

  // Revert code from action card
  const handleRevertCode = (action: AgentAction) => {
    if (action.previousCode !== undefined) {
      props.onApplyCode(action.previousCode, "Reverted AI changes to previous version");
    }
  };

  // Panel DOM ref signal & reactive width resolver
  const [drawerRef, setDrawerRef] = createSignal<HTMLElement | null>(null);

  const getWidth = () => {
    const raw = typeof props.width === "function" ? (props.width as any)() : props.width;
    return typeof raw === "number" && !isNaN(raw) ? raw : 320;
  };

  createEffect(() => {
    const el = drawerRef();
    const w = getWidth();
    if (el) {
      el.style.width = `${w}px`;
      el.style.maxWidth = "45vw";
      el.style.minWidth = "260px";
    }
  });

  return (
    <Show when={props.isOpen}>
      <aside
        ref={(el) => {
          setDrawerRef(el);
          if (el) {
            el.style.width = `${getWidth()}px`;
            el.style.maxWidth = "45vw";
            el.style.minWidth = "260px";
          }
        }}
        class="bg-[#141416] border-l border-[#27272A] flex flex-col font-mono text-xs z-20 select-none h-full shadow-2xl relative shrink-0 transition-[width] duration-75 ease-out"
        classList={{
          "transition-none": isResizing(),
        }}
      >
        {/* Left Draggable Resizer Handle */}
        <div
          onMouseDown={handleStartResize}
          onDblClick={() => props.onResetWidth?.()}
          class="absolute -left-1.5 top-0 bottom-0 w-3 cursor-col-resize z-30 group flex items-center justify-center hover:bg-[#00F0FF]/10 transition-colors"
          title="Drag to resize Flash AI panel (Double-click to reset width)"
        >
          <div
            class={`w-[2px] h-full transition-colors ${
              isResizing()
                ? "bg-[#00F0FF] shadow-[0_0_8px_rgba(0,240,255,0.8)]"
                : "bg-transparent group-hover:bg-[#00F0FF]/70"
            }`}
          />
        </div>

        {/* Top Minimalist Header */}
        <div class="h-11 px-3 border-b border-[#27272A] flex items-center justify-between bg-[#111113] shrink-0">
          <div class="flex items-center gap-1.5 min-w-0 pr-2">
            <button
              type="button"
              onClick={() => setViewMode("chat")}
              class="text-xs font-sans font-semibold text-white tracking-wide hover:opacity-80 cursor-pointer shrink-0"
              title="Flash Agent"
            >
              Flash
            </button>

            <Show when={viewMode() === "history"}>
              <span class="text-[#52525B] text-xs">/</span>
              <span class="text-xs text-[#00F0FF] font-sans font-medium truncate">History</span>
            </Show>

            <Show when={viewMode() === "providers"}>
              <span class="text-[#52525B] text-xs">/</span>
              <span class="text-xs text-[#00F0FF] font-sans font-medium truncate">Settings</span>
            </Show>

            <Show when={viewMode() === "chat"}>
              <span class="text-[#52525B] text-xs">/</span>
              <button
                type="button"
                onClick={() => setViewMode("history")}
                class="text-xs text-[#A1A1AA] hover:text-white font-sans truncate max-w-[150px] text-left cursor-pointer transition-colors"
                title={`Current Chat: ${activeSession()?.title || "New Chat"} (Click to open History)`}
              >
                {activeSession()?.title || "New Chat"}
              </button>
            </Show>
          </div>

          <div class="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={handleCreateNewChat}
              class="p-1.5 rounded-md text-[#A1A1AA] hover:text-[#00F0FF] hover:bg-[#27272A] transition-colors cursor-pointer"
              title="New Chat"
            >
              <SquarePen size={14} />
            </button>

            <button
              type="button"
              onClick={() => setViewMode(viewMode() === "history" ? "chat" : "history")}
              class={`p-1.5 rounded-md transition-colors cursor-pointer relative ${
                viewMode() === "history"
                  ? "bg-[#00F0FF]/20 text-[#00F0FF]"
                  : "text-[#A1A1AA] hover:text-white hover:bg-[#27272A]"
              }`}
              title="Chat History"
            >
              <History size={14} />
              <Show when={sessions().length > 1}>
                <span class="absolute -top-0.5 -right-0.5 px-1 min-w-[14px] h-[14px] rounded-full bg-[#27272A] border border-[#3F3F46] text-[#00F0FF] text-[8px] font-sans font-bold flex items-center justify-center">
                  {sessions().length}
                </span>
              </Show>
            </button>

            <button
              type="button"
              onClick={() => setViewMode(viewMode() === "providers" ? "chat" : "providers")}
              class={`p-1.5 rounded-md transition-colors cursor-pointer ${
                viewMode() === "providers"
                  ? "bg-[#00F0FF]/20 text-[#00F0FF]"
                  : "text-[#71717A] hover:text-white hover:bg-[#27272A]"
              }`}
              title="AI Providers & Settings"
            >
              <Settings size={14} />
            </button>

            <button
              type="button"
              onClick={props.onClose}
              class="p-1.5 rounded-md text-[#71717A] hover:text-white hover:bg-[#27272A] transition-colors cursor-pointer"
              title="Close Panel"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* View 1: Providers Setup */}
        <Show when={viewMode() === "providers"}>
          <AIProvidersView
            config={config()}
            selectedPresetId={selectedPresetId()}
            onSelectPresetId={setSelectedPresetId}
            autoFailover={autoFailover()}
            onToggleAutoFailover={handleToggleAutoFailover}
            apiKeyInput={apiKeyInput()}
            onApiKeyInput={setApiKeyInput}
            onAddKey={handleAddKey}
            onRemoveKey={handleRemoveKey}
            baseUrlInput={baseUrlInput()}
            onBaseUrlInput={setBaseUrlInput}
            selectedModelInput={selectedModelInput()}
            onSelectedModelInput={setSelectedModelInput}
            showKey={showKey()}
            onToggleShowKey={() => setShowKey(!showKey())}
            isTesting={isTesting()}
            testResult={testResult()}
            isPullingModels={isPullingModels()}
            pullStatusNotice={pullStatusNotice()}
            currentTopModels={currentTopModels()}
            currentAllModels={currentAllModels()}
            providerToDelete={providerToDelete()}
            onSetProviderToDelete={setProviderToDelete}
            onConfirmDelete={handleConfirmDelete}
            onPullModels={handlePullModels}
            onTestConnection={handleTestConnection}
            onSaveProvider={handleSaveProvider}
            onSetActive={handleSetActive}
            onBackToChat={() => setViewMode("chat")}
          />
        </Show>

        {/* View 2: Chat History */}
        <Show when={viewMode() === "history"}>
          <AIHistoryView
            sessions={sessions()}
            filteredSessions={filteredSessions()}
            currentSessionId={currentSessionId()}
            historySearch={historySearch()}
            onSearchChange={setHistorySearch}
            onSelectSession={handleSwitchSession}
            onDeleteSession={handleDeleteSession}
            onCreateNewChat={handleCreateNewChat}
            onClearAllHistory={handleClearAllHistory}
            onBackToChat={() => setViewMode("chat")}
          />
        </Show>

        {/* View 3: Chat View */}
        <Show when={viewMode() === "chat"}>
          <div class="flex-1 flex flex-col overflow-hidden relative">
            <div
              ref={chatContainerRef}
              onScroll={handleChatScroll}
              class="flex-1 p-3 overflow-y-auto space-y-3.5 scroll-smooth"
            >
              {/* Compiler Diagnostic Card if Error is active */}
              <Show when={props.activeError}>
                <div class="rounded-xl bg-[#18181B] border border-[#EF4444]/40 p-3 space-y-2.5 shadow-lg shadow-[#EF4444]/10">
                  <div class="flex items-center justify-between text-[#EF4444] font-semibold">
                    <span class="text-xs">Compiler Issue Detected</span>
                    <Show when={props.activeError?.line_number}>
                      <span class="text-[10px] px-1.5 py-0.5 rounded bg-[#EF4444]/20 text-[#EF4444]">
                        Line {props.activeError!.line_number}
                      </span>
                    </Show>
                  </div>

                  <div class="text-[#E4E4E7] text-[11px] leading-relaxed">
                    {props.activeError?.explanation}
                  </div>

                  <div class="space-y-1">
                    <div class="text-[9px] text-[#A1A1AA] uppercase font-bold tracking-wider">
                      Suggested Fix:
                    </div>
                    <div class="bg-[#0A0A0C] border border-[#27272A] p-2 rounded text-[#38F9D7] font-mono text-[11px] overflow-x-auto whitespace-pre-wrap">
                      {props.activeError?.suggested_fix}
                    </div>
                  </div>

                  <div class="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => props.onApplyFix(props.activeError!.suggested_fix)}
                      class="flex-1 py-1.5 rounded-lg bg-[#00F0FF] hover:bg-[#38F9D7] text-[#0F0F11] font-bold text-xs transition-colors shadow-sm shadow-[#00F0FF]/30 cursor-pointer"
                    >
                      Apply Fix to Code
                    </button>
                  </div>
                </div>
              </Show>

              {/* Chat Messages */}
              <For each={chatMessages()}>
                {(msg) => (
                  <AIChatMessageItem
                    msg={msg}
                    onOpenProviders={() => setViewMode("providers")}
                    onApplyCode={props.onApplyCode}
                    onCompile={props.onCompile}
                    onRevertCode={handleRevertCode}
                    onAutoFixError={(err) => handleSendMessage(err)}
                    copiedCodeId={copiedCodeId()}
                    onSetCopiedCodeId={setCopiedCodeId}
                    appliedCodeId={appliedCodeId()}
                    onSetAppliedCodeId={setAppliedCodeId}
                  />
                )}
              </For>

              {/* Thinking Indicator */}
              <Show when={isThinking()}>
                <div class="flex items-center gap-2 text-[10px] text-[#00F0FF] p-2.5 rounded-xl bg-[#18181B] border border-[#27272A] w-fit">
                  <span class="w-1.5 h-1.5 rounded-full bg-[#00F0FF] animate-ping" />
                  <span>Flash is reasoning and executing actions...</span>
                </div>
              </Show>

              <div ref={messagesEndRef} class="h-px w-full" />
            </div>

            {/* Scroll-to-bottom floating button */}
            <Show when={userScrolledUp()}>
              <button
                type="button"
                onClick={() => {
                  setUserScrolledUp(false);
                  scrollToBottom("smooth", true);
                }}
                class="absolute bottom-24 right-5 z-20 p-2 rounded-full bg-[#18181B]/95 hover:bg-[#27272A] border border-[#27272A] hover:border-[#00F0FF]/60 text-[#00F0FF] shadow-xl backdrop-blur transition-all cursor-pointer select-none"
                title="Scroll to bottom"
              >
                <ChevronDown size={14} />
              </button>
            </Show>

            {/* Modern Floating Chat Input Box */}
            <AIChatInput
              inputMessage={inputMessage()}
              onInputMessageChange={setInputMessage}
              onSendMessage={() => handleSendMessage()}
              isThinking={isThinking()}
              activeProvider={activeProvider()}
              activeModelDisplayName={activeModelDisplayName()}
              showModelDropdown={showModelDropdown()}
              onToggleModelDropdown={setShowModelDropdown}
              currentActiveTopModels={currentActiveTopModels()}
              savedProviders={Object.values(config()?.providers || {})}
              activeProviderId={config()?.activeProviderId || null}
              onQuickSwitchModel={handleQuickSwitchModel}
              onSetActiveProvider={handleSetActive}
              onOpenProviders={() => setViewMode("providers")}
              setInputRef={(el) => (chatInputRef = el)}
            />
          </div>
        </Show>
      </aside>
    </Show>
  );
};
