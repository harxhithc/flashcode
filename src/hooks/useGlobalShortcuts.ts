import { onMount, onCleanup } from "solid-js";

export interface GlobalShortcutsHandlers {
  onSave: () => void;
  onSaveAs: () => void;
  onOpenFile: () => void;
  onNewFile: () => void;
  onNewWindow?: () => void;
  onCloseFile: () => void;
  onCloseSketch?: () => void;
  onCompile: () => void;
  onUpload: () => void;
  toggleFullscreen: () => void;
}

export function useGlobalShortcuts(handlers: GlobalShortcutsHandlers) {
  // Prevent browser context menu on app chrome, toolbars, and background
  const handleContextMenu = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target && target.closest("input, textarea, .monaco-editor, [contenteditable='true']")) {
      return;
    }
    e.preventDefault();
  };

  // Prevent browser Ctrl+wheel zooming
  const handleWheel = (e: WheelEvent) => {
    if (e.ctrlKey) {
      e.preventDefault();
    }
  };

  const handleGlobalKeyDown = (e: KeyboardEvent) => {
    // F11 toggles borderless fullscreen seamlessly
    if (e.key === "F11") {
      e.preventDefault();
      handlers.toggleFullscreen();
      return;
    }

    if (e.ctrlKey || e.metaKey) {
      if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        if (e.shiftKey) {
          handlers.onSaveAs();
        } else {
          handlers.onSave();
        }
      } else if (e.key === "o" || e.key === "O") {
        e.preventDefault();
        handlers.onOpenFile();
      } else if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        if (e.shiftKey) {
          handlers.onNewWindow?.();
        } else {
          handlers.onNewFile();
        }
      } else if (e.key === "w" || e.key === "W") {
        e.preventDefault();
        if (e.shiftKey) {
          handlers.onCloseSketch?.();
        } else {
          handlers.onCloseFile();
        }
      } else if (e.key === "b" || e.key === "B" || e.key === "r" || e.key === "R") {
        e.preventDefault();
        handlers.onCompile();
      } else if (e.key === "u" || e.key === "U") {
        e.preventDefault();
        handlers.onUpload();
      }
    }
  };

  onMount(() => {
    window.addEventListener("keydown", handleGlobalKeyDown);
    window.addEventListener("contextmenu", handleContextMenu);
    window.addEventListener("wheel", handleWheel, { passive: false });
  });

  onCleanup(() => {
    window.removeEventListener("keydown", handleGlobalKeyDown);
    window.removeEventListener("contextmenu", handleContextMenu);
    window.removeEventListener("wheel", handleWheel);
  });
}
