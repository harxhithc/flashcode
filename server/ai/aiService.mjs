import { readBody, sendJson } from "../utils.mjs";
import { log } from "../utils/logger.mjs";
import {
  PRESET_PROVIDERS,
  getSanitizedAIConfig,
  loadAIConfig,
  saveAIConfig,
  callLLM,
  getActiveProvider,
  pullProviderModels,
  isRateLimitOrQuotaError,
} from "./providers.mjs";

/**
 * 7.1 GET /api/ai/config (Retrieve provider configuration & presets)
 */
export async function handleGetAIConfig(req, res) {
  return sendJson(res, getSanitizedAIConfig());
}

/**
 * 7.2 POST /api/ai/provider/test (Test connection to any provider or specific key)
 */
export async function handleTestAIProvider(req, res) {
  const { providerId, apiKey, keyIndex, baseUrl, selectedModel } = await readBody(req);
  const preset = PRESET_PROVIDERS.find((p) => p.id === providerId);

  // If testing an existing saved provider and no new key passed, pull saved key
  const cfg = loadAIConfig();
  const saved = cfg.providers?.[providerId] || {};
  let effectiveKey = apiKey !== undefined && apiKey !== "" ? apiKey : "";
  if (!effectiveKey && keyIndex !== undefined && Array.isArray(saved.apiKeys)) {
    effectiveKey = saved.apiKeys[keyIndex] || "";
  }
  if (!effectiveKey) {
    effectiveKey = saved.apiKey || (saved.apiKeys?.[0] || "");
  }

  const effectiveBaseUrl = baseUrl || saved.baseUrl || preset?.defaultBaseUrl || "https://api.openai.com/v1";
  const effectiveModel = selectedModel || saved.selectedModel || preset?.defaultModel || "gpt-4o-mini";
  const protocol = preset?.protocol || (providerId === "claude" ? "anthropic" : "openai");

  const testProvider = {
    id: providerId,
    name: preset?.name || providerId,
    apiKey: effectiveKey,
    apiKeys: effectiveKey ? [effectiveKey] : (saved.apiKeys || []),
    baseUrl: effectiveBaseUrl,
    selectedModel: effectiveModel,
    protocol,
  };

  try {
    const startTime = Date.now();
    const reply = await callLLM(
      testProvider,
      "You are Flash connection validator. Reply with exactly the word: OK",
      "ping",
      { maxTokens: 10, temperature: 0 }
    );
    const latencyMs = Date.now() - startTime;
    return sendJson(res, {
      success: true,
      latencyMs,
      reply: reply.trim(),
      message: `Successfully connected to ${testProvider.name} in ${latencyMs}ms!`,
    });
  } catch (err) {
    return sendJson(res, {
      success: false,
      error: err.message || String(err),
    }, 400);
  }
}

/**
 * 7.3 POST /api/ai/provider/save (Securely save provider credentials & multi-key pool)
 */
export async function handleSaveAIProvider(req, res) {
  const { providerId, apiKey, apiKeys, addKey, removeKeyIndex, baseUrl, selectedModel, makeActive } = await readBody(req);
  const preset = PRESET_PROVIDERS.find((p) => p.id === providerId);
  const cfg = loadAIConfig();
  if (!cfg.providers) cfg.providers = {};

  const existing = cfg.providers[providerId] || {};
  let currentKeys = Array.isArray(existing.apiKeys)
    ? [...existing.apiKeys]
    : (existing.apiKey ? [existing.apiKey] : []);

  // Handle removing a specific key by index
  if (removeKeyIndex !== undefined && typeof removeKeyIndex === "number") {
    if (removeKeyIndex >= 0 && removeKeyIndex < currentKeys.length) {
      currentKeys.splice(removeKeyIndex, 1);
    }
  }

  // Handle adding a single new key to the failover pool
  if (addKey && typeof addKey === "string" && addKey.trim()) {
    const cleanAdd = addKey.trim();
    if (!currentKeys.includes(cleanAdd)) {
      currentKeys.push(cleanAdd);
    }
  }

  // Handle full array replacement (from UI key manager)
  if (Array.isArray(apiKeys)) {
    currentKeys = apiKeys
      .map((k) => (typeof k === "string" ? k.trim() : ""))
      .filter((k) => k && !k.includes("••••"));
  } else if (apiKey && typeof apiKey === "string" && apiKey.trim() && !apiKey.includes("••••")) {
    const cleanKey = apiKey.trim();
    if (!currentKeys.includes(cleanKey)) {
      currentKeys.unshift(cleanKey);
    }
  }

  cfg.providers[providerId] = {
    id: providerId,
    name: preset?.name || providerId,
    apiKey: currentKeys[0] || "",
    apiKeys: currentKeys,
    baseUrl: baseUrl || existing.baseUrl || preset?.defaultBaseUrl || "https://api.openai.com/v1",
    selectedModel: selectedModel || existing.selectedModel || preset?.defaultModel || "gpt-4o-mini",
    protocol: preset?.protocol || (providerId === "claude" ? "anthropic" : "openai"),
    requiresKey: preset ? preset.requiresKey : true,
    enabled: true,
    updatedAt: new Date().toISOString(),
  };

  if (makeActive !== false || !cfg.activeProviderId) {
    cfg.activeProviderId = providerId;
  }

  saveAIConfig(cfg);
  return sendJson(res, {
    success: true,
    activeProviderId: cfg.activeProviderId,
    config: getSanitizedAIConfig(),
  });
}

