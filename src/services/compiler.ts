import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "./utils";
import { getCurrentWindowLabel } from "./hardware";

export interface BuildResult {
  success: boolean;
  elapsed_ms: number;
  stdout: string;
  stderr: string;
  ccache_used: boolean;
  cached_build: boolean;
  ccache_hit?: boolean;
  turbo?: boolean;
}

export interface UploadStreamEvent {
  type: "info" | "stdout" | "stderr" | "warning" | "error" | "done";
  message: string;
  success?: boolean;
  elapsed_ms?: number;
  stdout?: string;
  stderr?: string;
}

// Standard Arduino IDE clean sketch template
export const DEFAULT_SKETCH = `void setup() {
  // put your setup code here, to run once:

}

void loop() {
  // put your main code here, to run repeatedly:

}
`;

export async function compileSketch(
  code: string,
  fqbn: string,
  mode: "verify" | "full" = "verify",
  files?: { name: string; content: string }[],
  signal?: AbortSignal
): Promise<BuildResult> {
  if (isTauri()) {
    try {
      return await invoke<BuildResult>("compile_sketch", {
        code,
        fqbn,
        files: files || null,
        windowLabel: getCurrentWindowLabel(),
      });
    } catch (e) {
      console.warn("Tauri invoke failed, falling back to real API:", e);
    }
  }

  // Real compilation via FlashCode Engine
  const res = await fetch("/api/compile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, fqbn, mode, files }),
    signal,
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Engine error HTTP ${res.status}`);
  }

  return await res.json();
}

export async function prewarmBoard(
  fqbn: string,
  code?: string,
  files?: { name: string; content: string }[],
  signal?: AbortSignal
): Promise<void> {
  try {
    await fetch("/api/prewarm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fqbn, code: code || "", files }),
      signal,
    });
  } catch (e) {
    // Background prewarm is non-blocking
  }
}

export async function uploadSketch(
  code: string,
  fqbn: string,
  port: string,
  files?: { name: string; content: string }[],
  onProgress?: (line: string, type: string) => void,
  uploadSpeed?: number | string,
  signal?: AbortSignal
): Promise<BuildResult> {
  if (isTauri()) {
    try {
      return await invoke<BuildResult>("upload_sketch", {
        code,
        fqbn,
        port,
        files: files || null,
        uploadSpeed: uploadSpeed !== undefined && uploadSpeed !== "auto" ? String(uploadSpeed) : null,
        windowLabel: getCurrentWindowLabel(),
      });
    } catch (e) {
      console.warn("Tauri invoke failed, falling back to real API:", e);
    }
  }

  // Real upload via FlashCode Engine with real-time streaming
  const res = await fetch("/api/upload", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/x-ndjson, application/json",
    },
    body: JSON.stringify({ code, fqbn, port, files, uploadSpeed }),
    signal,
  });

  if (!res.ok && !res.body) {
    const errText = await res.text();
    return {
      success: false,
      elapsed_ms: 0,
      stdout: "",
      stderr: errText || "HTTP error during upload",
      ccache_used: false,
      cached_build: false,
    };
  }

  // Handle NDJSON streaming if response body reader is available
  if (res.body && typeof res.body.getReader === "function") {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finalResult: BuildResult = {
      success: false,
      elapsed_ms: 0,
      stdout: "",
      stderr: "",
      ccache_used: false,
      cached_build: false,
    };
    let fullStdout = "";
    let fullStderr = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const ev: UploadStreamEvent = JSON.parse(line);
          if (ev.type === "done") {
            finalResult = {
              success: Boolean(ev.success),
              elapsed_ms: ev.elapsed_ms || 0,
              stdout: ev.stdout || fullStdout,
              stderr: ev.stderr || fullStderr,
              ccache_used: false,
              cached_build: false,
            };
          } else {
            if (ev.type === "stderr") fullStderr += ev.message + "\n";
            else fullStdout += ev.message + "\n";

            if (onProgress && ev.message) {
              onProgress(ev.message, ev.type);
            }
          }
        } catch (e) {
          if (onProgress) onProgress(line, "stdout");
        }
      }
    }

    if (buffer.trim()) {
      try {
        const ev = JSON.parse(buffer);
        if (ev.type === "done") {
          finalResult = {
            success: Boolean(ev.success),
            elapsed_ms: ev.elapsed_ms || 0,
            stdout: ev.stdout || fullStdout,
            stderr: ev.stderr || fullStderr,
            ccache_used: false,
            cached_build: false,
          };
        }
      } catch (e) {}
    }

    return finalResult;
  }

  return await res.json();
}
