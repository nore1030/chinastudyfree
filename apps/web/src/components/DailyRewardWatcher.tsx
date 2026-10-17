"use client";

/**
 * DailyRewardWatcher —— 回访奖励的统一入口（每日登录 / 连胜补卡 / 里程碑庆祝）
 *
 * 行为：
 *   - 每日登录奖励：每天首次打开时自动发放，数额按「有效连胜」走 core
 *     dailyRewardForStreak（断签未救回按 0 档，文案不再谎报连续天数）
 *   - 连胜补卡：检测到「今天未学 + gap≥2 + 护盾兜不住 + 宝石够 50」时
 *     弹出「花 50💎 补回昨天」弹窗；拒绝后本次断签不再弹（localStorage 记账）
 *   - 连胜里程碑庆祝：store 发放里程碑宝石后留下 pendingStreakMilestone，
 *     这里消费并弹「连续 N 天！+M💎」
 *   - 周末双倍 XP 提示（每天一次）
 *   - 在 lesson runner 等沉浸页面不打扰（里程碑庆祝除外，它就发生在结算时）
 */

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  useProgressStore,
  isWeekendBonusActive,
  STREAK_MAKEUP_COST,
} from "@/store/progress";
import { useToast } from "./Toast";
import { Modal } from "./Modal";
import { Mascot } from "./Mascot";
import { Flame, Gem } from "./icons";
import { playSfx } from "@/lib/sfx";
import { haptic } from "@/lib/haptic";
import { isImmersivePath } from "@/lib/immersiveRoutes";

/** 本地时区 YYYY-MM-DD（与 store 同实现） */
function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function daysBetween(a: string, b: string): number {
  if (!a || !b) return Infinity;
  const da = new Date(a);
  const db = new Date(b);
  return Math.round((db.getTime() - da.getTime()) / (1000 * 60 * 60 * 24));
}