/**
 * 7.4 POST /api/ai/provider/set-active (Switch active provider)
 */
export async function handleSetActiveAIProvider(req, res) {
  const { providerId } = await readBody(req);
  const cfg = loadAIConfig();
  if (providerId === null || cfg.providers?.[providerId]) {
    cfg.activeProviderId = providerId;
    saveAIConfig(cfg);
    return sendJson(res, { success: true, activeProviderId: cfg.activeProviderId });
  }
  return sendJson(res, { success: false, error: "Provider not found" }, 404);
}

/**
 * 7.5 POST /api/ai/provider/delete (Remove provider credentials)
 */
export async function handleDeleteAIProvider(req, res) {
  const { providerId } = await readBody(req);
  const cfg = loadAIConfig();
  if (cfg.providers?.[providerId]) {
    delete cfg.providers[providerId];
    if (cfg.activeProviderId === providerId) {
      const remaining = Object.keys(cfg.providers);
      cfg.activeProviderId = remaining.length > 0 ? remaining[0] : null;
    }
    saveAIConfig(cfg);
    return sendJson(res, { success: true, config: getSanitizedAIConfig() });
  }
  return sendJson(res, { success: false, error: "Provider not found" }, 404);
}

/**
 * 7.6 POST /api/ai/chat (Interactive Agent Chat with Flash)
 */
