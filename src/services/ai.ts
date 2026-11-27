import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "./utils";
import { PRESET_PROVIDERS } from "./aiPresets";

export interface ErrorTranslationResponse {
  explanation: string;
  suggested_fix: string;
  line_number?: number;
}

export interface TopModelItem {
  id: string;
  name: string;
  tag: string;
  desc: string;
}

export interface AIProviderPreset {
  id: string;
  name: string;
  tagline: string;
  description: string;
  keyUrl: string;
  keyPlaceholder: string;
  defaultBaseUrl: string;
  defaultModel: string;
  topModels: TopModelItem[];
  models: string[];
  requiresKey: boolean;
  protocol: "openai" | "anthropic";
}

export interface PullModelsResult {
  success: boolean;
  providerId: string;
  topModels: TopModelItem[];
  allModels: string[];
  pulledCount?: number;
  message?: string;
  error?: string;
  source?: "live" | "preset";
}

export interface SavedAIProvider {
  id: string;
  name: string;
  maskedKey: string;
  maskedKeys?: string[];
  keyCount?: number;
  hasKey: boolean;
  baseUrl: string;
  selectedModel: string;
  enabled: boolean;
  requiresKey: boolean;
}

export interface AIConfigResponse {
  activeProviderId: string | null;
  providers: Record<string, SavedAIProvider>;
  presetProviders: AIProviderPreset[];
  autoFailover?: boolean;
}

export interface TestProviderResult {
  success: boolean;
  latencyMs?: number;
  message?: string;
  error?: string;
}

const STORAGE_KEY = "flashcode_ai_config_v1";

interface LocalStoredConfig {
  activeProviderId: string | null;
  autoFailover: boolean;
  providers: Record<
    string,
    {
      id: string;
      name: string;
      apiKeys: string[];
      baseUrl: string;
      selectedModel: string;
      enabled: boolean;
      requiresKey: boolean;
    }
  >;
}

function maskKey(key: string): string {
  if (!key) return "";
  if (key.length <= 8) return "••••••••";
  return key.substring(0, 4) + "••••••••" + key.substring(key.length - 4);
}

function getStoredConfig(): LocalStoredConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        return {
          activeProviderId: parsed.activeProviderId || null,
          autoFailover: parsed.autoFailover !== false,
          providers: parsed.providers || {},
        };
      }
    }
  } catch (e) {
    console.warn("Failed to read stored AI config:", e);
  }

  return {
    activeProviderId: null,
    autoFailover: true,
    providers: {},
  };
}

function saveStoredConfig(cfg: LocalStoredConfig) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  } catch (e) {
    console.warn("Failed to save AI config to localStorage:", e);
  }
}

function buildConfigResponse(stored: LocalStoredConfig): AIConfigResponse {
  const publicProviders: Record<string, SavedAIProvider> = {};

  for (const [id, p] of Object.entries(stored.providers)) {
    const keys = p.apiKeys || [];
    const firstKey = keys[0] || "";
    publicProviders[id] = {
      id: p.id,
      name: p.name,
      maskedKey: maskKey(firstKey),
      maskedKeys: keys.map(maskKey),
      keyCount: keys.length,
      hasKey: keys.length > 0 || !p.requiresKey,
      baseUrl: p.baseUrl,
      selectedModel: p.selectedModel,
      enabled: p.enabled,
      requiresKey: p.requiresKey,
    };
  }

  return {
    activeProviderId: stored.activeProviderId,
    providers: publicProviders,
    presetProviders: PRESET_PROVIDERS,
    autoFailover: stored.autoFailover,
  };
}

