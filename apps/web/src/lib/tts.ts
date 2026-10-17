"use client";

/**
 * tts.ts — 语音播放，只用「项目自己的声音」。
 *
 * 播放优先级（两级，均由本项目源码产出，不使用操作系统 / 浏览器的系统语音）：
 *   1. 预生成音频 `src`（playTTS）—— 离线、音色最好、零延迟
 *      （由 `scripts/tts/generate-audio.mjs` 调 DashScope 批量生成，
 *       build-data 按文本 sha1 注入 `public/audio/<xx>/<hash>.opus`）
 *   2. 在线合成 `/api/ai/tts`（apps/server，DashScope CosyVoice）—— 实时合成，
 *      需后端配置 DASHSCOPE_API_KEY（桌面/便携版：把 .env 放在 exe 同目录）
 *
 * 明确**不再回退浏览器内置 speechSynthesis**（系统语音）：音色不受控、
 * 各平台差异大，与产品音色不一致。预生成音频缺失且在线合成不可用时，
 * 直接静默（不影响学习流程），实际效果由「语音开关」与后端配置决定。
 *
 * 其他约定：
 *   - 单例 HTMLAudioElement，同一时间只有一段音频在播
 *   - 受全局 muted 状态控制（isMuted）
 *   - 简单 LRU 预加载（避免重复 fetch）
 */

import { isMuted } from "./sfx";
import { aiUrl, synthesizeSpeech } from "./ai";

let el: HTMLAudioElement | null = null;
let currentSrc: string | null = null;

const preloaded = new Map<string, HTMLAudioElement>();
const PRELOAD_MAX = 16;

function getEl(): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  if (!el) {
    el = new Audio();
    el.preload = "auto";
  }
  return el;
}

export function preloadTTS(src: string | undefined | null) {
  if (!src || typeof window === "undefined") return;
  if (preloaded.has(src)) return;
  const a = new Audio();
  a.preload = "auto";
  a.src = src;
  preloaded.set(src, a);
  if (preloaded.size > PRELOAD_MAX) {
    const first = preloaded.keys().next().value as string | undefined;
    if (first) preloaded.delete(first);
  }
}

function stopAudio() {
  const a = getEl();
  if (!a) return;
  a.pause();
  a.currentTime = 0;
  currentSrc = null;
}

/**
 * 停止当前语音（useAutoNarrate 的取消路径与 TTSButton 卸载时调用）。
 */
export function stopTTS() {
  stopAudio();
}

/** playTTS 的结果：播完 / 被用户打断 / 媒体加载失败（可回退在线合成）。 */
type PlayResult = "ended" | "interrupted" | "error";

/** 播放一段音频，返回结束原因（不抛错）。 */
function playTTSResult(src: string): Promise<PlayResult> {
  const a = getEl();
  if (!a) return Promise.resolve("interrupted");
  // 同一段再次点击 → 停止
  if (currentSrc === src && !a.paused) {
    a.pause();
    a.currentTime = 0;
    currentSrc = null;
    return Promise.resolve("interrupted");
  }
  a.pause();
  a.src = src;
  a.currentTime = 0;
  currentSrc = src;

  return new Promise<PlayResult>(resolve => {
    let done = false;
    const finish = (reason: PlayResult) => {
      if (done) return;
      done = true;
      a.removeEventListener("ended", onEnded);
      a.removeEventListener("pause", onPause);
      a.removeEventListener("error", onError);
      resolve(reason);
    };
    const onEnded = () => finish("ended");
    const onPause = () => finish("interrupted");
    const onError = () => finish("error");
    a.addEventListener("ended", onEnded);
    a.addEventListener("pause", onPause);
    a.addEventListener("error", onError);
    // play() 被拒（自动播放策略等）不算媒体错误，不回退在线合成
    a.play().catch(() => finish("interrupted"));
  });
}

/**
 * 播放并在结束时 resolve（出错或立即被打断也 resolve）。
 * `src` 为预生成音频的 URL（`/audio/xx/<hash>.opus`）。
 */
export async function playTTS(src: string | undefined | null): Promise<void> {
  if (!src || isMuted()) return;
  await playTTSResult(src);
}

export function isPlayingTTS(src: string): boolean {
  const a = getEl();
  return !!a && currentSrc === src && !a.paused;
}

// ============================================================
// 在线合成（项目 API：apps/server 的 /api/ai/tts，按需探活，只探一次）
// ============================================================

let onlineTTSAvailable: boolean | null = null;
let onlineTTSProbe: Promise<boolean> | null = null;

/** 探活一次 `/api/health`，看后端是否配置了 TTS Key。 */
function probeOnlineTTS(): Promise<boolean> {
  if (onlineTTSAvailable !== null) return Promise.resolve(onlineTTSAvailable);
  if (!onlineTTSProbe) {
    onlineTTSProbe = fetch(aiUrl("/api/health"))
      .then(r => r.json())
      .then((d: { tts?: boolean }) => {
        onlineTTSAvailable = !!d?.tts;
        return onlineTTSAvailable;
      })
      .catch(() => {
        onlineTTSAvailable = false;
        return false;
      });
  }
  return onlineTTSProbe;
}

async function onlineVoice(text: string): Promise<string | null> {
  if (!(await probeOnlineTTS())) return null;
  try {
    return await synthesizeSpeech(text);
  } catch {
    // 探活说可用但实际失败（Key 失效等），本次会话不再尝试在线
    onlineTTSAvailable = false;
    return null;
  }
}

// ============================================================
// 统一入口
// ============================================================

/**
 * 播放一段语音，按优先级选择音源：
 *   `src`（预生成音频，播不出来时自动改用）→ 在线合成 `/api/ai/tts`。
 *
 * 组件应尽量同时传 `src` 和 `text`：有 `src` 时走最好的预生成音频，
 * 没有 `src`（未跑过 `npm run tts:audio` 时）自动用 `text` 走项目 TTS API。
 * 两级都不可用则静默（不回退系统语音）。
 */
export async function playVoice(
  src?: string | null,
  text?: string | null,
): Promise<void> {
  if (isMuted()) return;
  if (src) {
    const result = await playTTSResult(src);
    if (result !== "error") return; // 播完 / 被用户打断 → 结束
    // 预生成音频加载失败（文件缺失等）→ 落到在线合成
  }
  if (!text || !text.trim()) return;

  stopAudio();
  const url = await onlineVoice(text);
  if (url) {
    try {
      await playTTS(url);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}