export async function handleAIChat(req, res) {
  const { message, code, board, port, history } = await readBody(req);
  const cfg = loadAIConfig();
  const autoFailoverEnabled = cfg.autoFailover !== false;
  const active = getActiveProvider();

  if (!active) {
    return sendJson(res, {
      reply: "Flash is not connected to an AI provider yet. Click Setup Provider in the top-right to connect Groq, Gemini, OpenAI, Claude, or Local Ollama in under 10 seconds.",
      requiresProvider: true,
    });
  }

  const systemPrompt = `You are Flash, the autonomous embedded systems AI Agent in FlashCode IDE (equivalent to Antigravity and Kilo Code).
You specialize in production-grade firmware for ESP32, ESP8266, RP2040, STM32, and AVR/Arduino architectures.
You have direct autonomous execution capabilities to modify code in the editor, verify builds with the compiler, and upload to hardware.

CORE RULES FOR CODE EDITING (CRITICAL):
1. When generating, editing, or fixing sketch code, wrap the complete, updated code inside:
<flash_action type="edit_code">
// Complete raw C++ sketch code here
</flash_action>

2. ABSOLUTE SYNTAX REQUIREMENT:
- Inside <flash_action type="edit_code">, output ONLY raw, compilable C++ code.
- NEVER include markdown code fences (like \`\`\` or \`\`\`cpp) inside <flash_action type="edit_code">.
- Markdown backticks inside the action tag will corrupt the file and trigger immediate compiler syntax errors.
- Always output the COMPLETE, compilable sketch (with setup() and loop()), never placeholders like "// rest of code remains the same".

3. STRICT RULE - NO CODE BLOCKS IN CHAT PROSE:
- NEVER dump or duplicate code blocks (such as \`\`\`cpp ... \`\`\`) in your chat message.
- All code MUST be inside <flash_action type="edit_code"> ONLY. The IDE applies the code directly into the editor for the user.
- In your chat message, provide ONLY a concise 1-2 sentence technical summary explaining what you configured or changed.

4. AUTOMATIC COMPILER VERIFICATION:
- Whenever you write, edit, or modify code, ALWAYS append <flash_action type="compile" /> right after </flash_action> so the IDE immediately validates your code with the local compiler.

5. FLASH / UPLOAD ACTION:
- When the user asks to upload, flash, or burn to hardware, output:
<flash_action type="flash" />

6. FIRMWARE BEST PRACTICES:
- Match board peripherals and pinouts for the selected board (${board?.name || "Generic"}).
- Prefer non-blocking patterns (millis(), state machines, FreeRTOS tasks) over delay() where applicable.
- Keep chat prose concise, focused, and friendly (1-3 sentences max).`;

  // Construct full multi-turn conversation messages array so any new model knows previous context
  const messagesPayload = [];

  if (Array.isArray(history) && history.length > 0) {
    for (const turn of history) {
      if (!turn || !turn.content || typeof turn.content !== "string") continue;
      const role = turn.role === "assistant" || turn.role === "flash" ? "assistant" : "user";
      let cleanContent = turn.content
        .replace(/<flash_action\s+type="edit_code">([\s\S]*?)<\/flash_action>/gi, (match, p1) => {
          return `\`\`\`cpp\n${p1.trim()}\n\`\`\``;
        })
        .replace(/<flash_action\s+type="[^"]*"\s*\/?>/gi, "")
        .trim();

      if (cleanContent) {
        const lastMsg = messagesPayload[messagesPayload.length - 1];
        if (lastMsg && lastMsg.role === role) {
          lastMsg.content += `\n\n${cleanContent}`;
        } else {
          messagesPayload.push({ role, content: cleanContent });
        }
      }
    }
  }

  const latestUserPrompt = `[Current Environment]
Target Board: ${board?.name || "Generic Microcontroller"} (${board?.fqbn || "generic"})
Connected Port: ${port?.port_name || "No serial port selected"}
Current Editor Code:
\`\`\`cpp
${code || "// (Empty sketch)"}
\`\`\`

User Request:
${message}`;

  messagesPayload.push({ role: "user", content: latestUserPrompt });

  // Build list of providers to try:
  // 1. Current active provider
  // 2. All other configured providers (if autoFailover is enabled)
  const providersToTry = [active];
  if (autoFailoverEnabled && cfg.providers) {
    for (const [pId, pObj] of Object.entries(cfg.providers)) {
      if (
        pId !== active.id &&
        pObj.enabled !== false &&
        (pObj.apiKey || (Array.isArray(pObj.apiKeys) && pObj.apiKeys.length > 0) || !pObj.requiresKey)
      ) {
        providersToTry.push(pObj);
      }
    }
  }

  let rawReply = "";
  let finalProvider = active;
  let autoSwitchedFrom = null;
  let lastError = null;
  let quotaCount = 0;

  for (let i = 0; i < providersToTry.length; i++) {
    const currentProvider = providersToTry[i];
    try {
      if (i > 0) {
        log.info("ai", `Smart auto-failover: cycling to ${currentProvider.name}`, {
          providerId: currentProvider.id,
          providerName: currentProvider.name,
        });
      }
      rawReply = await callLLM(currentProvider, systemPrompt, messagesPayload, {
        maxTokens: 1500,
        temperature: 0.2,
      });

      finalProvider = currentProvider;
      if (i > 0) {
        autoSwitchedFrom = active.name;
        try {
          cfg.activeProviderId = currentProvider.id;
          saveAIConfig(cfg);
        } catch (_) {}
      }
      lastError = null;
      break;
    } catch (err) {
      lastError = err;
      if (isRateLimitOrQuotaError(0, err.message)) {
        quotaCount++;
      }
      log.warn("ai", `Provider ${currentProvider.name} failed`, {
        providerId: currentProvider.id,
        error: err.message,
      });
      if (!autoFailoverEnabled) {
        break;
      }
    }
  }

  if (lastError) {
    const isQuota = quotaCount > 0 || isRateLimitOrQuotaError(0, lastError.message);
    if (isQuota) {
      const minimalNotice = providersToTry.length > 1 && autoFailoverEnabled
        ? "All configured AI providers have reached their rate limit or quota. Please try again later or add another provider in Settings."
        : `${active.name} quota or rate limit reached. Please try again later or switch providers in Settings.`;

      return sendJson(res, {
        reply: minimalNotice,
        error: minimalNotice,
        isQuotaExceeded: true,
        providerName: active.name,
        minimal: true,
      }, 429);
    }

    let friendlyError = lastError.message || "Unknown error";
    try {
      const jsonMatch = friendlyError.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.error?.message) {
          friendlyError = parsed.error.message;
        }
      }
    } catch (_) {}

    if (friendlyError.length > 160) {
      friendlyError = friendlyError.slice(0, 160) + "...";
    }

    return sendJson(res, {
      reply: `Flash error communicating with ${active.name}: ${friendlyError}`,
      error: friendlyError,
    }, 500);
  }

  let reply = rawReply;

  // Strip duplicate code blocks in chat text outside flash_action
  if (reply.includes('<flash_action type="edit_code">')) {
    const actionMatches = [];
    reply = reply.replace(/<flash_action[\s\S]*?<\/flash_action>|<flash_action\s+[^>]*\/>/gi, (m) => {
      actionMatches.push(m);
      return `__ACTION_${actionMatches.length - 1}__`;
    });
    // Remove code blocks and headers from prose
    reply = reply.replace(/```[\s\S]*?```/gi, "").replace(/^#{1,6}\s+.*$/gm, "").trim();
    // Restore action tags
    actionMatches.forEach((m, idx) => {
      reply = reply.replace(`__ACTION_${idx}__`, m);
    });
  }

  // Backend safety sanitizer: Strip any accidental markdown fences inside <flash_action type="edit_code">
  reply = reply.replace(/<flash_action\s+type="edit_code">([\s\S]*?)<\/flash_action>/gi, (_, codeContent) => {
    let clean = (codeContent || "").trim();
    let changed = true;
    while (changed) {
      changed = false;
      const startMatch = clean.match(/^```(?:cpp|c\+\+|c|arduino|ino|text)?\s*\n?/i);
      if (startMatch) {
        clean = clean.slice(startMatch[0].length);
        changed = true;
      }
      const endMatch = clean.match(/\n?```\s*$/);
      if (endMatch) {
        clean = clean.slice(0, clean.length - endMatch[0].length);
        changed = true;
      }
      clean = clean.trim();
    }
    const lines = clean.split("\n");
    while (lines.length > 0 && /^```(?:cpp|c\+\+|c|arduino|ino|text)?\s*$/i.test(lines[0].trim())) {
      lines.shift();
    }
    while (lines.length > 0 && /^```\s*$/i.test(lines[lines.length - 1].trim())) {
      lines.pop();
    }
    return `<flash_action type="edit_code">\n${lines.join("\n").trim()}\n</flash_action>`;
  });

  return sendJson(res, {
    reply,
    providerName: finalProvider.name,
    model: finalProvider.selectedModel,
    autoSwitchedFrom,
  });
}

