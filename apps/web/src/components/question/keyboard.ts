"use client";

/**
 * keyboard.ts —— 题目组件共享的键盘快捷键守卫。
 *
 * 全局 keydown 快捷键必须避开：
 *   - IME 输入中（isComposing）
 *   - 带修饰键的组合键（Cmd/Ctrl/Alt，留给浏览器）
 *   - 焦点在 input / textarea / contenteditable 时（用户在打字）
 */
export function shouldIgnoreKey(e: KeyboardEvent): boolean {
  if (e.isComposing || e.metaKey || e.ctrlKey || e.altKey) return true;
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  const tag = t.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || t.isContentEditable;
}

/** 焦点是否在按钮上（Enter/空格交给按钮原生 click，避免双触发） */
export function isButtonTarget(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === "BUTTON" || t.tagName === "A");
}
