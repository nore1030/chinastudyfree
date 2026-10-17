"use client";

/**
 * LeagueWatcher —— 本地模拟联赛的全局看门人
 *
 * 职责（与 DailyRewardWatcher 同时机，挂在根 layout）：
 *   - 每次打开 app：调用 store.settleLeagueIfNeeded()
 *     （首次生成 leagueSalt / 首次入场记周键 / 跨周结算上周）；
 *   - 消费 store.pendingLeagueResult，弹「上周战报」结算幕：
 *     名次 + 段位升降动画 + 宝石奖励；
 *   - 沉浸页（课程 / 阅读器）不打扰，回到普通页面再弹。
 */

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { leagueTier } from "@cstf/core/league";
import { useProgressStore, type PendingLeagueResult } from "@/store/progress";
import { Modal } from "./Modal";
import { Mascot } from "./Mascot";
import { Trophy, Gem } from "./icons";
import { playSfx } from "@/lib/sfx";
import { haptic } from "@/lib/haptic";
import { isImmersivePath } from "@/lib/immersiveRoutes";

export function LeagueWatcher() {
  const pathname = usePathname() ?? "/";
  const [result, setResult] = useState<PendingLeagueResult | null>(null);
  // 沉浸页（答题 / 阅读器）不打扰 —— 判定走 lib/immersiveRoutes 的单一事实源
  const immersive = isImmersivePath(pathname);

  // 打开 / 回到普通页面时做联赛例行检查（persist 恢复后再执行）
  useEffect(() => {
    if (immersive) return;
    const t = window.setTimeout(() => {
      useProgressStore.getState().settleLeagueIfNeeded();
      const pending = useProgressStore.getState().pendingLeagueResult;
      if (pending) {
        setResult(pending);
        playSfx("complete");
        haptic("success");
      }
    }, 700);
    return () => window.clearTimeout(t);
  }, [pathname, immersive]);

  function handleClose() {
    playSfx("tap");
    haptic("light");
    useProgressStore.getState().clearPendingLeagueResult();
    setResult(null);
  }

  if (!result) return null;

  const before = leagueTier(result.tierBefore);
  const after = leagueTier(result.tierAfter);
  const changed = result.promoted || result.demoted;

  return (
    <Modal open onClose={handleClose} ariaLabel="上周联赛战报">
      <div className="flex flex-col items-center text-center">
        <Mascot mood={result.demoted ? "embarrassed" : "cheer"} size={96} />
        <h2 className="text-2xl font-extrabold text-ink mt-3">
          {result.promoted
            ? "恭喜晋级！"
            : result.demoted
              ? "上周战报"
              : "上周战报"}
        </h2>

        {/* 名次大字 */}
        <motion.div
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", damping: 12, stiffness: 220, delay: 0.15 }}
          className="mt-3 inline-flex items-center gap-2"
        >
          <Trophy className="w-8 h-8 text-gold" />
          <span className="text-4xl font-extrabold text-ink tabular-nums">
            第 {result.rank} 名
          </span>
        </motion.div>
        <p className="text-sm text-ink-light mt-1">{before.name} · 16 人小组</p>

        {/* 段位变化动画 */}
        {changed && (
          <motion.div
            initial={{ y: 12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="mt-4 flex items-center gap-3"
          >
            <TierChip name={before.name} color={before.color} dim />
            <motion.span
              aria-hidden
              animate={{ x: [0, 5, 0] }}
              transition={{ duration: 1, repeat: Infinity, ease: "easeInOut" }}
              className={`text-xl font-extrabold ${result.promoted ? "text-primary" : "text-danger"}`}
            >
              →
            </motion.span>
            <motion.div
              initial={{ scale: 0.6 }}
              animate={{ scale: [0.6, 1.15, 1] }}
              transition={{ delay: 0.6, duration: 0.5 }}
            >
              <TierChip name={after.name} color={after.color} />
            </motion.div>
          </motion.div>
        )}
        {result.demoted && (
          <p className="text-xs text-ink-light mt-2">
            没关系，这周加油学，把段位赢回来！
          </p>
        )}
        {!changed && (
          <p className="text-xs text-ink-light mt-3">
            继续留在{after.name}，这周冲进前 5 就能晋级！
          </p>
        )}

        {/* 宝石奖励 */}
        {result.gems > 0 && (
          <motion.div
            initial={{ scale: 0, y: 10, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            transition={{ delay: 0.8, type: "spring", damping: 11 }}
            className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl font-extrabold text-xl text-white"
            style={{
              background: "linear-gradient(135deg, #a855f7, #7c3aed)",
              boxShadow: "0 4px 0 0 #6b21a8",
            }}
          >
            <Gem className="w-6 h-6" />
            <span className="tabular-nums">+{result.gems}</span>
          </motion.div>
        )}

        <button
          type="button"
          onClick={handleClose}
          className="btn-chunky-primary w-full mt-6"
        >
          {result.promoted ? "太棒了！" : "继续加油"}
        </button>
      </div>
    </Modal>
  );
}

function TierChip({
  name,
  color,
  dim = false,
}: {
  name: string;
  color: string;
  dim?: boolean;
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-extrabold text-white"
      style={{
        backgroundColor: color,
        opacity: dim ? 0.45 : 1,
        boxShadow: dim ? "none" : `0 3px 0 0 rgba(0,0,0,0.18)`,
      }}
    >
      <Trophy className="w-4 h-4" />
      {name}
    </span>
  );
}
