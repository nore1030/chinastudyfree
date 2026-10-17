"use client";

/**
 * ThemeProvider —— 三态深色模式 + 美妆主题的统一应用层。
 *
 * 深色的三个来源（优先级从高到低）：
 *   1. 装备了暗色美妆主题（theme_midnight / theme_obsidian，isDark）
 *      → 「强制暗色」，用主题自带的色板覆盖同一套 --app-* token
 *   2. 免费三态偏好 = dark（手动开关）
 *   3. 免费三态偏好 = system 且系统 prefers-color-scheme: dark
 *   后两种情况只挂 .theme-dark 类，night 色板（与 iOS DuoColors 同 hex：
 *   bg #131F24 / surface #202F36 / border #37464F）由 globals.css 提供缺省值。
 *
 * 亮色美妆主题只影响 --theme-primary / --theme-accent / --theme-bg 等
 * 强调色；处于深色时保留强调色、页面底色走 night token。
 *
 * .theme-dark 类挂在 <html> 上 —— layout.tsx 的首屏内联脚本会在水合前
 * 先挂好，防止白闪；这里负责水合后的响应式维护。
 *
 * 同时挂载全局 <MotionConfig reducedMotion="user">，让所有 framer-motion
 * 动画尊重系统「减少动态效果」设置。
 */

import { useEffect } from "react";
import { MotionConfig } from "framer-motion";
import { useProgressStore } from "@/store/progress";
import { getCosmeticById, type UiTheme } from "@/lib/cosmetics";
import { useThemeMode, useSystemPrefersDark } from "@/lib/themeMode";

const NIGHT_BG = "#131F24";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const themeId = useProgressStore(s => s.equippedTheme);
  const mode = useThemeMode();
  const systemDark = useSystemPrefersDark();

  useEffect(() => {
    const item = getCosmeticById(themeId) as UiTheme | undefined;
    if (!item || item.type !== "ui_theme") return;
    const d = item.data;
    const root = document.documentElement;

    // 强调色永远跟随装备的美妆主题
    root.style.setProperty("--theme-primary", d.primary);
    root.style.setProperty("--theme-primary-dark", d.primaryDark);
    root.style.setProperty("--theme-accent", d.accent);
    root.style.setProperty("--theme-bg", d.bg);

    const freeDark = mode === "dark" || (mode === "system" && systemDark);
    const isDark = !!d.isDark || freeDark;

    if (d.isDark) {
      // 购买的暗色主题：同一套 token，用主题自带色板覆盖 night 缺省值
      root.style.setProperty("--app-bg", d.bg);
      root.style.setProperty("--app-bg-soft", d.bgSoft ?? d.bg);
      root.style.setProperty("--app-bg-softer", d.bgSofter ?? d.cardBg ?? d.bg);
      root.style.setProperty("--app-card", d.cardBg ?? "#202F36");
      root.style.setProperty("--app-border", d.borderSoft ?? "#37464F");
      root.style.setProperty("--app-ink", d.ink ?? "#F1F5F9");
      root.style.setProperty("--app-ink-light", d.inkLight ?? "#CBD5E1");
      root.style.setProperty("--app-ink-softer", d.inkSofter ?? "#94A3B8");
    } else {
      // 免费深色 / 亮色：清掉内联覆盖，让 globals.css 的 night 缺省值生效
      for (const p of [
        "--app-bg",
        "--app-bg-soft",
        "--app-bg-softer",
        "--app-card",
        "--app-border",
        "--app-ink",
        "--app-ink-light",
        "--app-ink-softer",
      ]) {
        root.style.removeProperty(p);
      }
    }

    root.classList.toggle("theme-dark", isDark);
    root.style.colorScheme = isDark ? "dark" : "light";
    // 首屏 bootScript 会在 <html> 上内联深色底色防白闪 —— 这里接管：
    // 深色时保持同步，切回亮色时清掉，避免滚动越界处露出旧底色
    if (isDark) {
      root.style.backgroundColor = d.isDark ? d.bg : NIGHT_BG;
    } else {
      root.style.removeProperty("background-color");
    }
    document.body.dataset.theme = themeId;
    document.body.style.backgroundColor = d.isDark
      ? d.bg
      : freeDark
        ? NIGHT_BG
        : d.bg;
  }, [themeId, mode, systemDark]);

  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
