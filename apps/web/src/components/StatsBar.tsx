"use client";

/**
 * StatsBar — 顶栏持续状态条（红心 · 连续天数 · XP · 静音）
 *
 * 放在 Home / Grade / Book 等主页面的右上角。
 * 红心胶囊可点击弹出恢复倒计时详情。
 */

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { dateKey, weekDateKeys, weekStartKey } from "@cstf/core/week";
import {
  MAX_HEARTS,
  HEART_REFILL_COST,
  MAX_FREEZES,
  FREEZE_COST,
  STREAK_MAKEUP_COST,
  STREAK_MILESTONE_REWARDS,
  useProgressStore,
} from "@/store/progress";
import { Heart, Flame, Lightning, Snowflake, Gem } from "@/components/icons";
import { useToast } from "./Toast";
import { MuteToggle, AutoNarrateToggle, useSyncMute } from "./MuteToggle";
import { Modal } from "./Modal";
import { GemBadge } from "./GemBadge";
import { playSfx } from "@/lib/sfx";
import { haptic } from "@/lib/haptic";
import { Mascot } from "./Mascot";
import { useProgressTicker, formatMsCountdown } from "@/lib/useProgressTicker";

interface StatsBarProps {
  /** 紧凑模式：移动端 / 内页用，只显示 心 + 连击 + 宝石，省掉 XP & 音频开关 */
  compact?: boolean;
}

