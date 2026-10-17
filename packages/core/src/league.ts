/**
 * league.ts —— 本地模拟联赛（Wave E1）单一事实源
 *
 * 纯单机联赛：每周把用户和 15 个「影子同学」（bot）放进同一个 16 人小组，
 * bot 的名字、周目标 XP、每日活跃曲线全部由 seed 确定性生成——
 * 同一台设备（同 salt）同一周同一段位，任何时刻重算得到完全相同的榜单。
 *
 * 确定性来源：
 *   seed = mix64(djb2Hash(`${weekKey}#${tier}#${salt}`))
 *   - weekKey：本周周一的 YYYY-MM-DD（本地时区），见 weekKeyFor
 *   - tier：段位 id（bronze/silver/...）
 *   - salt：每台设备一次性生成的稳定随机串（store 持久化）
 *
 * iOS `Domain/League.swift` 必须逐字镜像：BOT_NAME_POOL 全文同序、
 * 所有常量同值、所有取模偏移（0x1000/0x2000/0x3000/0x4000/0x5000 系）同值,
 * 保证同 salt 同周同段位双端同榜。spec/golden-vectors.json 的 `league`
 * 组是双端对照的黄金向量。
 */

import { U64_MASK, djb2Hash, mix64 } from "./rng";
import { dayIndexInWeek, weekStartKey } from "./week";

// ============================================================
// 🏆 段位
// ============================================================

export type LeagueTierId = "bronze" | "silver" | "gold" | "sapphire" | "ruby" | "diamond";

export interface LeagueTier {
  id: LeagueTierId;
  /** 儿童友好中文名 */
  name: string;
  /** 段位顺序（0 = 最低） */
  order: number;
  /** 段位主题色 */
  color: string;
}

/** 6 个段位，order 升序。 */
export const LEAGUE_TIERS: readonly LeagueTier[] = [
  { id: "bronze", name: "青铜联赛", order: 0, color: "#CD7F32" },
  { id: "silver", name: "白银联赛", order: 1, color: "#A8B8C8" },
  { id: "gold", name: "黄金联赛", order: 2, color: "#FFC800" },
  { id: "sapphire", name: "蓝宝石联赛", order: 3, color: "#1CB0F6" },
  { id: "ruby", name: "红宝石联赛", order: 4, color: "#E0115F" },
  { id: "diamond", name: "钻石联赛", order: 5, color: "#54D7EC" },
] as const;

/** 按 id 取段位（无效 id 落回青铜，容错老档）。 */
export function leagueTier(id: string): LeagueTier {
  return LEAGUE_TIERS.find(t => t.id === id) ?? LEAGUE_TIERS[0];
}

/** 晋级后的段位 id（钻石封顶）。 */
export function nextTierId(id: LeagueTierId): LeagueTierId {
  const t = leagueTier(id);
  return (LEAGUE_TIERS[Math.min(t.order + 1, LEAGUE_TIERS.length - 1)]).id;
}

/** 降级后的段位 id（青铜保底）。 */
export function prevTierId(id: LeagueTierId): LeagueTierId {
  const t = leagueTier(id);
  return (LEAGUE_TIERS[Math.max(t.order - 1, 0)]).id;
}

// ============================================================
// 🔓 解锁 & 小组构成
// ============================================================

/** 累计完成 10 节课后解锁联赛（与现有 teaser 文案一致）。 */
export const UNLOCK_LESSONS = 10;

/** 小组总人数：用户 + 15 个影子同学。 */
export const LEAGUE_GROUP_SIZE = 16;
/** 每组影子同学（bot）数。 */
export const LEAGUE_BOT_COUNT = 15;

// ============================================================
// 📅 周键
// ============================================================

/**
 * 本周周一的 YYYY-MM-DD（本地时区）。周一自身返回当天。
 *
 * 「一周」的定义在 week.ts（weekStartKey / weekDateKeys / dayIndexInWeek），
 * 联赛、周报、连胜日历共用同一份实现；这里只保留历史名字作为别名，
 * 不允许再写第二份周窗口逻辑。
 */
export const weekKeyFor = weekStartKey;

// ============================================================
// 🤖 影子同学（bot）
// ============================================================

export interface LeagueBot {
  /** 稳定 id：`bot-${weekKey}-${tier}-${botIndex}` */
  id: string;
  /** 儿童友好中文昵称（当周组内去重） */
  name: string;
}

