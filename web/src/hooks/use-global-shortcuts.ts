"use client";

import { useEffect } from "react";
import {
  QUICK_ADD_EVENT,
  isTypingTarget,
  resolveShortcut,
  type ShortcutAction,
} from "@/lib/shortcuts";

/**
 * 全局键盘监听（挂在 AppShell 上，跨所有内页持续有效）。
 * Esc 由 Radix Dialog 自行处理，这里不接管。
 * 单键快捷键在输入框聚焦 / 已有弹层打开时自动失效。
 */
export function useGlobalShortcuts(opts: {
  overlayOpen: boolean;
  onAction: (action: ShortcutAction) => void;
}) {
  const { overlayOpen, onAction } = opts;

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const action = resolveShortcut(e, {
        typing: isTypingTarget(e.target),
        overlayOpen,
      });
      if (!action) return;
      e.preventDefault();
      if (action === "quick-add") {
        window.dispatchEvent(new CustomEvent(QUICK_ADD_EVENT));
      }
      onAction(action);
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [overlayOpen, onAction]);
}