export function StatsBar({ compact = false }: StatsBarProps = {}) {
  useSyncMute();
  const now = useProgressTicker();
  const toast = useToast();

  const hearts = useProgressStore(s => s.hearts);
  const nextHeartAt = useProgressStore(s => s.nextHeartAt);
  const streak = useProgressStore(s => s.streak);
  const lastActiveDate = useProgressStore(s => s.lastActiveDate);
  const freezes = useProgressStore(s => s.streakFreezes);
  const xp = useProgressStore(s => s.xp);
  const gems = useProgressStore(s => s.gems);
  const buyHeartRefill = useProgressStore(s => s.buyHeartRefill);
  const buyStreakFreeze = useProgressStore(s => s.buyStreakFreeze);
  const makeUpYesterdayStreak = useProgressStore(s => s.makeUpYesterdayStreak);
  const xpHistory = useProgressStore(s => s.xpHistory);

  const [hydrated, setHydrated] = useState(false);
  const [showHearts, setShowHearts] = useState(false);
  const [showStreak, setShowStreak] = useState(false);
  useEffect(() => setHydrated(true), []);

  const dHearts = hydrated ? hearts : MAX_HEARTS;
  const dFreezes = hydrated ? freezes : 0;
  const dXp = hydrated ? xp : 0;
  const dNextHeartAt = hydrated ? nextHeartAt : null;

  // 连胜两态（对齐多邻国）：断签且护盾兜不住 → 显示 0；火焰只在"今天已学"时点亮
  const { value: dStreak, litToday: streakActive } = hydrated
    ? displayStreak(streak, lastActiveDate, freezes)
    : { value: 0, litToday: false };
  const heartsFull = dHearts >= MAX_HEARTS;
  const msToNext = dNextHeartAt ? Math.max(0, dNextHeartAt - now) : 0;

  return (
    <>
      <div className="flex items-center gap-1.5">
        {/* 红心胶囊 */}
        <motion.button
          type="button"
          onClick={() => {
            playSfx("tap");
            haptic("light");
            setShowHearts(true);
          }}
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          whileTap={{ scale: 0.95 }}
          className={`h-8 px-2.5 inline-flex items-center gap-1 rounded-full border-2 font-extrabold text-sm select-none tabular-nums transition-colors ${
            dHearts > 0
              ? "border-danger/40 text-danger bg-danger/10"
              : "border-bg-softer text-ink-softer bg-bg-soft"
          }`}
          aria-label="红心"
        >
          <Heart className="w-4 h-4" />
          <span>{dHearts}</span>
        </motion.button>

        {/* 连续天数 —— 可点开连胜详情弹层 */}
        <motion.button
          type="button"
          onClick={() => {
            playSfx("tap");
            haptic("light");
            setShowStreak(true);
          }}
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          whileTap={{ scale: 0.95 }}
          className={`h-8 px-2.5 inline-flex items-center gap-1 rounded-full border-2 font-extrabold text-sm select-none tabular-nums transition-colors ${
            streakActive
              ? "border-fox text-fox bg-fox/10"
              : "border-bg-softer text-ink-softer bg-bg-soft"
          }`}
          aria-label="连胜详情"
        >
          <Flame className="w-4 h-4" />
          <span>{dStreak}</span>
        </motion.button>

        {/* XP —— compact 模式隐藏 */}
        {!compact && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="h-8 px-2.5 inline-flex items-center gap-1 rounded-full border-2 border-secondary/40 text-secondary-dark bg-secondary/10 font-extrabold text-sm select-none tabular-nums"
          >
            <Lightning className="w-4 h-4" />
            <span>{dXp}</span>
          </motion.div>
        )}

        {/* 宝石 */}
        <GemBadge />

        {/* 分割竖线 + 音频开关 —— compact 模式隐藏 */}
        {!compact && (
          <>
            <span aria-hidden className="w-px h-5 bg-bg-softer mx-0.5" />
            <AutoNarrateToggle />
            <MuteToggle />
          </>
        )}
      </div>

      {/* 红心详情弹窗 */}
      <Modal open={showHearts} onClose={() => setShowHearts(false)}>
        <div className="flex flex-col items-center text-center">
          <Mascot mood={heartsFull ? "happy" : "think"} size={88} />
          <h2 className="text-2xl font-extrabold text-ink mt-3">红心</h2>
          <div className="flex items-center justify-center gap-2 mt-3">
            {Array.from({ length: MAX_HEARTS }).map((_, i) => {
              const alive = i < dHearts;
              return (
                <Heart
                  key={i}
                  className={`w-8 h-8 ${alive ? "text-danger" : "text-bg-softer"}`}
                />
              );
            })}
          </div>
          {heartsFull ? (
            <p className="text-ink-light mt-4">你的红心已满！</p>
          ) : (
            <div className="mt-4 w-full">
              <p className="text-ink-light text-sm">下一颗心还需</p>
              <div className="text-3xl font-extrabold text-danger tabular-nums mt-1">
                {formatMsCountdown(msToNext)}
              </div>
              <p className="text-xs text-ink-softer mt-2">每 5 分钟恢复 1 颗心</p>

              {/* 350💎 立即补满 */}
              <button
                type="button"
                onClick={() => {
                  playSfx("tap");
                  haptic("light");
                  const ok = buyHeartRefill();
                  if (ok) {
                    playSfx("unlock");
                    haptic("success");
                    toast.success("❤️ 红心已补满！");
                  } else {
                    playSfx("wrong");
                    toast.error("宝石不够，先去学习攒宝石吧");
                  }
                }}
                disabled={gems < HEART_REFILL_COST}
                className={`w-full mt-4 inline-flex items-center justify-center gap-1.5 rounded-2xl py-2.5 font-extrabold text-sm transition-colors ${
                  gems >= HEART_REFILL_COST
                    ? "text-white"
                    : "bg-bg-softer text-ink-softer cursor-not-allowed"
                }`}
                style={
                  gems >= HEART_REFILL_COST
                    ? {
                        background: "linear-gradient(135deg, #1CB0F6, #1899D6)",
                        boxShadow: "0 4px 0 0 #0d7aa8",
                      }
                    : undefined
                }
              >
                <Gem className="w-4 h-4" />
                <span className="tabular-nums">{HEART_REFILL_COST}</span>
                <span>立即补满</span>
              </button>
              {gems < HEART_REFILL_COST && (
                <div className="mt-1.5 text-[11px] text-ink-softer">
                  宝石还差 {HEART_REFILL_COST - gems} 颗
                </div>
              )}
            </div>
          )}

          {/* 连胜护盾信息 */}
          {dFreezes > 0 && (
            <div className="mt-5 flex items-center gap-2 px-3 py-2 rounded-xl bg-secondary/10 border-2 border-secondary/30 text-secondary-dark">
              <Snowflake className="w-5 h-5" />
              <span className="text-sm font-extrabold">连胜护盾 × {dFreezes}</span>
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              playSfx("tap");
              haptic("light");
              setShowHearts(false);
            }}
            className="btn-chunky-primary w-full mt-6"
          >
            知道了
          </button>
        </div>
      </Modal>

      {/* 🔥 连胜详情弹窗 */}
      <StreakModal
        open={showStreak}
        onClose={() => setShowStreak(false)}
        streakDisplay={dStreak}
        litToday={streakActive}
        rawStreak={hydrated ? streak : 0}
        lastActiveDate={hydrated ? lastActiveDate : ""}
        freezes={dFreezes}
        gems={hydrated ? gems : 0}
        xpHistory={hydrated ? xpHistory : {}}
        buyStreakFreeze={buyStreakFreeze}
        makeUpYesterdayStreak={makeUpYesterdayStreak}
      />
    </>
  );
}