export interface LeagueWeekInput {
  weekKey: string;
  tier: LeagueTierId;
  /** 每台设备一次性生成的稳定随机串（store 持久化） */
  salt: string;
}

/**
 * 儿童友好中文昵称池（36 个）。
 * ⚠️ iOS 侧必须逐字同序镜像——顺序参与去重抽取的结果。
 */
export const BOT_NAME_POOL: readonly string[] = [
  "小猴淘淘", "兔子朵朵", "熊猫团团", "小鹿灵灵", "狐狸悠悠", "小象壮壮",
  "企鹅冰冰", "小猫咪咪", "小狗旺旺", "松鼠果果", "小鸟啾啾", "海豚蓝蓝",
  "小马奔奔", "刺猬球球", "考拉抱抱", "小龙腾腾", "河马呼呼", "小羊咩咩",
  "青蛙呱呱", "蜜蜂嗡嗡", "猫头鹰慧慧", "小熊憨憨", "仓鼠豆豆", "鹦鹉花花",
  "小鲸鱼泡泡", "蜗牛慢慢", "小老虎威威", "浣熊乐乐", "长颈鹿高高", "小恐龙吼吼",
  "雪人白白", "星星闪闪", "月亮弯弯", "太阳暖暖", "彩虹七七", "云朵飘飘",
] as const;

/** 各段位 bot 周目标 XP 区间（闭区间）。 */
export const TIER_XP_RANGES: Record<LeagueTierId, { min: number; max: number }> = {
  bronze: { min: 40, max: 260 },
  silver: { min: 80, max: 420 },
  gold: { min: 120, max: 600 },
  sapphire: { min: 160, max: 800 },
  ruby: { min: 200, max: 1000 },
  diamond: { min: 240, max: 1200 },
};

/** 当周种子：mix64(djb2(`${weekKey}#${tier}#${salt}`))。 */
function leagueSeed(input: LeagueWeekInput): bigint {
  return mix64(djb2Hash(`${input.weekKey}#${input.tier}#${input.salt}`));
}

/** seed 派生的取模抽样：mix64(seed + offset) % count。 */
function draw(seed: bigint, offset: number, count: number): number {
  if (count <= 0) return 0;
  return Number(mix64((seed + BigInt(offset)) & U64_MASK) % BigInt(count));
}

/**
 * 当周 15 个影子同学（名字在名池内不放回抽取，组内必然去重）。
 * botIndex ∈ [0, 14] 与返回数组下标一致，是 botXpAt 的输入。
 */
export function botsForWeek(input: LeagueWeekInput): LeagueBot[] {
  const seed = leagueSeed(input);
  const pool = [...BOT_NAME_POOL];
  const bots: LeagueBot[] = [];
  for (let i = 0; i < LEAGUE_BOT_COUNT; i++) {
    const idx = draw(seed, 0x1000 + i, pool.length);
    const [name] = pool.splice(idx, 1);
    bots.push({ id: `bot-${input.weekKey}-${input.tier}-${i}`, name });
  }
  return bots;
}

/**
 * 某 bot 的周目标 XP（段位区间内均匀取值，seed 确定）。
 * 周日 23:59 之后 botXpAt 收敛到该值。
 */
export function botWeeklyGoal(input: LeagueWeekInput & { botIndex: number }): number {
  const seed = leagueSeed(input);
  const range = TIER_XP_RANGES[input.tier];
  const span = range.max - range.min + 1;
  return range.min + draw(seed, 0x2000 + input.botIndex, span);
}

/**
 * 某 bot 在 date 时刻的累计周 XP。性质（受测试保护）：
 *   - 周一 00:00 起步为 0，随时间单调不减；
 *   - 早于本周返回 0，晚于本周返回周目标全额；
 *   - 已过整天按「每日份额」累加（7 天权重曲线由 seed 确定，权重 1..9）；
 *   - 今天的份额按小时线性推进：bot 有 seed 确定的活跃时段
 *     [startHour ∈ 6..10, endHour ∈ 18..23]，时段前 0%、时段后 100%；
 *   - 全程整数运算（floor），双端可逐位对齐。
 */