export function DailyRewardWatcher() {
  const pathname = usePathname() ?? "/";
  const toast = useToast();
  const fired = useRef(false);
  // 连胜补卡弹窗（null = 不显示；数字 = 可保住的连胜天数）
  const [makeupStreak, setMakeupStreak] = useState<number | null>(null);
  // 「本次断签」的记账 key（按断签前最后学习日区分）
  const makeupKeyRef = useRef<string | null>(null);

  /** 发放今日登录奖励 + 周末提示（补卡决定之后再调用，避免按 0 档误发） */
  function claimDailyAndHint() {
    const { gems, effectiveStreak } = useProgressStore.getState().claimDailyReward();
    if (gems > 0) {
      if (effectiveStreak >= 1) {
        toast.success(`💎 每日登录奖励 +${gems}（连续 ${effectiveStreak} 天）`, 3200);
      } else {
        toast.success(`💎 每日登录奖励 +${gems}`, 3200);
      }
      playSfx("star");
      haptic("success");
    }

    // 周末 XP 双倍提示（每天只提一次）
    if (isWeekendBonusActive()) {
      const seenKey = `csf-weekend-bonus-seen-${todayStr()}`;
      if (typeof window !== "undefined" && !localStorage.getItem(seenKey)) {
        window.setTimeout(() => {
          toast.info("🎉 周末双倍 XP 已开启！", 3200);
        }, 800);
        try {
          localStorage.setItem(seenKey, "1");
        } catch {
          /* noop */
        }
      }
    }
  }

  useEffect(() => {
    if (fired.current) return;
    // 沉浸页（课程 / 跳级 / 复习 runner / 阅读器）不打扰，回到普通页面再发
    if (isImmersivePath(pathname)) return;

    // 等待 store hydrate；用一帧延迟确保 persist 已加载
    const t = window.setTimeout(() => {
      if (fired.current) return;
      fired.current = true;

      const s = useProgressStore.getState();
      const today = todayStr();
      const gap = daysBetween(s.lastActiveDate, today);
      // 连胜补卡入口：今天未学 + gap≥2 + 护盾兜不住（连胜真的会断）+ 宝石够
      const shieldsCanSave = gap - 1 <= s.streakFreezes;
      const declinedKey = `csf-makeup-declined-${s.lastActiveDate}`;
      const alreadyDeclined =
        typeof window !== "undefined" && !!localStorage.getItem(declinedKey);
      if (
        s.lastActiveDate !== today &&
        s.streak > 0 &&
        gap >= 2 &&
        !shieldsCanSave &&
        s.gems >= STREAK_MAKEUP_COST &&
        !alreadyDeclined
      ) {
        makeupKeyRef.current = declinedKey;
        setMakeupStreak(s.streak);
        // 登录奖励等用户做完补卡决定再发（避免按 0 档误发）
        return;
      }

      claimDailyAndHint();
    }, 600);

    return () => window.clearTimeout(t);
    // 仅依赖 pathname 变化触发再判定（首次进入时执行一次）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, toast]);

  // === 连胜里程碑庆祝：消费 store 的 pendingStreakMilestone ===
  useEffect(() => {
    const celebrate = (pending: { streak: number; gems: number } | null) => {
      if (!pending) return;
      useProgressStore.getState().clearPendingStreakMilestone();
      toast.success(`🔥 连续 ${pending.streak} 天！+${pending.gems}💎`, 4000);
      playSfx("unlock");
      haptic("success");
    };
    // hydrate 后可能已有未庆祝的里程碑（比如上次在结算页直接关了页面）
    const t = window.setTimeout(
      () => celebrate(useProgressStore.getState().pendingStreakMilestone),
      900,
    );
    const unsub = useProgressStore.subscribe(state =>
      celebrate(state.pendingStreakMilestone),
    );
    return () => {
      window.clearTimeout(t);
      unsub();
    };
  }, [toast]);

  function handleMakeupConfirm() {
    playSfx("tap");
    haptic("medium");
    const ok = useProgressStore.getState().makeUpYesterdayStreak();
    setMakeupStreak(null);
    if (ok) {
      playSfx("unlock");
      haptic("success");
      toast.success("🔥 补回昨天成功，连胜保住了！", 3600);
    } else {
      toast.error("补卡没有成功，再试试吧");
    }
    // 补卡决定之后再发今日登录奖励
    window.setTimeout(claimDailyAndHint, 400);
  }

  function handleMakeupDecline() {
    playSfx("tap");
    haptic("light");
    // 本次断签不再弹（按断签前最后学习日记账）
    if (makeupKeyRef.current) {
      try {
        localStorage.setItem(makeupKeyRef.current, "1");
      } catch {
        /* noop */
      }
    }
    setMakeupStreak(null);
    window.setTimeout(claimDailyAndHint, 400);
  }

  return (
    <Modal open={makeupStreak !== null} onClose={handleMakeupDecline}>
      <div className="flex flex-col items-center text-center">
        <Mascot mood="sad" size={96} />
        <h2 className="text-2xl font-extrabold text-ink mt-3">连胜要断啦！</h2>
        <p className="text-ink-light mt-2">
          昨天忘了学习。花{" "}
          <span className="inline-flex items-center gap-0.5 font-extrabold text-secondary-dark">
            <Gem className="w-4 h-4" />
            {STREAK_MAKEUP_COST}
          </span>{" "}
          补回昨天，保住{" "}
          <span className="inline-flex items-center gap-0.5 font-extrabold text-fox">
            <Flame className="w-4 h-4" />
            {makeupStreak ?? 0} 天
          </span>{" "}
          连胜？
        </p>
        <div className="flex flex-col gap-3 w-full mt-5">
          <button
            type="button"
            onClick={handleMakeupConfirm}
            className="btn-chunky-primary w-full"
          >
            花 {STREAK_MAKEUP_COST} 宝石保住连胜
          </button>
          <button
            type="button"
            onClick={handleMakeupDecline}
            className="btn-chunky-ghost w-full"
          >
            算了，重新开始
          </button>
        </div>
      </div>
    </Modal>
  );
}