export async function aiTranslateError(
  errorTrace: string,
  codeSnippet: string,
  board: string
): Promise<ErrorTranslationResponse> {
  if (isTauri()) {
    try {
      const res = await invoke<ErrorTranslationResponse>("ai_translate_error", {
        req: { error_trace: errorTrace, code_snippet: codeSnippet, board },
      });
      if (res && res.explanation) return res;
    } catch (_) {}
  }

  try {
    const res = await fetch("/api/ai/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error_trace: errorTrace,
        code_snippet: codeSnippet,
        board,
      }),
    });
    if (res.ok) return await res.json();
  } catch (_) {}

  return {
    explanation: "Compiler encountered an issue while compiling firmware.",
    suggested_fix: "// Check line numbers and declarations",
  };
}

export async function aiAutocomplete(
  prompt: string,
  prefix: string,
  suffix: string
): Promise<string> {
  if (isTauri()) {
    try {
      const res = await invoke<{ completion: string }>("ai_autocomplete", {
        req: { prompt, prefix, suffix, language: "cpp" },
      });
      if (res && res.completion) return res.completion;
    } catch (_) {}
  }

  try {
    const res = await fetch("/api/ai/autocomplete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, prefix, suffix, language: "cpp" }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.completion) return data.completion;
    }
  } catch (_) {}

  const trimmed = prefix.trimEnd();
  if (trimmed.endsWith("Serial.")) {
    return 'println("FlashCode Online");';
  } else if (trimmed.endsWith("pinMode(")) {
    return "2, OUTPUT);";
  } else if (trimmed.endsWith("digitalWrite(")) {
    return "2, HIGH);";
  }
  return "";
}

export async function getAIConfig(): Promise<AIConfigResponse> {
  try {
    const res = await fetch("/api/ai/config");
    if (res.ok) {
      const data = await res.json();
      if (data && data.presetProviders && data.presetProviders.length > 0) {
        return data;
      }
    }
  } catch (_) {}

  const stored = getStoredConfig();
  return buildConfigResponse(stored);
}

export async function pullAIModels(data: {
  providerId: string;
  apiKey?: string;
  baseUrl?: string;
}): Promise<PullModelsResult> {
  try {
    const res = await fetch("/api/ai/models/pull", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) return await res.json();
  } catch (_) {}

  const preset = PRESET_PROVIDERS.find((p) => p.id === data.providerId);
  return {
    success: true,
    providerId: data.providerId,
    topModels: preset?.topModels || [],
    allModels: preset?.models || [],
    pulledCount: preset?.models.length || 0,
    source: "preset",
  };
}

