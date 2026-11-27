import { Component, Show, For } from "solid-js";
import { AlertTriangle, Check, RefreshCw } from "lucide-solid";
import { ChatMessage, AgentAction } from "./types";

export interface AIChatMessageItemProps {
  msg: ChatMessage;
  onOpenProviders: () => void;
  onApplyCode: (code: string, reason?: string) => void;
  onCompile: (overrideCode?: string) => Promise<any>;
  onRevertCode: (action: AgentAction) => void;
  onAutoFixError: (errorText: string) => void;
  copiedCodeId: string | null;
  onSetCopiedCodeId: (id: string | null) => void;
  appliedCodeId: string | null;
  onSetAppliedCodeId: (id: string | null) => void;
}

export const AIChatMessageItem: Component<AIChatMessageItemProps> = (props) => {
  const isFlash = () => props.msg.role === "flash";

  // Parse markdown formatting in text
  const formatMarkdownText = (text: string) => {
    const lines = text.split("\n");
    return (
      <div class="space-y-1.5">
        <For each={lines}>
          {(line) => {
            if (!line.trim()) return <div class="h-1" />;
            const tokens = line.split(/(\*\*.*?\*\*|`.*?`)/g);
            return (
              <p class="leading-relaxed text-[#D4D4D8]">
                <For each={tokens}>
                  {(token) => {
                    if (token.startsWith("**") && token.endsWith("**")) {
                      return <strong class="font-semibold text-white">{token.slice(2, -2)}</strong>;
                    }
                    if (token.startsWith("`") && token.endsWith("`")) {
                      return (
                        <code class="px-1 py-0.5 rounded bg-[#27272A] text-[#00F0FF] text-[10px] font-mono mx-0.5">
                          {token.slice(1, -1)}
                        </code>
                      );
                    }
                    return <span>{token}</span>;
                  }}
                </For>
              </p>
            );
          }}
        </For>
      </div>
    );
  };

  const renderContent = () => {
    const isQuota =
      Boolean(props.msg.isQuotaExceeded) ||
      props.msg.text.toLowerCase().includes("quota") ||
      props.msg.text.toLowerCase().includes("rate limit") ||
      props.msg.text.toLowerCase().includes("resource_exhausted");

    if (isQuota) {
      return (
        <div class="rounded-lg bg-[#F59E0B]/10 border border-[#F59E0B]/25 p-2.5 space-y-1.5 text-[11px]">
          <div class="flex items-center justify-between text-[#F59E0B] font-semibold text-[11px]">
            <div class="flex items-center gap-1.5">
              <AlertTriangle size={13} class="shrink-0 text-[#F59E0B]" />
              <span>Quota limit reached</span>
            </div>
            <button
              type="button"
              onClick={props.onOpenProviders}
              class="text-[10px] text-[#00F0FF] hover:underline cursor-pointer"
            >
              Settings
            </button>
          </div>
          <p class="text-[#D4D4D8] text-[10.5px] leading-relaxed font-sans">
            {props.msg.text.includes("All configured")
              ? "All configured AI providers have reached their rate limit or quota. Please try again later or add another provider in Settings."
              : (props.msg.text.replace(/Flash error communicating with [^:]+:\s*/i, "").replace(/\{[\s\S]*\}/, "").trim() || "Rate limit reached. Please try again later or switch providers.")}
          </p>
        </div>
      );
    }

    const isGenericError = props.msg.text.startsWith("Flash error communicating with") || props.msg.text.includes("Provider API error");
    if (isGenericError) {
      const cleanErr = props.msg.text.replace(/Flash error communicating with [^:]+:\s*/i, "").replace(/\{[\s\S]*\}/, "").trim();
      const shortErr = cleanErr.length > 150 ? cleanErr.slice(0, 150) + "..." : cleanErr;

      return (
        <div class="rounded-lg bg-[#EF4444]/10 border border-[#EF4444]/25 p-2.5 space-y-1 text-[11px]">
          <div class="flex items-center justify-between text-[#EF4444] font-semibold text-[11px]">
            <div class="flex items-center gap-1.5">
              <AlertTriangle size={13} class="shrink-0" />
              <span>Provider Notice</span>
            </div>
            <button
              type="button"
              onClick={props.onOpenProviders}
              class="text-[10px] text-[#00F0FF] hover:underline cursor-pointer"
            >
              Settings
            </button>
          </div>
          <p class="text-[#D4D4D8] text-[10.5px] leading-relaxed font-sans break-words">
            {shortErr || "Connection error. Please verify your provider settings."}
          </p>
        </div>
      );
    }

    // If this message applied code to the editor, strictly do not render any code blocks inside chat
    const hasAppliedCode = props.msg.actions?.some((a) => a.type === "edit_code");
    const rawText = hasAppliedCode
      ? props.msg.text.replace(/```[\s\S]*?```/gi, "").replace(/^#{1,6}\s+.*$/gm, "").trim()
      : props.msg.text;

    const parts = (rawText || (hasAppliedCode ? "I have updated the sketch in your editor." : "")).split(/(```[\s\S]*?```)/g);

    return (
      <div class="space-y-2 text-[11px] leading-relaxed">
        <Show when={props.msg.autoSwitchedFrom}>
          <div class="inline-flex items-center px-2 py-0.5 rounded bg-[#00F0FF]/10 border border-[#00F0FF]/25 text-[#00F0FF] text-[9.5px] font-sans font-medium">
            Auto-switched from {props.msg.autoSwitchedFrom} to {props.msg.providerName || "fallback"} (quota reached)
          </div>
        </Show>
        <For each={parts}>
          {(part, idx) => {
            if (part.startsWith("```")) {
              const lines = part.slice(3, -3).trim().split("\n");
              const lang = lines[0].match(/^[a-z0-9_-]+/i) ? lines[0] : "cpp";
              const codeBody = lines[0].match(/^[a-z0-9_-]+/i)
                ? lines.slice(1).join("\n")
                : lines.join("\n");
              const codeId = `${props.msg.id}-${idx()}`;

              return (
                <div class="rounded-lg border border-[#27272A] bg-[#0A0A0C] overflow-hidden my-2 shadow-sm">
                  <div class="px-2.5 py-1 bg-[#18181B] border-b border-[#27272A] flex items-center justify-between text-[10px] text-[#A1A1AA]">
                    <span class="font-mono uppercase font-semibold text-[#00F0FF]">{lang || "C++"}</span>
                    <div class="flex items-center gap-1.5">
                      {/* Copy Code */}
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(codeBody);
                          props.onSetCopiedCodeId(codeId);
                          setTimeout(() => props.onSetCopiedCodeId(null), 1500);
                        }}
                        class="px-1.5 py-0.5 rounded bg-[#27272A] hover:bg-[#3F3F46] text-[#E4E4E7] transition-colors cursor-pointer text-[10px]"
                        title="Copy Code"
                      >
                        {props.copiedCodeId === codeId ? "Copied" : "Copy"}
                      </button>

                      {/* Apply to Editor Button */}
                      <button
                        type="button"
                        onClick={() => {
                          props.onApplyCode(codeBody, "Applied code block from Flash");
                          props.onSetAppliedCodeId(codeId);
                          setTimeout(() => props.onSetAppliedCodeId(null), 2000);
                        }}
                        class="px-2 py-0.5 rounded bg-[#00F0FF]/20 hover:bg-[#00F0FF]/30 text-[#00F0FF] transition-colors cursor-pointer font-medium text-[10px]"
                        title="Apply this code to the active sketch"
                      >
                        {props.appliedCodeId === codeId ? "Applied!" : "Apply"}
                      </button>

                      {/* Apply & Verify */}
                      <button
                        type="button"
                        onClick={async () => {
                          props.onApplyCode(codeBody, "Applied and verifying...");
                          await props.onCompile(codeBody);
                        }}
                        class="px-1.5 py-0.5 rounded bg-[#10B981]/20 hover:bg-[#10B981]/30 text-[#34D399] transition-colors cursor-pointer text-[10px]"
                        title="Apply code and immediately verify with compiler"
                      >
                        Verify
                      </button>
                    </div>
                  </div>
                  <pre class="p-2.5 text-[11px] font-mono text-[#38F9D7] overflow-x-auto whitespace-pre leading-relaxed">
                    {codeBody}
                  </pre>
                </div>
              );
            }
            return formatMarkdownText(part);
          }}
        </For>

        {/* Render Agent Actions executed for this message */}
        <Show when={props.msg.actions && props.msg.actions.length > 0}>
          <div class="mt-2.5 space-y-1.5 pt-1 border-t border-[#27272A]/80">
            <For each={props.msg.actions}>
              {(action) => {
                const isSuccess = () => action.status === "success";
                const isFailed = () => action.status === "failed";
                const isRunning = () => action.status === "running";

                return (
                  <div
                    class={`p-2 rounded-lg border text-[11px] flex items-center justify-between transition-all ${
                      isSuccess()
                        ? "bg-[#10B981]/10 border-[#10B981]/30 text-[#34D399]"
                        : isFailed()
                        ? "bg-[#EF4444]/10 border-[#EF4444]/30 text-[#EF4444]"
                        : "bg-[#00F0FF]/10 border-[#00F0FF]/30 text-[#00F0FF]"
                    }`}
                  >
                    <div class="flex items-center gap-2">
                      <Show when={isRunning()}>
                        <RefreshCw size={12} class="animate-spin text-[#00F0FF]" />
                      </Show>
                      <Show when={isSuccess()}>
                        <Check size={12} class="text-[#34D399]" />
                      </Show>
                      <Show when={isFailed()}>
                        <AlertTriangle size={12} class="text-[#EF4444]" />
                      </Show>

                      <div class="font-sans font-medium text-[11px]">
                        <span>{action.label}</span>
                        <Show when={action.elapsed_ms}>
                          <span class="text-[9px] opacity-75 ml-1 font-mono">({action.elapsed_ms}ms)</span>
                        </Show>
                      </div>
                    </div>

                    <div class="flex items-center gap-1.5">
                      {/* Undo Edit Button */}
                      <Show when={action.type === "edit_code" && action.previousCode}>
                        <button
                          type="button"
                          onClick={() => props.onRevertCode(action)}
                          class="px-2 py-0.5 rounded bg-[#27272A] hover:bg-[#3F3F46] text-[#E4E4E7] text-[10px] font-sans transition-colors cursor-pointer"
                          title="Revert to previous code before AI edit"
                        >
                          Undo
                        </button>
                      </Show>

                      {/* Auto-Fix if Compile Failed */}
                      <Show when={action.type === "compile" && isFailed() && action.error}>
                        <button
                          type="button"
                          onClick={() =>
                            props.onAutoFixError(
                              `The compiler returned this error:\n${action.error}\n\nPlease fix the code in sketch.ino and compile again.`
                            )
                          }
                          class="px-2 py-0.5 rounded bg-[#EF4444] hover:bg-[#DC2626] text-white text-[10px] font-sans font-semibold transition-colors cursor-pointer"
                        >
                          Auto-Fix with Flash
                        </button>
                      </Show>
                    </div>
                  </div>
                );
              }}
            </For>
          </div>
        </Show>
      </div>
    );
  };

  return (
    <div
      class={`flex flex-col ${
        isFlash() ? "items-start" : "items-end"
      }`}
    >
      <div class="flex items-center gap-1.5 mb-1 text-[9px] text-[#71717A] px-1">
        <Show when={isFlash()}>
          <span class="text-[#00F0FF] font-medium">Flash Agent</span>
          <Show when={props.msg.model}>
            {(model) => (
              <span class="text-[#52525B] font-mono text-[8.5px]">({model().split("/").pop()})</span>
            )}
          </Show>
        </Show>
        <Show when={!isFlash()}>
          <span>You</span>
        </Show>
      </div>
      <div
        class={`p-3 rounded-2xl ${
          isFlash()
            ? "bg-[#18181B] border border-[#27272A] text-white rounded-tl-sm max-w-full"
            : "bg-[#202025] border border-[#2E2E36] text-white rounded-br-sm max-w-[88%]"
        }`}
      >
        {renderContent()}
      </div>
    </div>
  );
};
