import { Component, onMount, onCleanup, createEffect } from "solid-js";
import * as monaco from "monaco-editor/esm/vs/editor/edcore.main";
import "monaco-editor/esm/vs/basic-languages/cpp/cpp.contribution";
import type { IDisposable } from "monaco-editor";
import { aiAutocomplete } from "../services/tauri";

interface EditorProps {
  code: string;
  fileId?: string;
  filePath?: string;
  onChange: (value: string) => void;
  onSave?: () => void;
  onEditorReady?: (getValue: () => string) => void;
}

export const Editor: Component<EditorProps> = (props) => {
  let editorContainer!: HTMLDivElement;
  let editorInstance: monaco.editor.IStandaloneCodeEditor | null = null;
  let inlineProviderDisposable: IDisposable | null = null;
  let isInternalChange = false;
  let lastFileId = "";

  // Reactively sync editor when fileId or code changes
  createEffect(() => {
    const currentCode = props.code;
    const currentFileId = props.fileId || "";

    if (!editorInstance) return;

    if (lastFileId !== currentFileId) {
      lastFileId = currentFileId;
      isInternalChange = true;
      editorInstance.setValue(currentCode);
      editorInstance.setPosition({ lineNumber: 1, column: 1 });
      editorInstance.setScrollPosition({ scrollTop: 0, scrollLeft: 0 });
      isInternalChange = false;
      return;
    }

    const currentVal = editorInstance.getValue();
    if (currentVal !== currentCode) {
      isInternalChange = true;
      const position = editorInstance.getPosition();
      editorInstance.setValue(currentCode);
      if (position) {
        editorInstance.setPosition(position);
      }
      isInternalChange = false;
    }
  });

  onMount(() => {
    // Define FlashCode High-Contrast Minimalist Dark Theme
    monaco.editor.defineTheme("flashcode-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "6B7280", fontStyle: "italic" },
        { token: "keyword", foreground: "00F0FF", fontStyle: "bold" },
        { token: "type", foreground: "60A5FA" },
        { token: "string", foreground: "34D399" },
        { token: "number", foreground: "FBBF24" },
        { token: "function", foreground: "A78BFA" },
      ],
      colors: {
        "editor.background": "#0F0F11",
        "editor.foreground": "#F4F4F5",
        "editor.lineHighlightBackground": "#18181B",
        "editorLineNumber.foreground": "#52525B",
        "editorLineNumber.activeForeground": "#00F0FF",
        "editorCursor.foreground": "#00F0FF",
        "editor.selectionBackground": "#27272A",
        "editor.inactiveSelectionBackground": "#1E1E22",
        "editorOverviewRuler.border": "#00000000",
        "editorOverviewRuler.background": "#0F0F11",
        "editorOverviewRuler.currentContentForeground": "#00000000",
        "editorOverviewRuler.selectionHighlightForeground": "#00000000",
        "editorOverviewRuler.wordHighlightForeground": "#00000000",
        "editorOverviewRuler.findMatchForeground": "#00000000",
        "scrollbar.shadow": "#00000000",
        "scrollbarSlider.background": "#27272A60",
        "scrollbarSlider.hoverBackground": "#3F3F4680",
        "scrollbarSlider.activeBackground": "#52525B",
      },
    });

    // Create Monaco Instance
    lastFileId = props.fileId || "";
    editorInstance = monaco.editor.create(editorContainer, {
      value: props.code,
      language: "cpp",
      theme: "flashcode-dark",
      fontSize: 14,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
      fontLigatures: true,
      lineNumbers: "on",
      minimap: {
        enabled: false,
      },
      overviewRulerBorder: false,
      overviewRulerLanes: 0,
      hideCursorInOverviewRuler: true,
      scrollbar: {
        vertical: "auto",
        verticalScrollbarSize: 8,
        horizontal: "auto",
        horizontalScrollbarSize: 8,
        useShadows: false,
        verticalHasArrows: false,
        horizontalHasArrows: false,
      },
      scrollBeyondLastLine: false,
      automaticLayout: true,
      tabSize: 2,
      renderLineHighlight: "all",
      cursorBlinking: "smooth",
      cursorSmoothCaretAnimation: "on",
      smoothScrolling: true,
      padding: { top: 12, bottom: 12 },
    });

    // Expose live getValue to parent
    if (props.onEditorReady) {
      props.onEditorReady(() => editorInstance?.getValue() ?? props.code);
    }

    // Track text changes
    editorInstance.onDidChangeModelContent(() => {
      if (editorInstance && !isInternalChange) {
        props.onChange(editorInstance.getValue());
      }
    });

    // Keyboard shortcut: Ctrl+S to save
    editorInstance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      if (props.onSave) {
        props.onSave();
      }
    });

    // Register Native AI Copilot Ghost Text Provider
    inlineProviderDisposable = monaco.languages.registerInlineCompletionsProvider("cpp", {
      provideInlineCompletions: async (model, position) => {
        const textBefore = model.getValueInRange({
          startLineNumber: 1,
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        });

        const textAfter = model.getValueInRange({
          startLineNumber: position.lineNumber,
          startColumn: position.column,
          endLineNumber: model.getLineCount(),
          endColumn: model.getLineMaxColumn(model.getLineCount()),
        });

        const currentLine = model.getLineContent(position.lineNumber);
        const prefix = currentLine.substring(0, position.column - 1);

        try {
          const completion = await aiAutocomplete(textBefore, prefix, textAfter);
          if (completion) {
            return {
              items: [
                {
                  insertText: completion,
                  range: new monaco.Range(
                    position.lineNumber,
                    position.column,
                    position.lineNumber,
                    position.column
                  ),
                },
              ],
            };
          }
        } catch (e) {
          console.debug("Copilot autocomplete error:", e);
        }

        return { items: [] };
      },
      freeInlineCompletions: () => {},
    });
  });

  onCleanup(() => {
    if (inlineProviderDisposable) {
      inlineProviderDisposable.dispose();
    }
    if (editorInstance) {
      editorInstance.dispose();
    }
  });

  return (
    <div class="relative w-full h-full overflow-hidden">
      <div ref={editorContainer} class="w-full h-full" />
    </div>
  );
};

export default Editor;
