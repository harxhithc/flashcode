import type { AIProviderPreset } from "./ai";

export const PRESET_PROVIDERS: AIProviderPreset[] = [
  {
    "id": "groq",
    "name": "Groq",
    "tagline": "Ultra-Fast LPU (~500 t/s)",
    "description": "Instant response times. Best for real-time inline ghost-text and instant error fixes.",
    "keyUrl": "https://console.groq.com/keys",
    "keyPlaceholder": "gsk_...",
    "defaultBaseUrl": "https://api.groq.com/openai/v1",
    "defaultModel": "qwen/qwen3.8-27b",
    "topModels": [
      {
        "id": "qwen/qwen3.8-27b",
        "name": "Qwen 3.8 27B",
        "tag": "Recommended",
        "desc": "High accuracy multilingual code model on Groq LPU"
      },
      {
        "id": "openai/gpt-oss-120b",
        "name": "GPT-OSS 120B",
        "tag": "Flagship",
        "desc": "Flagship open weights 120B reasoning model"
      },
      {
        "id": "openai/gpt-oss-20b",
        "name": "GPT-OSS 20B",
        "tag": "Fastest",
        "desc": "Ultra-fast code generation on Groq LPU (~500 t/s)"
      }
    ],
    "models": [
      "qwen/qwen3.8-27b",
      "openai/gpt-oss-120b",
      "openai/gpt-oss-20b"
    ],
    "requiresKey": true,
    "protocol": "openai"
  },
  {
    "id": "gemini",
    "name": "Google Gemini",
    "tagline": "Generous Free Tier",
    "description": "Massive context and strong code reasoning with a generous free API tier.",
    "keyUrl": "https://aistudio.google.com/app/apikey",
    "keyPlaceholder": "AIzaSy...",
    "defaultBaseUrl": "https://generativelanguage.googleapis.com/v1beta/openai",
    "defaultModel": "gemini-3.8-flash",
    "topModels": [
      {
        "id": "gemini-3.8-flash",
        "name": "Gemini 3.8 Flash",
        "tag": "Recommended",
        "desc": "Flagship next-gen speed, coding accuracy & low latency"
      },
      {
        "id": "gemini-3.7-flash",
        "name": "Gemini 3.7 Flash",
        "tag": "Fastest",
        "desc": "Ultra-low latency real-time firmware assistant"
      },
      {
        "id": "gemini-3.1-pro-preview",
        "name": "Gemini 3.1 Pro",
        "tag": "Deep Reasoning",
        "desc": "Massive context deep reasoning for complex architecture"
      }
    ],
    "models": [
      "gemini-3.8-flash",
      "gemini-3.7-flash",
      "gemini-3.1-pro-preview",
      "gemini-3.1-flash-lite",
      "gemini-3.5-flash",
      "gemini-2.5-flash",
      "gemini-2.5-pro",
      "gemini-2.0-flash"
    ],
    "requiresKey": true,
    "protocol": "openai"
  },
  {
    "id": "openai",
    "name": "OpenAI",
    "tagline": "o3-mini & GPT-4o",
    "description": "Industry leading accuracy for embedded C++ and system architectures.",
    "keyUrl": "https://platform.openai.com/api-keys",
    "keyPlaceholder": "sk-proj-...",
    "defaultBaseUrl": "https://api.openai.com/v1",
    "defaultModel": "o3-mini",
    "topModels": [
      {
        "id": "o3-mini",
        "name": "o3-mini",
        "tag": "Recommended",
        "desc": "Deep reasoning for race conditions, ISRs, timing bugs & C++ logic"
      },
      {
        "id": "gpt-4o",
        "name": "GPT-4o",
        "tag": "Flagship",
        "desc": "Maximum coding intelligence across all architectures"
      },
      {
        "id": "gpt-4o-mini",
        "name": "GPT-4o Mini",
        "tag": "Fastest",
        "desc": "Fast, cost-efficient, high C++ accuracy"
      }
    ],
    "models": [
      "o3-mini",
      "gpt-4o",
      "gpt-4o-mini",
      "o1-mini",
      "o1"
    ],
    "requiresKey": true,
    "protocol": "openai"
  },
  {
    "id": "claude",
    "name": "Anthropic Claude",
    "tagline": "Claude 3.7 Sonnet",
    "description": "Superior firmware pointer logic, memory analysis, and nuanced bug explanations.",
    "keyUrl": "https://console.anthropic.com/settings/keys",
    "keyPlaceholder": "sk-ant-api03-...",
    "defaultBaseUrl": "https://api.anthropic.com/v1",
    "defaultModel": "claude-3-7-sonnet-latest",
    "topModels": [
      {
        "id": "claude-3-7-sonnet-latest",
        "name": "Claude 3.7 Sonnet",
        "tag": "Recommended",
        "desc": "Hybrid reasoning & world-class C/C++ embedded accuracy"
      },
      {
        "id": "claude-3-5-sonnet-latest",
        "name": "Claude 3.5 Sonnet",
        "tag": "Top Accuracy",
        "desc": "Gold standard for pointer logic, ISRs & memory bugs"
      },
      {
        "id": "claude-3-5-haiku-latest",
        "name": "Claude 3.5 Haiku",
        "tag": "Fastest",
        "desc": "Near-instant responses, concise error explanations"
      }
    ],
    "models": [
      "claude-3-7-sonnet-latest",
      "claude-3-5-sonnet-latest",
      "claude-3-5-haiku-latest",
      "claude-3-opus-latest"
    ],
    "requiresKey": true,
    "protocol": "anthropic"
  },
  {
    "id": "nvidia",
    "name": "NVIDIA NIM",
    "tagline": "GPU Accelerated",
    "description": "Enterprise open models accelerated by NVIDIA TensorRT-LLM infrastructure.",
    "keyUrl": "https://build.nvidia.com",
    "keyPlaceholder": "nvapi-...",
    "defaultBaseUrl": "https://integrate.api.nvidia.com/v1",
    "defaultModel": "mistralai/codestral-22b-instruct-v0.1",
    "topModels": [
      {
        "id": "mistralai/codestral-22b-instruct-v0.1",
        "name": "Mistral Codestral 22B",
        "tag": "Recommended",
        "desc": "Mistral's world-class C/C++ embedded code model"
      },
      {
        "id": "nvidia/llama-3.1-nemotron-70b-instruct",
        "name": "Llama 3.1 Nemotron 70B",
        "tag": "Flagship",
        "desc": "NVIDIA TensorRT-LLM accelerated 70B flagship"
      },
      {
        "id": "deepseek-ai/deepseek-coder-6.7b-instruct",
        "name": "DeepSeek Coder 6.7B",
        "tag": "Coding",
        "desc": "DeepSeek specialized code & firmware model"
      }
    ],
    "models": [
      "mistralai/codestral-22b-instruct-v0.1",
      "nvidia/llama-3.1-nemotron-70b-instruct",
      "deepseek-ai/deepseek-coder-6.7b-instruct",
      "deepseek-ai/deepseek-v4.1-flash",
      "mistralai/mistral-large-2-instruct",
      "meta/codellama-70b",
      "google/codegemma-7b",
      "openai/gpt-oss-20b"
    ],
    "requiresKey": true,
    "protocol": "openai"
  },
  {
    "id": "ollama",
    "name": "Local Ollama",
    "tagline": "100% Private Offline",
    "description": "Runs entirely on your local machine. Zero internet access, zero API keys, 100% private.",
    "keyUrl": "https://ollama.com",
    "keyPlaceholder": "No API key needed",
    "defaultBaseUrl": "http://localhost:11434/v1",
    "defaultModel": "qwen2.5-coder",
    "topModels": [
      {
        "id": "qwen2.5-coder",
        "name": "Qwen 2.5 Coder",
        "tag": "Recommended",
        "desc": "Top open-source coding model, specialized for C/C++"
      },
      {
        "id": "deepseek-coder-v2",
        "name": "DeepSeek Coder V2",
        "tag": "Architecture",
        "desc": "Deep firmware reasoning, local & private"
      },
      {
        "id": "llama3.2",
        "name": "Llama 3.2",
        "tag": "Lightweight",
        "desc": "Fast CPU/GPU execution for low-spec machines"
      }
    ],
    "models": [
      "qwen2.5-coder",
      "deepseek-coder-v2",
      "llama3.2",
      "codellama"
    ],
    "requiresKey": false,
    "protocol": "openai"
  }
];
