"use client";

/**
 * /league/ —— 本地模拟联赛（Wave E1）
 *
 * 纯单机联赛：用户 + 15 个确定性「影子同学」（bot）组成 16 人周榜。
 * bot 的名字 / 周目标 / 每日活跃曲线全部由 @cstf/core league 的 seed
 * 决定（weekKey + tier + 设备 salt），任何时刻重算都得到同一张榜。
 *
 * 页面结构：
 *   - 未解锁（<10 课）：进度引导卡
 *   - 已解锁：段位横幅（6 段位进度）+ 周日倒计时
 *             + 16 人实时榜（用户行高亮、晋级/降级分区线）
 */

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  LEAGUE_TIERS,
  UNLOCK_LESSONS,
  PROMOTE_ZONE,
  LEAGUE_GROUP_SIZE,
  DEMOTE_ZONE,
  RANK_GEM_REWARDS,
  PROMOTION_BONUS_GEMS,
  botsForWeek,
  botXpAt,
  standings,
  leagueTier,
  weekKeyFor,
} from "@cstf/core/league";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { SoundLink } from "@/components/SoundLink";
import { Trophy, Lightning, Gem, Lock } from "@/components/icons";
import { useProgressStore, weekXpFromHistory } from "@/store/progress";
import { cn } from "@/lib/cn";

/** 本周结算时刻（下周一 00:00 本地时区）的毫秒时间戳 */
function weekEndMs(weekKey: string): number {
  const [y, m, d] = weekKey.split("-").map(Number);
  return new Date(y, m - 1, d + 7).getTime();
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return "马上结算";
  const minutes = Math.floor(ms / 60_000);
  const days = Math.floor(minutes / (60 * 24));
  const hours = Math.floor((minutes % (60 * 24)) / 60);
  const mins = minutes % 60;
  if (days > 0) return `${days} 天 ${hours} 小时`;
  if (hours > 0) return `${hours} 小时 ${mins} 分`;
  return `${Math.max(1, mins)} 分钟`;
}

/** bot 头像的循环配色（首字圆片背景） */
const BOT_AVATAR_COLORS = [
  "#1CB0F6", "#FF9600", "#CE82FF", "#58CC02",
  "#FF4B4B", "#FFC800", "#14D4F4", "#A560E8",
];

export default function LeaguePage() {
  const [hydrated, setHydrated] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    setHydrated(true);
    // 直接进入本页也要做例行检查（生成 salt / 跨周结算）
    useProgressStore.getState().settleLeagueIfNeeded();
    // 实时榜：每 30 秒随时间推进一次（botXpAt 按小时线性推进）
    const t = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  const completedCount = useProgressStore(
    s => Object.keys(s.completedLessons).length,
  );
  const tierId = useProgressStore(s => s.leagueTier);
  const salt = useProgressStore(s => s.leagueSalt);
  const xpHistory = useProgressStore(s => s.xpHistory);

  const unlocked = hydrated && completedCount >= UNLOCK_LESSONS;

  return (
    <AppShell>
      <main className="min-h-screen bg-bg-soft lg:bg-transparent pb-8">
        <PageHeader backHref={null} title="排行榜" subtitle="和影子同学比一比" />
        <div className="max-w-md lg:max-w-none mx-auto px-4 lg:px-0 pt-4">
          {!hydrated ? (
            <div className="animate-pulse space-y-3">
              <div className="h-28 rounded-3xl bg-bg-softer/60" />
              <div className="h-80 rounded-3xl bg-bg-softer/60" />
            </div>
          ) : unlocked ? (
            <LeagueBoard
              tierId={tierId}
              salt={salt}
              xpHistory={xpHistory}
              now={now}
            />
          ) : (
            <LockedCard completedCount={completedCount} />
          )}
        </div>
      </main>
    </AppShell>
  );
}

// ============================================================
// 未解锁：进度引导
// ============================================================

