"use client";

import { useCallback, useEffect, useState } from "react";

type Theme = "light" | "dark";
const STORAGE_KEY = "theme";

/** 主题是全局单例状态：多个组件实例必须共享同一份，否则互相覆盖 localStorage。
 * 用模块级 store + 订阅实现（无外部依赖）。
 */
let currentTheme: Theme = "light";
let initialized = false;
const listeners = new Set<(theme: Theme) => void>();

function readStoredTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (saved === "dark" || saved === "light") return saved;
  return "light"; // 默认浅色（DESIGN.md §9.2）
}

function ensureInitialized(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  currentTheme = readStoredTheme();
  document.documentElement.setAttribute("data-theme", currentTheme);
}

function applyTheme(theme: Theme): void {
  currentTheme = theme;
  if (typeof window !== "undefined") {
    document.documentElement.setAttribute("data-theme", theme);
    window.localStorage.setItem(STORAGE_KEY, theme);
  }
  for (const listener of listeners) {
    try {
      listener(theme);
    } catch {
      // 单个订阅者异常不影响其他订阅者
    }
  }
}

/** 主题切换：html 上切换 data-theme="dark"，存 localStorage（DESIGN.md §9.2） */
export function useTheme() {
  // 首屏（SSR + CSR hydration）恒为 "light"：ThemeToggle 的 aria-label / 图标 /
  // Tooltip 文案都跟着 theme 走，若在渲染期读 localStorage 就会让两端 DOM 不一致，
  // 触发 React #418（hydration mismatch，CI 浏览器 E2E 偶发捕获）。
  // 真实主题由 <head> 的同步脚本在 hydration 之前写到 <html data-theme>（无 FOUC），
  // React state 只负责图标，挂载后再对齐即可。
  const [theme, setThemeState] = useState<Theme>("light");

  useEffect(() => {
    ensureInitialized(); // 挂载后才读 localStorage / 写 data-theme
    const listener = (next: Theme) => setThemeState(next);
    listeners.add(listener);
    // 挂载时同步一次当前值（期间可能已被其他实例改过）
    setThemeState(currentTheme);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const setTheme = useCallback((next: Theme) => {
    applyTheme(next);
  }, []);

  const toggleTheme = useCallback(() => {
    applyTheme(currentTheme === "light" ? "dark" : "light");
  }, []);

  return { theme, resolvedTheme: theme, toggleTheme, setTheme };
}
