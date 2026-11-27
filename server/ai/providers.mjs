import fs from "node:fs";
import { CONFIG_DIR, AI_CONFIG_FILE } from "../utils.mjs";
import { log } from "../utils/logger.mjs";

// In-memory cache for AI config — avoids disk I/O on every AI request
let _configCache = null;

export const PRESET_PROVIDERS = [
  {
    id: "groq",
    name: "Groq",
    tagline: "Ultra-Fast LPU (~500 t/s)",
    description: "Instant response times. Best for real-time inline ghost-text and instant error fixes.",
    keyUrl: "https://console.groq.com/keys",
    keyPlaceholder: "gsk_...",
    defaultBaseUrl: "https://api.groq.com/openai/v1",
    defaultModel: "qwen/qwen3.8-27b",
    topModels: [
      { id: "qwen/qwen3.8-27b", name: "Qwen 3.8 27B", tag: "Recommended", desc: "High accuracy multilingual code model on Groq LPU" },
      { id: "openai/gpt-oss-120b", name: "GPT-OSS 120B", tag: "Flagship", desc: "Flagship open weights 120B reasoning model" },
      { id: "openai/gpt-oss-20b", name: "GPT-OSS 20B", tag: "Fastest", desc: "Ultra-fast code generation on Groq LPU (~500 t/s)" },
    ],
    models: [
      "qwen/qwen3.8-27b",
      "openai/gpt-oss-120b",
      "openai/gpt-oss-20b",
    ],
    requiresKey: true,
    protocol: "openai"
  },
  {
    id: "gemini",
    name: "Google Gemini",
    tagline: "Generous Free Tier",
    description: "Massive context and strong code reasoning with a generous free API tier.",
    keyUrl: "https://aistudio.google.com/app/apikey",
    keyPlaceholder: "AIzaSy...",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModel: "gemini-3.8-flash",
    topModels: [
      { id: "gemini-3.8-flash", name: "Gemini 3.8 Flash", tag: "Recommended", desc: "Flagship next-gen speed, coding accuracy & low latency" },
      { id: "gemini-3.7-flash", name: "Gemini 3.7 Flash", tag: "Fastest", desc: "Ultra-low latency real-time firmware assistant" },
      { id: "gemini-3.1-pro-preview", name: "Gemini 3.1 Pro", tag: "Deep Reasoning", desc: "Massive context deep reasoning for complex architecture" },
    ],
    models: [
      "gemini-3.8-flash",
      "gemini-3.7-flash",
      "gemini-3.1-pro-preview",
      "gemini-3.1-flash-lite",
      "gemini-3.5-flash",
      "gemini-2.5-flash",
      "gemini-2.5-pro",
      "gemini-2.0-flash",
    ],
    requiresKey: true,
    protocol: "openai"
  },
  {
    id: "openai",
    name: "OpenAI",
    tagline: "o3-mini & GPT-4o",
    description: "Industry leading accuracy for embedded C++ and system architectures.",
    keyUrl: "https://platform.openai.com/api-keys",
    keyPlaceholder: "sk-proj-...",
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultModel: "o3-mini",
    topModels: [
      { id: "o3-mini", name: "o3-mini", tag: "Recommended", desc: "Deep reasoning for race conditions, ISRs, timing bugs & C++ logic" },
      { id: "gpt-4o", name: "GPT-4o", tag: "Flagship", desc: "Maximum coding intelligence across all architectures" },
      { id: "gpt-4o-mini", name: "GPT-4o Mini", tag: "Fastest", desc: "Fast, cost-efficient, high C++ accuracy" },
    ],
    models: [
      "o3-mini",
      "gpt-4o",
      "gpt-4o-mini",
      "o1-mini",
      "o1",
    ],
    requiresKey: true,
    protocol: "openai"
  },
  {
    id: "claude",
    name: "Anthropic Claude",
    tagline: "Claude 3.7 Sonnet",
    description: "Superior firmware pointer logic, memory analysis, and nuanced bug explanations.",
    keyUrl: "https://console.anthropic.com/settings/keys",
    keyPlaceholder: "sk-ant-api03-...",
    defaultBaseUrl: "https://api.anthropic.com/v1",
    defaultModel: "claude-3-7-sonnet-latest",
    topModels: [
      { id: "claude-3-7-sonnet-latest", name: "Claude 3.7 Sonnet", tag: "Recommended", desc: "Hybrid reasoning & world-class C/C++ embedded accuracy" },
      { id: "claude-3-5-sonnet-latest", name: "Claude 3.5 Sonnet", tag: "Top Accuracy", desc: "Gold standard for pointer logic, ISRs & memory bugs" },
      { id: "claude-3-5-haiku-latest", name: "Claude 3.5 Haiku", tag: "Fastest", desc: "Near-instant responses, concise error explanations" },
    ],
    models: [
      "claude-3-7-sonnet-latest",
      "claude-3-5-sonnet-latest",
      "claude-3-5-haiku-latest",
      "claude-3-opus-latest",
    ],
    requiresKey: true,
    protocol: "anthropic"
  },
  {
    id: "nvidia",
    name: "NVIDIA NIM",
    tagline: "GPU Accelerated",
    description: "Enterprise open models accelerated by NVIDIA TensorRT-LLM infrastructure.",
    keyUrl: "https://build.nvidia.com",
    keyPlaceholder: "nvapi-...",
    defaultBaseUrl: "https://integrate.api.nvidia.com/v1",
    defaultModel: "mistralai/codestral-22b-instruct-v0.1",
    topModels: [
      { id: "mistralai/codestral-22b-instruct-v0.1", name: "Mistral Codestral 22B", tag: "Recommended", desc: "Mistral's world-class C/C++ embedded code model" },
      { id: "nvidia/llama-3.1-nemotron-70b-instruct", name: "Llama 3.1 Nemotron 70B", tag: "Flagship", desc: "NVIDIA TensorRT-LLM accelerated 70B flagship" },
      { id: "deepseek-ai/deepseek-coder-6.7b-instruct", name: "DeepSeek Coder 6.7B", tag: "Coding", desc: "DeepSeek specialized code & firmware model" },
    ],
    models: [
      "mistralai/codestral-22b-instruct-v0.1",
      "nvidia/llama-3.1-nemotron-70b-instruct",
      "deepseek-ai/deepseek-coder-6.7b-instruct",
      "deepseek-ai/deepseek-v4.1-flash",
      "mistralai/mistral-large-2-instruct",
      "meta/codellama-70b",
      "google/codegemma-7b",
      "openai/gpt-oss-20b",
    ],
    requiresKey: true,
    protocol: "openai"
  },
  {
    id: "ollama",
    name: "Local Ollama",
    tagline: "100% Private Offline",
    description: "Runs entirely on your local machine. Zero internet access, zero API keys, 100% private.",
    keyUrl: "https://ollama.com",
    keyPlaceholder: "No API key needed",
    defaultBaseUrl: "http://localhost:11434/v1",
    defaultModel: "qwen2.5-coder",
    topModels: [
      { id: "qwen2.5-coder", name: "Qwen 2.5 Coder", tag: "Recommended", desc: "Top open-source coding model, specialized for C/C++" },
      { id: "deepseek-coder-v2", name: "DeepSeek Coder V2", tag: "Architecture", desc: "Deep firmware reasoning, local & private" },
      { id: "llama3.2", name: "Llama 3.2", tag: "Lightweight", desc: "Fast CPU/GPU execution for low-spec machines" },
    ],
    models: [
      "qwen2.5-coder",
      "deepseek-coder-v2",
      "llama3.2",
      "codellama",
    ],
    requiresKey: false,
    protocol: "openai"
  }
];

