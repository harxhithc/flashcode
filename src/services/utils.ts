export const isTauri = (): boolean => {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
};

/**
 * Safely parses JSON response from fetch, guarding against HTML SPA fallback responses
 */
export async function safeFetchJson<T>(res: Response): Promise<T | null> {
  if (!res || !res.ok) return null;
  const ctype = res.headers.get("content-type") || "";
  if (!ctype.includes("application/json")) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Strips markdown code fences (```cpp, ```c++, ```arduino, ```) and stray backticks
 * ensuring pure, compilable C++ code is applied to the editor buffer.
 */
export function sanitizeCppCode(raw: string): string {
  if (!raw) return "";
  let clean = raw.trim();

  // 1. Strip outer markdown code blocks ```cpp ... ```
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

  // 2. Extra safety: If line 1 is literally just "```" or "```cpp" or similar, drop it
  const lines = clean.split("\n");
  while (lines.length > 0 && /^```(?:cpp|c\+\+|c|arduino|ino|text)?\s*$/i.test(lines[0].trim())) {
    lines.shift();
  }
  while (lines.length > 0 && /^```\s*$/i.test(lines[lines.length - 1].trim())) {
    lines.pop();
  }

  return lines.join("\n").trim();
}
