"use client";

/**
 * AchievementWatcher —— 监听 progress store，发现新解锁成就时：
 *   1. 写入永久 unlockedAchievements 账本（只进不出，防连胜回落"回锁"）
 *   2. 按 core 的 reward 发放宝石（只发一次）
 *   3. 弹 Toast「解锁成就 +N💎」
 *
 * 仅在客户端运行；用 zustand subscribe API 订阅。
 * 注意：组件本身不渲染任何东西，只负责副作用。
 *
 * 沉浸页（答题 / 阅读器，判定走 lib/immersiveRoutes 的单一事实源）不弹提示：
 * 账本与宝石照常即时入账（一分不少），只把庆祝文案排进队列，等用户走出
 * 沉浸页再补播——既不打断答题，也不会把庆祝弄丢。
 */

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useProgressStore } from "@/store/progress";
import {
  ALL_ACHIEVEMENTS,
  computeUnlockedAchievementIds,
} from "@/lib/achievements";
import { useToast } from "./Toast";
import { playSfx } from "@/lib/sfx";
import { haptic } from "@/lib/haptic";
import { isImmersivePath } from "@/lib/immersiveRoutes";

export function AchievementWatcher() {
  const toast = useToast();
  const pathname = usePathname() ?? "/";
  // 正在处理标记：claimAchievement 会触发 store 更新 → subscribe 重入，用它挡住
  const processing = useRef(false);
  // 沉浸页里攒下的庆祝文案，回到普通页面时补播
  const pendingToasts = useRef<string[]>([]);
  // 给 subscribe 回调读的最新沉浸态（回调闭包只建一次，不能直接闭包 pathname）
  const immersiveRef = useRef(false);
  immersiveRef.current = isImmersivePath(pathname);

  useEffect(() => {
    const celebrate = (message: string) => {
      toast.success(message, 3600);
      playSfx("unlock");
      haptic("success");
    };

    const handle = () => {
      if (processing.current) return;
      processing.current = true;
      try {
        // 循环直到没有新解锁：发奖励会推高 lifetimeGems，可能连锁解锁下一枚
        for (let pass = 0; pass < 5; pass++) {
          const s = useProgressStore.getState();
          const newly = computeUnlockedAchievementIds(s).filter(
            id => !s.unlockedAchievements[id],
          );
          if (newly.length === 0) break;
          for (const id of newly) {
            // 写账本 + 发奖励（幂等；已在账本返回 0）
            const reward = useProgressStore.getState().claimAchievement(id);
            const ach = ALL_ACHIEVEMENTS.find(a => a.id === id);
            if (ach && reward > 0) {
              const message = `🏆 解锁成就：${ach.name} +${reward}💎`;
              if (immersiveRef.current) pendingToasts.current.push(message);
              else celebrate(message);
            }
          }
        }
      } finally {
        processing.current = false;
      }
    };

    // hydrate 之后先补一轮（迁移遗漏 / 上次会话末尾的解锁）
    const t = window.setTimeout(handle, 700);
    const unsub = useProgressStore.subscribe(handle);
    return () => {
      window.clearTimeout(t);
      unsub();
    };
  }, [toast]);

  // 走出沉浸页 → 把攒下的庆祝依次补播（错开 900ms，避免一次糊一屏）。
  // 只在真正播出的那一刻才出队，中途被打断的仍留在队列里，下次再补。
  useEffect(() => {
    if (isImmersivePath(pathname)) return;
    let cancelled = false;
    let timer: number | undefined;
    const pump = () => {
      if (cancelled) return;
      const message = pendingToasts.current.shift();
      if (message === undefined) return;
      toast.success(message, 3600);
      playSfx("unlock");
      haptic("success");
      timer = window.setTimeout(pump, 900);
    };
    timer = window.setTimeout(pump, 600);
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [pathname, toast]);

  return null;
}
