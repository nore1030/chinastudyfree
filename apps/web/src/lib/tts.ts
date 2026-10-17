"use client";

/**
 * tts.ts — 语音播放，只用「项目自己的声音」。
 *
 * 播放优先级（三级，前两级由本项目源码产出）：
 *   1. 预生成音频 `src`（playTTS）—— 离线、音色最好、零延迟
 *      （由 `scripts/tts/generate-audio.mjs` 调 DashScope 批量生成，
 *       build-data 按文本 sha1 注入 `public/audio/<xx>/<hash>.opus`）
 *   2. 在线合成 `/api/ai/tts`（apps/server，DashScope CosyVoice）—— 实时合成，
 *      需后端配置 DASHSCOPE_API_KEY（桌面/便携版：把 .env 放在 exe 同目录）
 *   3. 浏览器系统语音兜底（speechSynthesis，zh-CN 优先）—— 纯静态托管
 *      （GitHub Pages 等）且未跑预生成、无后端时，保证学习场景有声音。
 *      音色不受控，仅作兜底；想恢复「两项目音源、无兜底」的行为，
 *      移除 playVoice 末尾的 browserSpeak 调用即可。
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
  stopBrowserSpeak();
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
// 浏览器系统语音兜底（静态部署 / 后端未配置时的最后一级音源）
// ============================================================

let cachedVoice: SpeechSynthesisVoice | null = null;
let voiceLookupDone = false;

function pickZhVoice(): SpeechSynthesisVoice | null {
  if (voiceLookupDone) return cachedVoice;
  try {
    const vs = window.speechSynthesis?.getVoices() || [];
    if (!vs.length) return null; // 语音列表可能异步加载，先不缓存空结果
    cachedVoice = vs.find(v => /zh[-_]CN/i.test(v.lang))
      || vs.find(v => /^zh/i.test(v.lang))
      || null;
    voiceLookupDone = true;
    return cachedVoice;
  } catch {
    voiceLookupDone = true;
    return null;
  }
}

/** 用浏览器内置语音朗读文本（zh-CN 优先）。不可用时立即 resolve。 */
export function browserSpeak(text: string): Promise<void> {
  return new Promise(resolve => {
    if (isMuted() || !text.trim()) return resolve();
    const synth = typeof window !== "undefined" ? window.speechSynthesis : null;
    if (!synth) return resolve();
    try {
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const v = pickZhVoice();
      if (v) u.voice = v;
      u.lang = v?.lang || "zh-CN";
      u.rate = 0.95;
      let done = false;
      const finish = () => {
        if (!done) { done = true; resolve(); }
      };
      u.onend = finish;
      u.onerror = finish;
      synth.speak(u);
      setTimeout(finish, Math.min(60000, 4000 + text.length * 350));
    } catch {
      resolve();
    }
  });
}

function stopBrowserSpeak() {
  try {
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
  } catch { /* ignore */ }
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
    return;
  }
  // 静态部署 / 后端未配置：回退浏览器系统语音（zh-CN），保证学习场景有声音
  await browserSpeak(text);
}