export async function testAIProvider(data: {
  providerId: string;
  apiKey?: string;
  baseUrl?: string;
  selectedModel?: string;
}): Promise<TestProviderResult> {
  try {
    const res = await fetch("/api/ai/provider/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) return await res.json();
  } catch (_) {}

  // Direct client-side test
  const preset = PRESET_PROVIDERS.find((p) => p.id === data.providerId);
  const baseUrl = data.baseUrl || preset?.defaultBaseUrl || "http://localhost:11434/v1";
  const start = performance.now();

  try {
    let key = data.apiKey;
    if (!key) {
      const stored = getStoredConfig();
      const p = stored.providers[data.providerId];
      if (p && p.apiKeys && p.apiKeys.length > 0) {
        key = p.apiKeys[0];
      }
    }

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (key) {
      headers["Authorization"] = `Bearer ${key}`;
    }

    const testUrl = baseUrl.endsWith("/v1") || baseUrl.includes("/v1/")
      ? `${baseUrl.replace(/\/+$/, "")}/models`
      : `${baseUrl.replace(/\/+$/, "")}/v1/models`;

    const res = await fetch(testUrl, {
      method: "GET",
      headers,
    });

    const latencyMs = Math.round(performance.now() - start);

    if (res.ok) {
      return {
        success: true,
        latencyMs,
        message: `Connected successfully (${latencyMs}ms)`,
      };
    } else {
      const text = await res.text();
      return {
        success: false,
        latencyMs,
        error: `HTTP ${res.status}: ${text.substring(0, 150)}`,
      };
    }
  } catch (err: any) {
    return {
      success: false,
      error: `Connection failed: ${err.message || String(err)}`,
    };
  }
}

export async function saveAIProvider(data: {
  providerId: string;
  apiKey?: string;
  apiKeys?: string[];
  addKey?: string;
  removeKeyIndex?: number;
  baseUrl?: string;
  selectedModel?: string;
  makeActive?: boolean;
}): Promise<{ success: boolean; activeProviderId: string; config: AIConfigResponse }> {
  try {
    const res = await fetch("/api/ai/provider/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) return await res.json();
  } catch (_) {}

  // Client-side local storage fallback
  const stored = getStoredConfig();
  const preset = PRESET_PROVIDERS.find((p) => p.id === data.providerId);
  const current = stored.providers[data.providerId] || {
    id: data.providerId,
    name: preset?.name || data.providerId,
    apiKeys: [],
    baseUrl: data.baseUrl || preset?.defaultBaseUrl || "",
    selectedModel: data.selectedModel || preset?.defaultModel || "",
    enabled: true,
    requiresKey: preset?.requiresKey ?? true,
  };

  if (data.baseUrl) current.baseUrl = data.baseUrl;
  if (data.selectedModel) current.selectedModel = data.selectedModel;

  if (data.addKey && data.addKey.trim()) {
    const k = data.addKey.trim();
    if (!current.apiKeys.includes(k)) {
      current.apiKeys.push(k);
    }
  }

  if (data.apiKey && data.apiKey.trim()) {
    const k = data.apiKey.trim();
    if (!current.apiKeys.includes(k)) {
      current.apiKeys = [k, ...current.apiKeys];
    }
  }

  if (data.removeKeyIndex !== undefined && data.removeKeyIndex >= 0) {
    current.apiKeys.splice(data.removeKeyIndex, 1);
  }

  stored.providers[data.providerId] = current;

  if (data.makeActive || !stored.activeProviderId) {
    stored.activeProviderId = data.providerId;
  }

  saveStoredConfig(stored);
  const config = buildConfigResponse(stored);

  return {
    success: true,
    activeProviderId: stored.activeProviderId || data.providerId,
    config,
  };
}

export async function addAIProviderKey(
  providerId: string,
  addKey: string
): Promise<{ success: boolean; config: AIConfigResponse }> {
  return await saveAIProvider({
    providerId,
    addKey,
    makeActive: false,
  });
}

export async function removeAIProviderKey(
  providerId: string,
  removeKeyIndex: number
): Promise<{ success: boolean; config: AIConfigResponse }> {
  return await saveAIProvider({
    providerId,
    removeKeyIndex,
    makeActive: false,
  });
}

export async function setActiveAIProvider(
  providerId: string
): Promise<{ success: boolean; activeProviderId: string }> {
  try {
    const res = await fetch("/api/ai/provider/set-active", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ providerId }),
    });
    if (res.ok) return await res.json();
  } catch (_) {}

  const stored = getStoredConfig();
  stored.activeProviderId = providerId;
  saveStoredConfig(stored);
  return { success: true, activeProviderId: providerId };
}

export async function deleteAIProvider(
  providerId: string
): Promise<{ success: boolean; config: AIConfigResponse }> {
  try {
    const res = await fetch("/api/ai/provider/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ providerId }),
    });
    if (res.ok) return await res.json();
  } catch (_) {}

  const stored = getStoredConfig();
  delete stored.providers[providerId];
  if (stored.activeProviderId === providerId) {
    const remaining = Object.keys(stored.providers);
    stored.activeProviderId = remaining.length > 0 ? remaining[0] : null;
  }
  saveStoredConfig(stored);
  return { success: true, config: buildConfigResponse(stored) };
}

