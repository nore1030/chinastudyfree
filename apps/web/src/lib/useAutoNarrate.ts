"use client";

/**
 * useAutoNarrate — 面向低龄的自动朗读 hook。
 *
 * 场景：进入一道题、一张知识卡、一次答题反馈时，
 * 自动串行播放给定语音，避免小学生找不到喇叭。
 *
 * 行为：
 *   - 当 key 变化（或 autoNarrate / muted 开关切换到可播）时触发
 *   - 串行播 items 里所有可播放项，每段之间留 gapMs 间隔
 *   - 组件卸载 / key 再次变化 / 调用返回的 cancel() → 立刻停止
 *   - autoNarrate=false 或全局 muted → 不播
 *
 * 每一项可以是：
 *   - 字符串：预生成音频的 URL（`/audio/xx/<hash>.opus`）
 *   - `{ src, text }`：优先播 src，没有 src 时用 text 走
 *     项目 TTS API `/api/ai/tts`（见 lib/tts.ts）
 *
 * 之所以要支持 text：预生成音频目录（public/audio）是本地生成且 gitignore 的，
 * 缺失时所有 src 都是 undefined。只传 src 会让整个互动彻底没声音；
 * 同时传 text 后，配置了 TTS Key 的环境随时能实时合成。
 *
 * 使用：
 *   const cancelNarrate = useAutoNarrate(
 *     [{ src: q.audio?.question, text: q.question }], q.id);
 *   // 用户点选项时：
 *   onSelect={(v) => { cancelNarrate(); ... }}
 */

import { useCallback, useEffect, useRef } from "react";
import { playVoice, stopTTS } from "./tts";
import { useProgressStore } from "@/store/progress";

/** 一项可播放语音：音频 URL，或「URL + 兜底文本」。 */
export type NarrateItem =
  | string
  | null
  | undefined
  | { src?: string | null; text?: string | null };

interface Opts {
  /** 段间间隔，默认 200ms */
  gapMs?: number;
  /** 首段开始前的延迟，默认 0。仅在需要避开入场动画时才传 >0 值。 */
  startDelayMs?: number;
  /** 每段开始播放时回调，便于父组件做"当前播放项"高亮。idx 是过滤后非空 src 列表的 0 起索引。 */
  onSrcStart?: (idx: number) => void;
  /** 全部播放完毕（或被取消）时回调，可用于清理高亮状态。 */
  onAllDone?: () => void;
}

function normalize(item: NarrateItem): { src?: string; text?: string } | null {
  if (!item) return null;
  if (typeof item === "string") {
    return item.length ? { src: item } : null;
  }
  const src = item.src ?? undefined;
  const text = item.text ?? undefined;
  if (!src && !text) return null;
  return { src, text };
}

export function useAutoNarrate(
  items: NarrateItem[],
  key: string | number,
  opts: Opts = {},
): () => void {
  const { gapMs = 200, startDelayMs = 0, onSrcStart, onAllDone } = opts;
  const autoNarrate = useProgressStore(s => s.autoNarrate);
  const muted = useProgressStore(s => s.muted);

  // 用 ref 持有 items / 回调，避免引用变化造成 effect 反复重跑；
  // 触发重播只依赖语义 key / 开关。
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const onSrcStartRef = useRef(onSrcStart);
  onSrcStartRef.current = onSrcStart;
  const onAllDoneRef = useRef(onAllDone);
  onAllDoneRef.current = onAllDone;

  const cancelledRef = useRef(false);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    stopTTS();
  }, []);

  useEffect(() => {
    if (!autoNarrate || muted) return;
    cancelledRef.current = false;

    const run = async () => {
      // 可选入场延迟（默认 0，不打断用户手势链）
      if (startDelayMs > 0) {
        await sleep(startDelayMs);
        if (cancelledRef.current) return;
      }

      const list = itemsRef.current
        .map(normalize)
        .filter((v): v is { src?: string; text?: string } => v !== null);
      for (let i = 0; i < list.length; i++) {
        if (cancelledRef.current) return;
        onSrcStartRef.current?.(i);
        await playVoice(list[i].src, list[i].text);
        if (cancelledRef.current) return;
        if (i < list.length - 1) await sleep(gapMs);
      }
      if (!cancelledRef.current) onAllDoneRef.current?.();
    };

    void run();

    return () => {
      cancelledRef.current = true;
      stopTTS();
      onAllDoneRef.current?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, autoNarrate, muted]);

  return cancel;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