export function botXpAt(input: LeagueWeekInput & { botIndex: number; date: Date }): number {
  const { botIndex, date } = input;
  const seed = leagueSeed(input);
  const goal = botWeeklyGoal(input);

  // 7 天权重（周一..周日），每天 1..9
  const weights: number[] = [];
  for (let d = 0; d < 7; d++) {
    weights.push(1 + draw(seed, 0x3000 + botIndex * 0x10 + d, 9));
  }
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  // 累计到第 d 天（含）应得的 XP：floor(goal * ΣW / W)，cum(6) == goal
  const cum = (d: number): number => {
    let w = 0;
    for (let i = 0; i <= d; i++) w += weights[i];
    return Math.floor((goal * w) / totalWeight);
  };

  const dayIndex = dayIndexInWeek(input.weekKey, date);
  if (dayIndex < 0) return 0;
  if (dayIndex > 6) return goal;

  const prevCum = dayIndex === 0 ? 0 : cum(dayIndex - 1);
  const todayShare = cum(dayIndex) - prevCum;

  // 今日按小时推进：活跃时段 [startHour, endHour] 内线性，两端截断
  const startHour = 6 + draw(seed, 0x4000 + botIndex, 5); // 6..10
  const endHour = 18 + draw(seed, 0x5000 + botIndex, 6); // 18..23
  const hour = date.getHours();
  const clamped = Math.min(Math.max(hour - startHour, 0), endHour - startHour);
  const todayPortion = Math.floor((todayShare * clamped) / (endHour - startHour));

  return prevCum + todayPortion;
}

// ============================================================
// 📊 实时榜单
// ============================================================

export interface StandingEntry {
  /** 是否为用户本人 */
  isUser: boolean;
  /** bot 下标（0..14）；用户为 null */
  botIndex: number | null;
  xp: number;
  /** 名次 1..16 */
  rank: number;
}

/**
 * 把用户实时插入 16 人榜单：XP 降序；同分用户靠前；bot 同分按下标升序。
 */
export function standings(input: { userXp: number; botXps: number[] }): StandingEntry[] {
  const rows = [
    { isUser: true, botIndex: null as number | null, xp: input.userXp },
    ...input.botXps.map((xp, i) => ({ isUser: false, botIndex: i as number | null, xp })),
  ];
  rows.sort((a, b) => {
    if (a.xp !== b.xp) return b.xp - a.xp;
    if (a.isUser !== b.isUser) return a.isUser ? -1 : 1;
    return (a.botIndex ?? -1) - (b.botIndex ?? -1);
  });
  return rows.map((r, i) => ({ ...r, rank: i + 1 }));
}

/** 用户当前名次（1..16）。 */
export function userRank(input: { userXp: number; botXps: number[] }): number {
  return standings(input).find(r => r.isUser)!.rank;
}

// ============================================================
// 🎁 周一结算
// ============================================================

/** 前 5 名晋级（钻石封顶）。 */
export const PROMOTE_ZONE = 5;
/** 后 5 名降级（青铜保底），即名次 ≥ 12。 */
export const DEMOTE_ZONE = 5;

/** 名次宝石奖励表（4-5 名同档 40；6 名及以后 0）。 */
export const RANK_GEM_REWARDS: Record<number, number> = {
  1: 100,
  2: 80,
  3: 60,
  4: 40,
  5: 40,
};

/** 晋级额外宝石。 */
export const PROMOTION_BONUS_GEMS = 20;

export interface LeagueSettleResult {
  promoted: boolean;
  demoted: boolean;
  /** 名次奖励 +（晋级时）晋级奖励 */
  gems: number;
}

/**
 * 按上周末终值名次结算：
 *   - rank ≤ 5 晋级（tierId 为钻石时封顶不晋级，也不发晋级奖励）；
 *   - rank ≥ 12 降级（tierId 为青铜时保底不降级）；
 *   - gems = RANK_GEM_REWARDS[rank]（缺省 0）+ 晋级时 PROMOTION_BONUS_GEMS。
 * 不传 tierId 时按可晋可降处理（调用方自行封顶/保底则请传入）。
 */
export function settleRank(rank: number, tierId?: LeagueTierId): LeagueSettleResult {
  const promoted = rank <= PROMOTE_ZONE && tierId !== "diamond";
  const demoted = rank >= LEAGUE_GROUP_SIZE - DEMOTE_ZONE + 1 && tierId !== "bronze";
  const gems = (RANK_GEM_REWARDS[rank] ?? 0) + (promoted ? PROMOTION_BONUS_GEMS : 0);
  return { promoted, demoted, gems };
}