export async function setAIAutoFailover(
  enabled: boolean
): Promise<{ success: boolean; autoFailover: boolean }> {
  try {
    const res = await fetch("/api/ai/settings/autofailover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    if (res.ok) return await res.json();
  } catch (_) {}

  const stored = getStoredConfig();
  stored.autoFailover = enabled;
  saveStoredConfig(stored);
  return { success: true, autoFailover: enabled };
}

export async function chatWithFlash(
  message: string,
  code: string,
  board?: any,
  port?: any,
  history?: { role: string; content: string }[]
): Promise<{
  reply: string;
  providerName?: string;
  model?: string;
  requiresProvider?: boolean;
  error?: string;
  autoSwitchedFrom?: string;
  isQuotaExceeded?: boolean;
  minimal?: boolean;
}> {
  try {
    const res = await fetch("/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, code, board, port, history }),
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (_) {}

  // Direct client-side AI chat via configured providers
  const stored = getStoredConfig();
  let activeId = stored.activeProviderId;
  if (!activeId) {
    const configured = Object.keys(stored.providers);
    if (configured.length > 0) {
      activeId = configured[0];
    }
  }

  if (!activeId || !stored.providers[activeId]) {
    return {
      reply: "No active AI provider configured yet. Please open Flash Settings (gear icon in top right) to configure Groq (free), Google Gemini, OpenAI, Claude, or Local Ollama with your API key.",
      requiresProvider: true,
      error: "No active AI provider configured",
    };
  }

  const prov = stored.providers[activeId];
  const preset = PRESET_PROVIDERS.find((p) => p.id === activeId);
  const baseUrl = prov.baseUrl || preset?.defaultBaseUrl || "https://api.groq.com/openai/v1";
  const model = prov.selectedModel || preset?.defaultModel || "qwen/qwen3.8-27b";
  const apiKey = prov.apiKeys && prov.apiKeys.length > 0 ? prov.apiKeys[0] : "";

  if (prov.requiresKey && !apiKey) {
    return {
      reply: `Please add an API key for ${prov.name} in Settings (gear icon) to use Flash Agent.`,
      requiresProvider: true,
      error: `Missing API key for ${prov.name}`,
    };
  }

  const systemPrompt = `You are Flash, the ultra-fast intelligent embedded systems AI assistant for FlashCode IDE.
You specialize in Arduino, ESP32, ESP8266, STM32, RP2040, and embedded C/C++.
Target Board: ${board?.name || "Arduino UNO"} (${board?.fqbn || "arduino:avr:uno"}).
Provide concise, correct, production-grade embedded C++ code fixes. Always wrap code blocks with \`\`\`cpp and explain changes briefly.`;

  const messages: { role: string; content: string }[] = [
    { role: "system", content: systemPrompt },
  ];

  if (history && history.length > 0) {
    for (const h of history.slice(-6)) {
      messages.push({ role: h.role, content: h.content });
    }
  }

  const userContent = code
    ? `Current Sketch Code:\n\`\`\`cpp\n${code}\n\`\`\`\n\nUser Request: ${message}`
    : message;

  messages.push({ role: "user", content: userContent });

  try {
    const chatUrl = baseUrl.endsWith("/v1") || baseUrl.includes("/v1/")
      ? `${baseUrl.replace(/\/+$/, "")}/chat/completions`
      : `${baseUrl.replace(/\/+$/, "")}/v1/chat/completions`;

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    const response = await fetch(chatUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.3,
        max_tokens: 1500,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return {
        reply: `AI Provider (${prov.name}) returned HTTP ${response.status}: ${errText.substring(0, 150)}`,
        error: errText,
        providerName: prov.name,
        model,
      };
    }

    const result = await response.json();
    const reply = result.choices?.[0]?.message?.content || "No response received.";

    return {
      reply,
      providerName: prov.name,
      model,
    };
  } catch (err: any) {
    return {
      reply: `Connection to ${prov.name} failed: ${err.message || String(err)}. Please verify your network connection or API URL in Settings.`,
      error: err.message,
      providerName: prov.name,
      model,
    };
  }
}
