"use client";

/**
 * themeMode.ts —— 免费深色模式的三态偏好（跟随系统 / 亮 / 暗）。
 *
 * 与美妆主题（equippedTheme）互相独立：
 *   - 购买的暗色美妆主题（isDark）永远「强制暗色」，覆盖这里的偏好；
 *   - 其余情况按这里的三态决定是否挂 .theme-dark（night 色板）。
 *
 * 存储在 localStorage（THEME_MODE_KEY），首屏由 layout.tsx 的内联脚本
 * 提前读取并挂类，防止白闪。
 */

import { useSyncExternalStore } from "react";

export type ThemeMode = "system" | "light" | "dark";

export const THEME_MODE_KEY = "csf-theme-mode";

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach(l => l());
}

export function getThemeMode(): ThemeMode {
  if (typeof window === "undefined") return "system";
  const raw = window.localStorage.getItem(THEME_MODE_KEY);
  return raw === "light" || raw === "dark" ? raw : "system";
}

export function setThemeMode(mode: ThemeMode) {
  if (typeof window === "undefined") return;
  if (mode === "system") window.localStorage.removeItem(THEME_MODE_KEY);
  else window.localStorage.setItem(THEME_MODE_KEY, mode);
  emit();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  // 其他标签页改了偏好也同步
  const onStorage = (e: StorageEvent) => {
    if (e.key === THEME_MODE_KEY) cb();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

/** 响应式读取当前三态偏好 */
export function useThemeMode(): ThemeMode {
  return useSyncExternalStore(subscribe, getThemeMode, () => "system" as ThemeMode);
}

/** 系统是否偏好深色（响应式） */
export function useSystemPrefersDark(): boolean {
  return useSyncExternalStore(
    cb => {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
    () => false,
  );
}