// ============================================================
// 🔥 StreakModal —— 连胜弹层（周历 + 护盾 + 里程碑 + 补卡）
// ============================================================

const WEEK_LABELS = ["一", "二", "三", "四", "五", "六", "日"];

function StreakModal({
  open,
  onClose,
  streakDisplay,
  litToday,
  rawStreak,
  lastActiveDate,
  freezes,
  gems,
  xpHistory,
  buyStreakFreeze,
  makeUpYesterdayStreak,
}: {
  open: boolean;
  onClose: () => void;
  /** 展示口径的连胜（断签且救不回 = 0） */
  streakDisplay: number;
  litToday: boolean;
  /** store 里的原始 streak（补卡判定用） */
  rawStreak: number;
  lastActiveDate: string;
  freezes: number;
  gems: number;
  xpHistory: Record<string, number>;
  buyStreakFreeze: () => boolean;
  makeUpYesterdayStreak: () => boolean;
}) {
  const toast = useToast();
  const today = todayStr();
  // 本周 7 天（周一→周日）走 core week.ts 的单一事实源，与周报/联赛同一窗口
  const week = weekDateKeys(weekStartKey());

  // 断签可补卡：今天还没学 + 缺口 ≥ 2 天 + 护盾兜不住（与 store makeUpYesterdayStreak 同判据）
  const gap = lastActiveDate ? daysBetween(lastActiveDate, today) : Infinity;
  const broken = rawStreak > 0 && streakDisplay === 0 && lastActiveDate !== today && gap >= 2;

  // 下一个连胜里程碑（3/7/14/30/60/100）
  const milestones = Object.keys(STREAK_MILESTONE_REWARDS)
    .map(Number)
    .sort((a, b) => a - b);
  const nextMilestone = milestones.find(m => m > streakDisplay) ?? null;
  const prevMilestone = nextMilestone
    ? milestones.filter(m => m <= streakDisplay).pop() ?? 0
    : null;
  const milestonePct =
    nextMilestone !== null && prevMilestone !== null
      ? Math.round(
          ((streakDisplay - prevMilestone) / (nextMilestone - prevMilestone)) * 100,
        )
      : 100;

  function handleBuyFreeze() {
    playSfx("tap");
    haptic("light");
    const ok = buyStreakFreeze();
    if (ok) {
      playSfx("unlock");
      haptic("success");
      toast.success("❄️ 护盾 +1，连胜更安全了！");
    } else if (freezes >= MAX_FREEZES) {
      toast.error("护盾已经满啦（最多 2 个）");
    } else {
      toast.error("宝石不够，先去学习攒宝石吧");
    }
  }

  function handleMakeup() {
    playSfx("tap");
    haptic("medium");
    const ok = makeUpYesterdayStreak();
    if (ok) {
      playSfx("unlock");
      haptic("success");
      toast.success("🔥 补回昨天成功，去学一课点亮连胜吧！", 3600);
    } else {
      toast.error("补卡没有成功，再试试吧");
    }
  }

  return (
    <Modal open={open} onClose={onClose}>
      <div className="flex flex-col items-center text-center">
        <Mascot mood={streakDisplay > 0 ? "cheer" : "think"} size={88} />
        <h2 className="text-2xl font-extrabold text-ink mt-3">连胜</h2>
        <div
          className={`mt-2 inline-flex items-center gap-2 text-4xl font-extrabold tabular-nums ${
            litToday ? "text-fox" : "text-ink-softer"
          }`}
        >
          <Flame className="w-9 h-9" />
          <span>{streakDisplay}</span>
          <span className="text-base font-extrabold text-ink-light self-end mb-1.5">天</span>
        </div>
        {!litToday && streakDisplay > 0 && (
          <p className="text-xs text-ink-light mt-1">今天还没学习，快去点亮火焰吧</p>
        )}

        {/* 本周 7 格日历：学过 = 火焰格；今天未学 = 高亮空格 */}
        <div className="mt-5 w-full grid grid-cols-7 gap-1.5">
          {week.map((date, i) => {
            const learned = (xpHistory[date] ?? 0) > 0;
            const isToday = date === today;
            const isFuture = date > today;
            return (
              <div key={date} className="flex flex-col items-center gap-1">
                <div className="text-[10px] font-extrabold text-ink-softer">
                  {WEEK_LABELS[i]}
                </div>
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center border-2 ${
                    learned
                      ? "bg-fox/15 border-fox text-fox"
                      : isToday
                        ? "bg-warning/10 border-warning border-dashed text-warning"
                        : isFuture
                          ? "bg-bg-soft border-bg-softer text-bg-softer"
                          : "bg-bg-soft border-bg-softer text-ink-softer"
                  }`}
                  aria-label={`${date}${learned ? " 已学习" : isToday ? " 今天还没学" : ""}`}
                >
                  {learned ? <Flame className="w-4 h-4" /> : isToday ? "?" : ""}
                </div>
              </div>
            );
          })}
        </div>

        {/* 下一里程碑进度 */}
        {nextMilestone !== null && (
          <div className="mt-5 w-full rounded-2xl border-2 border-bg-softer bg-bg-soft px-4 py-3 text-left">
            <div className="flex items-center justify-between text-xs font-extrabold">
              <span className="text-ink">
                距 {nextMilestone} 天还差 {nextMilestone - streakDisplay} 天
              </span>
              <span className="inline-flex items-center gap-0.5 text-secondary-dark tabular-nums">
                <Gem className="w-3.5 h-3.5" />+{STREAK_MILESTONE_REWARDS[nextMilestone]}
              </span>
            </div>
            <div className="mt-2 h-2.5 rounded-full bg-bg-softer overflow-hidden">
              <div
                className="h-full bg-fox rounded-full transition-all"
                style={{ width: `${Math.max(4, milestonePct)}%` }}
              />
            </div>
          </div>
        )}

        {/* 连胜护盾：数量 + 购买 */}
        <div className="mt-3 w-full rounded-2xl border-2 border-secondary/30 bg-secondary/10 px-4 py-3">
          <div className="flex items-center gap-2">
            <Snowflake className="w-5 h-5 text-secondary" />
            <span className="text-sm font-extrabold text-secondary-dark">
              连胜护盾 {freezes}/{MAX_FREEZES}
            </span>
            <span className="ml-auto text-[10px] text-ink-light">每周一学习即可补 1 个（上限 2）</span>
          </div>
          {freezes < MAX_FREEZES && (
            <button
              type="button"
              onClick={handleBuyFreeze}
              disabled={gems < FREEZE_COST}
              className={`w-full mt-2.5 inline-flex items-center justify-center gap-1.5 rounded-2xl py-2 font-extrabold text-sm transition-colors ${
                gems >= FREEZE_COST
                  ? "text-white bg-secondary"
                  : "bg-bg-softer text-ink-softer cursor-not-allowed"
              }`}
              style={gems >= FREEZE_COST ? { boxShadow: "0 3px 0 0 #0d7aa8" } : undefined}
            >
              <Gem className="w-4 h-4" />
              <span className="tabular-nums">{FREEZE_COST}</span>
              <span>买一个护盾</span>
            </button>
          )}
        </div>

        {/* 断签补卡入口 */}
        {broken && (
          <div className="mt-3 w-full rounded-2xl border-2 border-danger/30 bg-danger/10 px-4 py-3">
            <div className="text-sm font-extrabold text-danger">
              连胜断啦！花 {STREAK_MAKEUP_COST} 宝石补回昨天
            </div>
            <div className="mt-1 text-[11px] text-ink-light">
              补卡后今天学一课，{rawStreak} 天连胜就能接上
            </div>
            <button
              type="button"
              onClick={handleMakeup}
              disabled={gems < STREAK_MAKEUP_COST}
              className={`w-full mt-2.5 inline-flex items-center justify-center gap-1.5 rounded-2xl py-2 font-extrabold text-sm transition-colors ${
                gems >= STREAK_MAKEUP_COST
                  ? "text-white bg-fox"
                  : "bg-bg-softer text-ink-softer cursor-not-allowed"
              }`}
              style={gems >= STREAK_MAKEUP_COST ? { boxShadow: "0 3px 0 0 #C87500" } : undefined}
            >
              <Gem className="w-4 h-4" />
              <span className="tabular-nums">{STREAK_MAKEUP_COST}</span>
              <span>补回连胜</span>
            </button>
            {gems < STREAK_MAKEUP_COST && (
              <div className="mt-1.5 text-[11px] text-ink-softer text-center">
                宝石还差 {STREAK_MAKEUP_COST - gems} 颗
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() => {
            playSfx("tap");
            haptic("light");
            onClose();
          }}
          className="btn-chunky-primary w-full mt-6"
        >
          知道了
        </button>
      </div>
    </Modal>
  );
}

// ============================================================
// 连胜展示口径（纯函数，不改 store —— store 只在下一次学习时结算）
// ============================================================

/** 本地时区的今天，YYYY-MM-DD —— 走 core week.ts，避免第二套日期键实现 */
function todayStr(): string {
  return dateKey();
}

/** 两个 YYYY-MM-DD 日期相差的天数（与 store 同实现） */
function daysBetween(a: string, b: string): number {
  if (!a || !b) return Infinity;
  const da = new Date(a);
  const db = new Date(b);
  return Math.round((db.getTime() - da.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * 展示用连胜：
 * - gap ≤ 1（今天已学 / 昨天学过）→ 连胜有效，显示原值；
 * - gap > 1 但漏掉的天数 (gap-1) 能被护盾兜住 → 仍有效，显示原值；
 * - 否则连胜已断 → 显示 0。
 * 火焰只在「连胜有效 且 今天已学」时点亮（litToday）。
 */
function displayStreak(
  streak: number,
  lastActiveDate: string,
  streakFreezes: number,
): { value: number; litToday: boolean } {
  if (streak <= 0 || !lastActiveDate) return { value: 0, litToday: false };
  const gap = daysBetween(lastActiveDate, todayStr());
  const alive = gap <= 1 || gap - 1 <= streakFreezes;
  if (!alive) return { value: 0, litToday: false };
  return { value: streak, litToday: gap === 0 };
}