/**
 * 7.7 POST /api/ai/models/pull (Pull latest live models from provider)
 */
export async function handlePullAIModels(req, res) {
  const { providerId, apiKey, baseUrl } = await readBody(req);
  const cfg = loadAIConfig();
  const saved = cfg.providers?.[providerId] || {};
  const effectiveKey = apiKey !== undefined && apiKey !== "" ? apiKey : (saved.apiKey || "");
  const effectiveBaseUrl = baseUrl || saved.baseUrl;

  const result = await pullProviderModels(providerId, effectiveKey, effectiveBaseUrl);
  return sendJson(res, result);
}

/**
 * 7.8 POST /api/ai/settings/autofailover (Toggle smart auto-failover)
 */
export async function handleSetAutoFailover(req, res) {
  const { enabled } = await readBody(req);
  const cfg = loadAIConfig();
  cfg.autoFailover = Boolean(enabled);
  saveAIConfig(cfg);
  return sendJson(res, { success: true, autoFailover: cfg.autoFailover });
}

/**
 * 7.9 POST /api/ai/translate (Compiler Error Diagnosis powered by Flash)
 */
export async function handleAITranslate(req, res) {
  const { error_trace, code_snippet, board } = await readBody(req);
  const safeTrace = typeof error_trace === "string" ? error_trace : "";

  let lineNumber = null;
  if (safeTrace) {
    const match = safeTrace.match(/sketch\.ino:(\d+):(\d+):/i);
    if (match) {
      lineNumber = parseInt(match[1], 10);
    }
  }

  // Default heuristic fallback
  let explanation = "The C++ compiler encountered a syntax or type error while processing your firmware.";
  let suggestedFix = "// Review the error line and ensure syntax and pin identifiers are valid";

  if (safeTrace.includes("was not declared in this scope")) {
    const varMatch = safeTrace.match(/'([^']+)' was not declared in this scope/);
    const varName = varMatch ? varMatch[1] : "variable";
    explanation = `Identifier '${varName}' was used without being declared. In C++, every variable, function, or pin must be declared before use.`;
    suggestedFix = `// Declare '${varName}' before use, for example:\nint ${varName} = 0;`;
  } else if (safeTrace.includes("expected ';' before")) {
    explanation = "Missing semicolon ';' at the end of the previous statement.";
    suggestedFix = "; // Add missing semicolon to terminate statement";
  } else if (safeTrace.includes("No such file or directory")) {
    const fileMatch = safeTrace.match(/([a-zA-Z0-9_]+\.h): No such file or directory/);
    const fileName = fileMatch ? fileMatch[1] : "header";
    explanation = `Header '${fileName}' is missing. You need to install the required library before compiling.`;
    suggestedFix = `// Ensure the library providing '${fileName}' is installed via Library Manager`;
  }

  // If an active AI provider is connected, use real LLM reasoning!
  const active = getActiveProvider();
  if (active) {
    try {
      const sysPrompt = `You are Flash, the AI compiler error translator for FlashCode (an ultra-fast embedded systems IDE for microcontrollers).
Analyze the C++ compiler error trace and the user's sketch code.
Output a strict JSON object with EXACTLY these 3 keys:
- "explanation": a concise, 1-2 sentence human explanation of why the compiler failed.
- "suggested_fix": the EXACT corrected C++ line or code replacement that fixes the issue. No markdown fences.
- "line_number": integer line number where the issue occurred (or null).

Reply ONLY with valid raw JSON. Do not wrap in markdown or backticks.`;

      const usrPrompt = `Target Board: ${board?.name || "Microcontroller"}
Offending Line Number: ${lineNumber || "unknown"}
Compiler Error Trace:
${safeTrace}

User Code:
${code_snippet || ""}`;

      const raw = await callLLM(active, sysPrompt, usrPrompt, {
        maxTokens: 500,
        temperature: 0.1,
      });

      const cleaned = raw.replace(/^```json/i, "").replace(/^```/, "").replace(/```$/, "").trim();
      const parsed = JSON.parse(cleaned);
      if (parsed.explanation && parsed.suggested_fix) {
        explanation = parsed.explanation;
        suggestedFix = parsed.suggested_fix;
        if (parsed.line_number) lineNumber = parsed.line_number;
      }
    } catch (aiErr) {
      // Silently preserve regex heuristics if AI call fails
    }
  }

  return sendJson(res, {
    explanation,
    suggested_fix: suggestedFix,
    line_number: lineNumber,
  });
}

/**
 * 7.10 POST /api/ai/autocomplete (Real Inline Ghost-Text Autocompletion)
 */
export async function handleAIAutocomplete(req, res) {
  const { prompt, prefix, suffix, language } = await readBody(req);
  const active = getActiveProvider();

  if (!active) {
    // Heuristic fallback for common patterns
    const trimmed = (prefix || "").trimEnd();
    let completion = "";
    if (trimmed.endsWith("Serial.")) {
      completion = 'println("FlashCode Online");';
    } else if (trimmed.endsWith("pinMode(")) {
      completion = "2, OUTPUT);";
    } else if (trimmed.endsWith("digitalWrite(")) {
      completion = "2, HIGH);";
    }
    return sendJson(res, { completion });
  }

  try {
    const sysPrompt = `You are Flash inline code completion for embedded systems and C++ firmware.
Output ONLY the continuation code to complete the current line or statement.
Do NOT repeat the prefix. Do NOT output markdown code fences. Do NOT write explanations.
Only raw, clean C++ code.`;

    const usrPrompt = `Code before cursor:
${prefix || prompt || ""}

Code after cursor:
${suffix || ""}`;

    const completionRaw = await callLLM(active, sysPrompt, usrPrompt, {
      maxTokens: 35,
      temperature: 0.1,
      stop: ["\n\n", "void loop", "void setup"],
    });

    const completion = completionRaw.replace(/^```cpp/i, "").replace(/^```/, "").replace(/```$/, "").trim();
    return sendJson(res, { completion });
  } catch (e) {
    return sendJson(res, { completion: "" });
  }
}