function LockedCard({ completedCount }: { completedCount: number }) {
  const remaining = Math.max(0, UNLOCK_LESSONS - completedCount);
  const pct = Math.min(100, (completedCount / UNLOCK_LESSONS) * 100);
  return (
    <div
      className="bg-white rounded-3xl border-2 border-bg-softer p-6 text-center"
      style={{ boxShadow: "0 4px 0 0 var(--shadow-card-color)" }}
    >
      <div className="w-20 h-20 mx-auto rounded-full bg-bg-soft border-2 border-bg-softer flex items-center justify-center relative">
        <Trophy className="w-10 h-10 text-ink-softer" />
        <span className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-white border-2 border-bg-softer flex items-center justify-center">
          <Lock className="w-4 h-4 text-ink-softer" />
        </span>
      </div>
      <h2 className="text-xl font-extrabold text-ink mt-4">解锁排行榜</h2>
      <p className="text-sm text-ink-light mt-1.5">
        再完成 <span className="font-extrabold text-primary">{remaining}</span>{" "}
        节课，就能和 15 位影子同学一起比赛啦！
      </p>
      <div className="mt-5">
        <div className="h-4 bg-bg-softer rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-primary rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.7, ease: "easeOut" }}
          />
        </div>
        <div className="mt-1.5 text-xs font-extrabold text-ink-softer tabular-nums">
          {Math.min(completedCount, UNLOCK_LESSONS)}/{UNLOCK_LESSONS} 节课
        </div>
      </div>
      <SoundLink href="/" className="btn-chunky-primary w-full mt-5 block">
        去学习
      </SoundLink>
    </div>
  );
}

// ============================================================
// 已解锁：段位横幅 + 实时榜
// ============================================================

