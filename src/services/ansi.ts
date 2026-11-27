/**
 * FlashCode High-Performance ANSI Terminal Escape Code Parser
 * Supports 16-color ANSI, bold, reset, and escape code stripping.
 */

export interface AnsiSpan {
  text: string;
  color?: string;
  bold?: boolean;
}

const ANSI_COLOR_MAP: Record<number, string> = {
  30: "text-[#71717A]", // Black / Dark Gray
  31: "text-[#F87171]", // Red
  32: "text-[#34D399]", // Green
  33: "text-[#FBBF24]", // Yellow
  34: "text-[#60A5FA]", // Blue
  35: "text-[#F472B6]", // Magenta
  36: "text-[#22D3EE]", // Cyan
  37: "text-[#E4E4E7]", // White / Light Gray

  // Bright variants
  90: "text-[#A1A1AA]", // Bright Black / Gray
  91: "text-[#EF4444]", // Bright Red
  92: "text-[#10B981]", // Bright Green
  93: "text-[#F59E0B]", // Bright Yellow
  94: "text-[#38BDF8]", // Bright Blue
  95: "text-[#E879F9]", // Bright Magenta
  96: "text-[#00F0FF]", // Bright Cyan
  97: "text-[#FFFFFF]", // Bright White
};

// Fast check for ANSI escape prefix
export function hasAnsi(str: string): boolean {
  return str.includes("\x1b[");
}

// Strip all ANSI escape sequences for search filtering and plain text copy
const ANSI_REGEX = /\x1b\[[0-9;]*[a-zA-Z]/g;
export function stripAnsi(str: string): string {
  if (!str.includes("\x1b")) return str;
  return str.replace(ANSI_REGEX, "");
}

/**
 * Parses an ANSI formatted string into an array of styled spans.
 * Falls back to single span if no ANSI codes are present.
 */
export function parseAnsiLine(line: string): AnsiSpan[] {
  if (!hasAnsi(line)) {
    return [{ text: line }];
  }

  const spans: AnsiSpan[] = [];
  const regex = /\x1b\[([0-9;]*)m/g;
  let lastIndex = 0;
  let currentColor: string | undefined = undefined;
  let currentBold = false;

  let match: RegExpExecArray | null;
  while ((match = regex.exec(line)) !== null) {
    const textBefore = line.slice(lastIndex, match.index);
    if (textBefore) {
      spans.push({
        text: textBefore,
        color: currentColor,
        bold: currentBold,
      });
    }

    const codeStr = match[1];
    if (!codeStr || codeStr === "0") {
      currentColor = undefined;
      currentBold = false;
    } else {
      const codes = codeStr.split(";").map((c) => parseInt(c, 10));
      for (const code of codes) {
        if (code === 0) {
          currentColor = undefined;
          currentBold = false;
        } else if (code === 1) {
          currentBold = true;
        } else if (code === 22) {
          currentBold = false;
        } else if (code === 39) {
          currentColor = undefined;
        } else if (ANSI_COLOR_MAP[code]) {
          currentColor = ANSI_COLOR_MAP[code];
        }
      }
    }

    lastIndex = regex.lastIndex;
  }

  const remaining = line.slice(lastIndex);
  if (remaining) {
    // Strip any non-color ANSI codes (like cursor movement or clear screen)
    const cleanRemaining = remaining.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
    if (cleanRemaining) {
      spans.push({
        text: cleanRemaining,
        color: currentColor,
        bold: currentBold,
      });
    }
  }

  return spans.length > 0 ? spans : [{ text: line }];
}