export function ensureAIConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
}

export function isRateLimitOrQuotaError(status, errText) {
  if (status === 429 || status === 402 || status === 401 || status === 403) return true;
  if (!errText) return false;
  const lower = String(errText).toLowerCase();
  return (
    lower.includes("429") ||
    lower.includes("401") ||
    lower.includes("403") ||
    lower.includes("resource_exhausted") ||
    lower.includes("quota") ||
    lower.includes("rate limit") ||
    lower.includes("rate_limit") ||
    lower.includes("ratelimit") ||
    lower.includes("too many requests") ||
    lower.includes("insufficient_quota") ||
    lower.includes("exceeded your current quota") ||
    lower.includes("free_tier_requests") ||
    lower.includes("credits depleted") ||
    lower.includes("overloaded") ||
    lower.includes("invalid_api_key") ||
    lower.includes("invalid api key") ||
    lower.includes("unauthorized")
  );
}

export function saveAIConfig(config) {
  ensureAIConfigDir();
  _configCache = config; // update in-memory cache immediately
  const tmp = AI_CONFIG_FILE + ".tmp." + process.pid;
  try {
    fs.writeFileSync(tmp, JSON.stringify(config, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, AI_CONFIG_FILE); // atomic swap — prevents corruption on crash
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch (_) {}
    throw e;
  }
}

export function invalidateAIConfigCache() {
  _configCache = null;
}

export function loadAIConfig() {
  if (_configCache) return _configCache;
  ensureAIConfigDir();
  if (!fs.existsSync(AI_CONFIG_FILE)) {
    const initialConfig = {
      activeProviderId: null,
      autoFailover: true,
      providers: {}
    };
    saveAIConfig(initialConfig);
    return initialConfig;
  }
  try {
    const cfg = JSON.parse(fs.readFileSync(AI_CONFIG_FILE, "utf-8"));
    if (cfg.autoFailover === undefined) {
      cfg.autoFailover = true;
    }
    let modified = false;
    for (const [id, prov] of Object.entries(cfg.providers || {})) {
      const preset = PRESET_PROVIDERS.find(p => p.id === id);

      // Normalize multi-key pool (apiKeys array)
      if (!Array.isArray(prov.apiKeys)) {
        prov.apiKeys = prov.apiKey ? [prov.apiKey] : [];
        modified = true;
      } else {
        const filtered = prov.apiKeys.filter((k) => typeof k === "string" && k.trim().length > 0);
        if (prov.apiKey && !filtered.includes(prov.apiKey)) {
          filtered.unshift(prov.apiKey);
        }
        if (filtered.length !== prov.apiKeys.length) {
          prov.apiKeys = filtered;
          modified = true;
        }
      }
      if (!prov.apiKey && prov.apiKeys.length > 0) {
        prov.apiKey = prov.apiKeys[0];
        modified = true;
      }

      // Auto-migrate decommissioned, inaccessible, or empty models
      const isGroqInvalid = id === "groq" && (
        prov.selectedModel === "llama-3.3-70b-versatile" ||
        prov.selectedModel === "llama-3.1-8b-instant" ||
        prov.selectedModel === "mixtral-8x7b-32768"
      );
      if (prov.selectedModel === "mixtral-8x7b-32768" || isGroqInvalid || !prov.selectedModel) {
        prov.selectedModel = preset ? preset.defaultModel : "qwen/qwen3.8-27b";
        modified = true;
      }
      if (id === "nvidia" && (!prov.selectedModel || prov.selectedModel === "meta/llama-3.3-70b-instruct" || prov.selectedModel === "nvidia/nemotron-3-ultra-550b-a55b")) {
        prov.selectedModel = "mistralai/codestral-22b-instruct-v0.1";
        modified = true;
      }
      if (id === "gemini") {
        if (prov.selectedModel && prov.selectedModel.startsWith("models/")) {
          prov.selectedModel = prov.selectedModel.replace(/^models\//, "");
          modified = true;
        }
        if (!prov.selectedModel || prov.selectedModel === "gemini-2.5-flash" || prov.selectedModel === "gemini-2.0-flash" || prov.selectedModel === "gemini-1.5-flash") {
          prov.selectedModel = "gemini-3.8-flash";
          modified = true;
        }
      }
      if (id === "claude" && !prov.selectedModel) {
        prov.selectedModel = "claude-3-7-sonnet-latest";
        modified = true;
      }
      if (id === "openai" && !prov.selectedModel) {
        prov.selectedModel = "o3-mini";
        modified = true;
      }
    }
    if (modified) {
      saveAIConfig(cfg);
    }
    _configCache = cfg;
    return cfg;
  } catch (e) {
    return { activeProviderId: null, autoFailover: true, providers: {} };
  }
}

export function maskApiKey(key) {
  if (!key) return "";
  if (key.length <= 8) return "••••••••";
  return key.slice(0, 4) + "••••••••" + key.slice(-4);
}

export function getSanitizedAIConfig() {
  const cfg = loadAIConfig();
  const sanitizedProviders = {};
  for (const [id, prov] of Object.entries(cfg.providers || {})) {
    const keys = Array.isArray(prov.apiKeys) && prov.apiKeys.length > 0
      ? prov.apiKeys
      : (prov.apiKey ? [prov.apiKey] : []);
    sanitizedProviders[id] = {
      id: prov.id,
      name: prov.name,
      maskedKey: maskApiKey(prov.apiKey || keys[0] || ""),
      maskedKeys: keys.map((k) => maskApiKey(k)),
      keyCount: keys.length,
      hasKey: keys.length > 0 || !prov.requiresKey,
      baseUrl: prov.baseUrl,
      selectedModel: prov.selectedModel,
      enabled: prov.enabled !== false,
      requiresKey: prov.requiresKey !== false,
    };
  }
  return {
    activeProviderId: cfg.activeProviderId,
    autoFailover: cfg.autoFailover !== false,
    providers: sanitizedProviders,
    presetProviders: PRESET_PROVIDERS,
  };
}

export function getActiveProvider() {
  const cfg = loadAIConfig();
  if (!cfg.activeProviderId || !cfg.providers || !cfg.providers[cfg.activeProviderId]) {
    return null;
  }
  return cfg.providers[cfg.activeProviderId];
}

export async function pullProviderModels(providerId, apiKey, baseUrl) {
  const preset = PRESET_PROVIDERS.find((p) => p.id === providerId);
  const effectiveBaseUrl = (baseUrl || preset?.defaultBaseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");
  const protocol = preset?.protocol || (providerId === "claude" ? "anthropic" : "openai");

  let rawModels = [];

  try {
    if (providerId === "ollama") {
      const ollamaHost = effectiveBaseUrl.replace(/\/v1$/, "");
      try {
        const res = await fetch(`${ollamaHost}/api/tags`, {
          headers: { "User-Agent": "FlashCode/1.0.0 (X11; Linux x86_64)" },
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) {
          const data = await res.json();
          rawModels = (data.models || []).map((m) => m.name || m.model);
        }
      } catch (e) {
        const res = await fetch(`${effectiveBaseUrl}/models`, {
          headers: { "User-Agent": "FlashCode/1.0.0 (X11; Linux x86_64)" },
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) {
          const data = await res.json();
          rawModels = (data.data || []).map((m) => m.id);
        }
      }
    } else if (protocol === "anthropic") {
      const res = await fetch(`${effectiveBaseUrl}/models`, {
        headers: {
          "x-api-key": apiKey || "",
          "anthropic-version": "2023-06-01",
          "User-Agent": "FlashCode/1.0.0 (X11; Linux x86_64)",
        },
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const data = await res.json();
        rawModels = (data.data || []).map((m) => m.id);
      } else {
        const errText = await res.text();
        throw new Error(`Claude returned ${res.status}: ${errText}`);
      }
    } else if (providerId === "gemini" && apiKey) {
      let ok = false;
      try {
        const res = await fetch(`${effectiveBaseUrl}/models`, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "User-Agent": "FlashCode/1.0.0 (X11; Linux x86_64)",
          },
          signal: AbortSignal.timeout(6000),
        });
        if (res.ok) {
          const data = await res.json();
          rawModels = (data.data || []).map((m) => (m.id || "").replace(/^models\//, ""));
          ok = true;
        }
      } catch (_) {}

      if (!ok) {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`, {
          headers: { "User-Agent": "FlashCode/1.0.0 (X11; Linux x86_64)" },
          signal: AbortSignal.timeout(8000),
        });
        if (res.ok) {
          const data = await res.json();
          rawModels = (data.models || []).map((m) => (m.name || "").replace(/^models\//, ""));
        } else {
          const errText = await res.text();
          throw new Error(`Gemini returned ${res.status}: ${errText}`);
        }
      }
    } else {
      const headers = {
        "User-Agent": "FlashCode/1.0.0 (X11; Linux x86_64)",
      };
      if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
      const res = await fetch(`${effectiveBaseUrl}/models`, {
        headers,
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const data = await res.json();
        rawModels = (data.data || []).map((m) => (m.id || "").replace(/^models\//, ""));
      } else {
        const errText = await res.text();
        throw new Error(`Provider returned ${res.status}: ${errText}`);
      }
    }
  } catch (err) {
    return {
      success: false,
      error: err.message,
      providerId,
      topModels: preset?.topModels || [],
      allModels: preset?.models || [],
      source: "preset",
    };
  }

  // Filter out non-coding/audio/moderation/whisper models
  const EXCLUDED_KEYWORDS = [
    "whisper", "guard", "moderation", "embed", "tts", "dall-e", "audio", "realtime",
    "clip", "nvclip", "synthetic", "detector", "ising-calibration", "content-safety",
    "topic-control", "reward", "qa-", "retriever", "parse", "translate-", "vila",
    "deplot", "kosmos", "preview-tts", "transcribe", "image-preview", "image", "mixtral-8x7b-32768",
    "neva-22b", "fuyu-8b", "palmyra", "sea-lion"
  ];

  const cleanList = rawModels
    .map((id) => (typeof id === "string" ? id.replace(/^models\//, "") : id))
    .filter((id) => {
      if (!id || typeof id !== "string") return false;
      const lower = id.toLowerCase();
      return !EXCLUDED_KEYWORDS.some((kw) => lower.includes(kw));
    });

  // Curated popular models from leading AI companies (Google, Anthropic, OpenAI, Mistral, NVIDIA, DeepSeek, Meta, Qwen)
  const CURATED_POPULAR_MODELS = [
    { pattern: /gemini-3\.8-flash/i, name: "Gemini 3.8 Flash", tag: "Recommended", desc: "Flagship next-gen speed, coding accuracy & low latency" },
    { pattern: /gemini-3\.7-flash/i, name: "Gemini 3.7 Flash", tag: "Fastest", desc: "Ultra-low latency real-time firmware assistant" },
    { pattern: /gemini-3\.1-pro/i, name: "Gemini 3.1 Pro", tag: "Deep Reasoning", desc: "Massive context deep reasoning for complex architecture" },
    { pattern: /gemini-3\.5-flash/i, name: "Gemini 3.5 Flash", tag: "Fastest", desc: "Google high-speed flash model" },
    { pattern: /gemini-3\.1-flash-lite/i, name: "Gemini 3.1 Flash-Lite", tag: "Fastest", desc: "Google ultra-low latency model" },
    { pattern: /gemini-2\.5-flash/i, name: "Gemini 2.5 Flash", tag: "Alternative", desc: "Google flash code model" },
    { pattern: /gemini-2\.5-pro/i, name: "Gemini 2.5 Pro", tag: "Deep Reasoning", desc: "Google 2M context deep reasoning model" },
    { pattern: /claude-3-7-sonnet/i, name: "Claude 3.7 Sonnet", tag: "Recommended", desc: "Anthropic hybrid reasoning & flagship code model" },
    { pattern: /claude-3-5-sonnet/i, name: "Claude 3.5 Sonnet", tag: "Top Accuracy", desc: "Anthropic gold standard for embedded C++" },
    { pattern: /claude-3-5-haiku/i, name: "Claude 3.5 Haiku", tag: "Fastest", desc: "Anthropic near-instant responses" },
    { pattern: /o3-mini/i, name: "o3-mini", tag: "Recommended", desc: "Deep reasoning for race conditions, ISRs, timing bugs" },
    { pattern: /gpt-4o$/i, name: "GPT-4o", tag: "Flagship", desc: "OpenAI flagship intelligence across all architectures" },
    { pattern: /gpt-4o-mini/i, name: "GPT-4o Mini", tag: "Fastest", desc: "Fast, cost-efficient, high C++ accuracy" },
    { pattern: /codestral-22b/i, name: "Mistral Codestral 22B", tag: "Recommended", desc: "Mistral's world-class C/C++ embedded code model" },
    { pattern: /llama-3\.1-nemotron-70b/i, name: "Llama 3.1 Nemotron 70B", tag: "Flagship", desc: "NVIDIA TensorRT-LLM accelerated 70B flagship" },
    { pattern: /deepseek-coder/i, name: "DeepSeek Coder 6.7B", tag: "Coding", desc: "DeepSeek specialized code & firmware model" },
    { pattern: /deepseek-v4/i, name: "DeepSeek V4.1 Flash", tag: "Fastest", desc: "DeepSeek next-gen ultra-fast reasoning model" },
    { pattern: /qwen3\.8-27b|qwen2\.5-coder/i, name: "Qwen 3.8 27B", tag: "Recommended", desc: "High accuracy multilingual C++ model" },
    { pattern: /gpt-oss-120b/i, name: "GPT-OSS 120B", tag: "Flagship", desc: "Flagship open weights 120B reasoning model" },
    { pattern: /gpt-oss-20b/i, name: "GPT-OSS 20B", tag: "Fastest", desc: "Ultra-fast code generation on Groq LPU (~500 t/s)" },
    { pattern: /codellama-70b/i, name: "Meta CodeLlama 70B", tag: "Coding", desc: "Meta flagship 70B code foundation model" },
    { pattern: /mistral-large-2/i, name: "Mistral Large 2", tag: "Flagship", desc: "Mistral's 123B flagship intelligence" },
    { pattern: /nemotron-4-340b/i, name: "NVIDIA Nemotron 4 340B", tag: "Reasoning", desc: "NVIDIA massive 340B reasoning model" },
  ];

  // 1. Match from preset topModels if present in live list
  let top3 = [];
  if (preset && preset.topModels) {
    for (const tm of preset.topModels) {
      const match = cleanList.find((m) => m.toLowerCase() === tm.id.toLowerCase() || m.toLowerCase().includes(tm.id.toLowerCase()));
      if (match && !top3.some((t) => t.id === match)) {
        top3.push({ ...tm, id: match });
      }
    }
  }

  // 2. Next, match from CURATED_POPULAR_MODELS table
  for (const cm of CURATED_POPULAR_MODELS) {
    if (top3.length >= 3) break;
    const match = cleanList.find((m) => cm.pattern.test(m));
    if (match && !top3.some((t) => t.id === match)) {
      top3.push({
        id: match,
        name: cm.name || match.split("/").pop(),
        tag: cm.tag,
        desc: cm.desc,
      });
    }
  }

  // 3. If still needed, strictly pull from known reputable companies only
  const TRUSTED_COMPANIES = ["nvidia", "mistralai", "meta", "google", "deepseek-ai", "openai", "qwen", "ibm", "microsoft", "anthropic"];
  const trustedCleanList = cleanList.filter((m) => {
    const comp = m.split("/")[0]?.toLowerCase();
    return TRUSTED_COMPANIES.includes(comp);
  });

  for (const m of trustedCleanList) {
    if (top3.length >= 3) break;
    if (!top3.some((t) => t.id === m)) {
      const short = m.split("/").pop() || m;
      top3.push({
        id: m,
        name: short,
        tag: top3.length === 0 ? "Recommended" : top3.length === 1 ? "Fastest" : "Alternative",
        desc: `Verified model from ${m.split("/")[0]}`,
      });
    }
  }

  if (top3.length === 0 && preset?.topModels) {
    top3 = preset.topModels;
  }

  // Sort allModels so popular companies appear first
  const allSet = new Set([...cleanList, ...(preset?.models || [])]);
  allSet.delete("mixtral-8x7b-32768");
  const sortedAllModels = Array.from(allSet).sort((a, b) => {
    const compA = a.split("/")[0]?.toLowerCase();
    const compB = b.split("/")[0]?.toLowerCase();
    const isTrustedA = TRUSTED_COMPANIES.includes(compA);
    const isTrustedB = TRUSTED_COMPANIES.includes(compB);
    if (isTrustedA && !isTrustedB) return -1;
    if (!isTrustedA && isTrustedB) return 1;
    const isCodeA = /code/i.test(a);
    const isCodeB = /code/i.test(b);
    if (isCodeA && !isCodeB) return -1;
    if (!isCodeA && isCodeB) return 1;
    return a.localeCompare(b);
  });

  return {
    success: true,
    providerId,
    topModels: top3.slice(0, 3),
    allModels: sortedAllModels,
    pulledCount: cleanList.length,
    source: "live",
    message: `Pulled ${cleanList.length} live models from ${preset?.name || providerId}`,
  };
}

export async function callSingleLLM(provider, systemPrompt, userPromptOrMessages, options = {}) {
  const { maxTokens = 1500, temperature = 0.2, stop = null } = options;
  const baseUrl = (provider.baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");
  const protocol = provider.protocol || (provider.id === "claude" ? "anthropic" : "openai");

  // Normalize input into an array of { role, content } messages
  const normalizedMessages = Array.isArray(userPromptOrMessages)
    ? userPromptOrMessages
    : [{ role: "user", content: String(userPromptOrMessages) }];

  if (protocol === "anthropic") {
    const anthropicMessages = [];
    for (const msg of normalizedMessages) {
      if (msg.role === "system") continue;
      const role = msg.role === "assistant" ? "assistant" : "user";
      if (anthropicMessages.length === 0 && role !== "user") {
        continue;
      }
      const prev = anthropicMessages[anthropicMessages.length - 1];
      if (prev && prev.role === role) {
        prev.content += `\n\n${msg.content}`;
      } else {
        anthropicMessages.push({ role, content: msg.content });
      }
    }
    if (anthropicMessages.length === 0) {
      anthropicMessages.push({ role: "user", content: "Hello" });
    }

    const endpoint = `${baseUrl}/messages`;
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": provider.apiKey || "",
        "anthropic-version": "2023-06-01",
        "User-Agent": "FlashCode/1.0.0 (X11; Linux x86_64)",
      },
      body: JSON.stringify({
        model: provider.selectedModel || "claude-3-7-sonnet-latest",
        system: systemPrompt,
        messages: anthropicMessages,
        max_tokens: maxTokens,
        temperature,
      }),
      signal: AbortSignal.timeout(25000),
    });

    if (!res.ok) {
      const errText = await res.text();
      if (isRateLimitOrQuotaError(res.status, errText)) {
        throw new Error(`[QUOTA_EXCEEDED] (${res.status}): ${errText}`);
      }
      throw new Error(`Claude API error (${res.status}): ${errText}`);
    }

    const json = await res.json();
    return json.content?.[0]?.text || "";
  } else {
    // OpenAI-compatible endpoint (Groq, Gemini, OpenAI, NVIDIA NIM, Ollama)
    const endpoint = `${baseUrl}/chat/completions`;
    const headers = {
      "Content-Type": "application/json",
      "User-Agent": "FlashCode/1.0.0 (X11; Linux x86_64)",
    };
    if (provider.apiKey) {
      headers["Authorization"] = `Bearer ${provider.apiKey}`;
    }

    let modelToUse = provider.selectedModel || "";
    if (provider.id === "gemini") {
      modelToUse = (modelToUse || "gemini-3.8-flash").replace(/^models\//, "");
    } else if (provider.id === "groq") {
      if (
        !modelToUse ||
        modelToUse === "mixtral-8x7b-32768" ||
        modelToUse === "llama-3.3-70b-versatile" ||
        modelToUse === "llama-3.1-8b-instant"
      ) {
        modelToUse = "qwen/qwen3.8-27b";
      }
    }

    const doRequest = async (targetModel) => {
      const messages = [
        { role: "system", content: systemPrompt },
        ...normalizedMessages.filter((m) => m.role !== "system"),
      ];

      const bodyPayload = {
        model: targetModel,
        messages,
        temperature,
        max_tokens: maxTokens,
      };
      if (stop) {
        bodyPayload.stop = stop;
      }

      return await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(bodyPayload),
        signal: AbortSignal.timeout(25000),
      });
    };

    let res = await doRequest(modelToUse);

    if (!res.ok) {
      const errText = await res.text();
      const isDecommissioned = errText.includes("decommissioned") || errText.includes("model_decommissioned");
      const isNotFound = res.status === 404 || errText.includes("model_not_found") || errText.includes("does not exist");
      const isQuota = isRateLimitOrQuotaError(res.status, errText);

      if (isDecommissioned || isNotFound || isQuota) {
        let fallbackModel = null;
        if (provider.id === "groq") {
          fallbackModel = modelToUse !== "qwen/qwen3.8-27b" ? "qwen/qwen3.8-27b" : "openai/gpt-oss-120b";
        } else if (provider.id === "gemini") {
          fallbackModel = modelToUse !== "gemini-3.8-flash" ? "gemini-3.8-flash" : "gemini-3.7-flash";
        } else if (provider.id === "claude") {
          fallbackModel = modelToUse !== "claude-3-7-sonnet-latest" ? "claude-3-7-sonnet-latest" : "claude-3-5-sonnet-latest";
        } else if (provider.id === "openai") {
          fallbackModel = modelToUse !== "o3-mini" ? "o3-mini" : "gpt-4o-mini";
        } else {
          const preset = PRESET_PROVIDERS.find((p) => p.id === provider.id);
          fallbackModel = preset ? preset.defaultModel : null;
        }

        if (fallbackModel && fallbackModel !== modelToUse) {
          log.info("ai", `Model ${modelToUse} failed. Trying fallback model ${fallbackModel}`, {
            failedModel: modelToUse,
            fallbackModel,
            status: res.status,
          });
          try {
            const retryRes = await doRequest(fallbackModel);
            if (retryRes.ok) {
              const retryJson = await retryRes.json();
              try {
                const cfg = loadAIConfig();
                if (cfg.providers?.[provider.id]) {
                  cfg.providers[provider.id].selectedModel = fallbackModel;
                  saveAIConfig(cfg);
                }
              } catch (_) {}
              return retryJson.choices?.[0]?.message?.content || "";
            }
          } catch (_) {}
        }
      }

      if (isQuota) {
        throw new Error(`[QUOTA_EXCEEDED] (${res.status}): ${errText}`);
      }

      throw new Error(`Provider API error (${res.status}): ${errText}`);
    }

    const json = await res.json();
    return json.choices?.[0]?.message?.content || "";
  }
}

/**
 * Universal Multi-Key Auto-Failover LLM caller.
 * Iterates through all configured keys in provider.apiKeys if rate-limited (429/quota/401).
 * If all keys fail, bubbles up error for inter-provider failover.
 */
export async function callLLM(provider, systemPrompt, userPromptOrMessages, options = {}) {
  const keys = Array.isArray(provider.apiKeys) && provider.apiKeys.length > 0
    ? provider.apiKeys
    : (provider.apiKey ? [provider.apiKey] : [""]);

  if (keys.length <= 1) {
    const singleProv = { ...provider, apiKey: keys[0] || provider.apiKey || "" };
    return await callSingleLLM(singleProv, systemPrompt, userPromptOrMessages, options);
  }

  let lastErr = null;
  for (let k = 0; k < keys.length; k++) {
    const currentKey = keys[k];
    const provWithKey = { ...provider, apiKey: currentKey };
    try {
      if (k > 0) {
        log.info("ai", `Auto-failover: Key ${k + 1} of ${keys.length} for ${provider.name} in use`, {
          providerId: provider.id,
          keyIndex: k,
        });
      }
      const reply = await callSingleLLM(provWithKey, systemPrompt, userPromptOrMessages, options);

      // On successful failover with secondary key, promote working key to front of pool
      if (k > 0) {
        log.info("ai", `Auto-failover succeeded using Key ${k + 1}/${keys.length} for ${provider.name}`);
        try {
          const cfg = loadAIConfig();
          if (cfg.providers?.[provider.id]?.apiKeys) {
            const pool = cfg.providers[provider.id].apiKeys;
            const idx = pool.indexOf(currentKey);
            if (idx > 0) {
              pool.splice(idx, 1);
              pool.unshift(currentKey);
              cfg.providers[provider.id].apiKey = currentKey;
              saveAIConfig(cfg);
            }
          }
        } catch (_) {}
      }
      return reply;
    } catch (err) {
      lastErr = err;
      log.warn("ai", `Key ${k + 1}/${keys.length} for ${provider.name} failed: ${err.message}`, {
        providerId: provider.id,
        keyIndex: k,
      });
      // Continue to next key in pool
    }
  }
  throw lastErr;
}