function LeagueBoard({
  tierId,
  salt,
  xpHistory,
  now,
}: {
  tierId: (typeof LEAGUE_TIERS)[number]["id"];
  salt: string;
  xpHistory: Record<string, number>;
  now: Date;
}) {
  const tier = leagueTier(tierId);
  const weekKey = weekKeyFor(now);

  const bots = useMemo(
    () => botsForWeek({ weekKey, tier: tier.id, salt }),
    [weekKey, tier.id, salt],
  );
  const rows = useMemo(() => {
    const botXps = bots.map((_, i) =>
      botXpAt({ weekKey, tier: tier.id, salt, botIndex: i, date: now }),
    );
    const userXp = weekXpFromHistory(xpHistory, weekKey);
    return standings({ userXp, botXps });
  }, [bots, weekKey, tier.id, salt, xpHistory, now]);

  const countdown = formatCountdown(weekEndMs(weekKey) - now.getTime());
  const demoteFromRank = LEAGUE_GROUP_SIZE - DEMOTE_ZONE + 1; // 12

  return (
    <div className="space-y-4">
      {/* === 段位横幅：6 段位进度 + 倒计时 === */}
      <div
        className="rounded-3xl border-2 border-bg-softer bg-white p-5"
        style={{ boxShadow: "0 4px 0 0 var(--shadow-card-color)" }}
      >
        <div className="flex items-end justify-center gap-2 sm:gap-3">
          {LEAGUE_TIERS.map(t => {
            const isCurrent = t.id === tier.id;
            const passed = t.order < tier.order;
            return (
              <div key={t.id} className="flex flex-col items-center gap-1">
                <motion.div
                  animate={isCurrent ? { y: [0, -4, 0] } : { y: 0 }}
                  transition={
                    isCurrent
                      ? { duration: 2.2, repeat: Infinity, ease: "easeInOut" }
                      : { duration: 0 }
                  }
                  className={cn(
                    "rounded-full flex items-center justify-center",
                    isCurrent ? "w-14 h-14" : "w-9 h-9",
                  )}
                  style={{
                    backgroundColor: isCurrent || passed ? t.color : "#E5E5E5",
                    boxShadow: isCurrent
                      ? `0 4px 0 0 rgba(0,0,0,0.18), 0 0 0 6px ${t.color}33`
                      : "none",
                    opacity: passed ? 0.55 : 1,
                  }}
                  title={t.name}
                >
                  <Trophy
                    className={cn(
                      isCurrent ? "w-7 h-7" : "w-4 h-4",
                      isCurrent || passed ? "text-white" : "text-ink-softer",
                    )}
                  />
                </motion.div>
              </div>
            );
          })}
        </div>
        <div className="text-center mt-3">
          <div className="text-xl font-extrabold" style={{ color: tier.color }}>
            {tier.name}
          </div>
          <div className="text-xs font-bold text-ink-light mt-1">
            前 {PROMOTE_ZONE} 名晋级 · 每周一结算
          </div>
          <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-warning/15 border-2 border-warning/40 text-warning text-xs font-extrabold tabular-nums">
            ⏳ 距离结算还有 {countdown}
          </div>
        </div>
      </div>

      {/* === 16 人实时榜 === */}
      <div
        className="rounded-3xl border-2 border-bg-softer bg-white overflow-hidden"
        style={{ boxShadow: "0 4px 0 0 var(--shadow-card-color)" }}
      >
        {rows.map((row, idx) => {
          const bot = row.botIndex != null ? bots[row.botIndex] : null;
          const name = row.isUser ? "我" : (bot?.name ?? "同学");
          const inPromote = row.rank <= PROMOTE_ZONE;
          const inDemote = row.rank >= demoteFromRank;
          return (
            <div key={bot?.id ?? "user"}>
              <div
                className={cn(
                  "flex items-center gap-3 px-4 py-2.5",
                  row.isUser && "bg-secondary/10",
                )}
              >
                {/* 名次 */}
                <RankBadge rank={row.rank} />
                {/* 头像：用户 = 聪聪绿片；bot = 昵称首字圆片 */}
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-white font-extrabold text-sm shrink-0"
                  style={{
                    backgroundColor: row.isUser
                      ? "#58CC02"
                      : BOT_AVATAR_COLORS[(row.botIndex ?? 0) % BOT_AVATAR_COLORS.length],
                  }}
                  aria-hidden
                >
                  {row.isUser ? "我" : name.charAt(0)}
                </div>
                {/* 名字 */}
                <div className="flex-1 min-w-0 flex items-center gap-1.5">
                  <span
                    className={cn(
                      "font-extrabold truncate",
                      row.isUser ? "text-secondary-dark" : "text-ink",
                    )}
                  >
                    {row.isUser ? "我自己" : name}
                  </span>
                  {row.isUser && (
                    <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-secondary text-white text-[9px] font-extrabold">
                      你
                    </span>
                  )}
                </div>
                {/* 周 XP */}
                <span
                  className={cn(
                    "inline-flex items-center gap-1 font-extrabold text-sm tabular-nums shrink-0",
                    inPromote
                      ? "text-primary-dark"
                      : inDemote
                        ? "text-danger"
                        : "text-ink-light",
                  )}
                >
                  <Lightning className="w-3.5 h-3.5" />
                  {row.xp} XP
                </span>
              </div>

              {/* 晋级线（第 5 名之后） */}
              {row.rank === PROMOTE_ZONE && idx < rows.length - 1 && (
                <ZoneDivider kind="promote" />
              )}
              {/* 降级线（第 12 名之前） */}
              {row.rank === demoteFromRank - 1 && idx < rows.length - 1 && (
                <ZoneDivider kind="demote" />
              )}
            </div>
          );
        })}
      </div>

      {/* === 奖励说明 === */}
      <div
        className="rounded-2xl border-2 border-bg-softer bg-white p-4"
        style={{ boxShadow: "0 2px 0 0 var(--shadow-card-color)" }}
      >
        <div className="text-xs font-extrabold text-ink-softer uppercase tracking-wider">
          每周一结算奖励
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {[1, 2, 3, 4].map(r => (
            <span
              key={r}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-bg-soft border border-bg-softer text-xs font-extrabold text-ink-light tabular-nums"
            >
              {r <= 3 ? `第 ${r} 名` : "第 4-5 名"}
              <Gem className="w-3 h-3 text-secondary" />+{RANK_GEM_REWARDS[r]}
            </span>
          ))}
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/30 text-xs font-extrabold text-primary-dark tabular-nums">
            晋级再加
            <Gem className="w-3 h-3 text-secondary" />+{PROMOTION_BONUS_GEMS}
          </span>
        </div>
        <p className="text-[11px] text-ink-softer mt-2">
          前 {PROMOTE_ZONE} 名升入更高联赛，后 {DEMOTE_ZONE} 名回到上一级；这周的每一点
          XP 都算数哦！
        </p>
      </div>
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  const medal =
    rank === 1 ? "#FFC800" : rank === 2 ? "#A8B8C8" : rank === 3 ? "#CD7F32" : null;
  if (medal) {
    return (
      <span
        className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-extrabold shrink-0 tabular-nums"
        style={{ backgroundColor: medal, boxShadow: "0 2px 0 0 rgba(0,0,0,0.15)" }}
      >
        {rank}
      </span>
    );
  }
  return (
    <span className="w-7 h-7 rounded-full flex items-center justify-center text-ink-light text-xs font-extrabold shrink-0 tabular-nums">
      {rank}
    </span>
  );
}

function ZoneDivider({ kind }: { kind: "promote" | "demote" }) {
  const promote = kind === "promote";
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-4 py-1",
        promote ? "bg-primary/10" : "bg-danger/10",
      )}
      aria-hidden
    >
      <span
        className={cn(
          "flex-1 border-t-2 border-dashed",
          promote ? "border-primary/40" : "border-danger/40",
        )}
      />
      <span
        className={cn(
          "text-[10px] font-extrabold tracking-wider",
          promote ? "text-primary-dark" : "text-danger",
        )}
      >
        {promote ? "▲ 晋级区" : "▼ 降级区"}
      </span>
      <span
        className={cn(
          "flex-1 border-t-2 border-dashed",
          promote ? "border-primary/40" : "border-danger/40",
        )}
      />
    </div>
  );
}
