/**
 * league.test.ts —— 本地模拟联赛的行为单测
 * （黄金向量对照在 goldenVectors.test.ts 的 league 组，这里测边界与性质）
 */

import { describe, expect, it } from "vitest";
import {
  BOT_NAME_POOL,
  DEMOTE_ZONE,
  LEAGUE_BOT_COUNT,
  LEAGUE_GROUP_SIZE,
  LEAGUE_TIERS,
  PROMOTE_ZONE,
  PROMOTION_BONUS_GEMS,
  RANK_GEM_REWARDS,
  TIER_XP_RANGES,
  UNLOCK_LESSONS,
  botWeeklyGoal,
  botXpAt,
  botsForWeek,
  leagueTier,
  nextTierId,
  prevTierId,
  settleRank,
  standings,
  userRank,
  weekKeyFor,
  type LeagueTierId,
} from "../league";

const WEEK: { weekKey: string; tier: LeagueTierId; salt: string } = {
  weekKey: "2026-08-24",
  tier: "gold",
  salt: "unit-test-salt",
};

// ============================================================
// weekKeyFor
// ============================================================

describe("weekKeyFor", () => {
  it("周一返回当天", () => {
    expect(weekKeyFor(new Date(2026, 7, 24, 0, 0))).toBe("2026-08-24");
    expect(weekKeyFor(new Date(2026, 7, 24, 23, 59))).toBe("2026-08-24");
  });

  it("周中（周二/周三）回落到本周一", () => {
    expect(weekKeyFor(new Date(2026, 7, 25, 10, 0))).toBe("2026-08-24");
    expect(weekKeyFor(new Date(2026, 7, 26, 12, 0))).toBe("2026-08-24");
  });

  it("周日属于同一周（不提前进入下一周）", () => {
    // 2026-08-30 是周日
    expect(weekKeyFor(new Date(2026, 7, 30, 23, 59))).toBe("2026-08-24");
    // 下一天（周一）才换周
    expect(weekKeyFor(new Date(2026, 7, 31, 0, 0))).toBe("2026-08-31");
  });

  it("跨月：8 月 1 日（周六）的周一在 7 月", () => {
    expect(weekKeyFor(new Date(2026, 7, 1, 9, 0))).toBe("2026-07-27");
  });

  it("跨年：2027-01-01（周五）的周一在 2026-12-28", () => {
    expect(weekKeyFor(new Date(2027, 0, 1, 9, 0))).toBe("2026-12-28");
  });
});

// ============================================================
// 段位表
// ============================================================

describe("LEAGUE_TIERS", () => {
  it("6 段位 order 连续升序", () => {
    expect(LEAGUE_TIERS.map(t => t.id)).toEqual([
      "bronze", "silver", "gold", "sapphire", "ruby", "diamond",
    ]);
    LEAGUE_TIERS.forEach((t, i) => expect(t.order).toBe(i));
  });

  it("每段位有 XP 区间且随段位递增", () => {
    let prevMin = 0;
    for (const t of LEAGUE_TIERS) {
      const range = TIER_XP_RANGES[t.id];
      expect(range.min).toBeGreaterThan(prevMin);
      expect(range.max).toBeGreaterThan(range.min);
      prevMin = range.min;
    }
  });

  it("nextTierId 钻石封顶 / prevTierId 青铜保底", () => {
    expect(nextTierId("bronze")).toBe("silver");
    expect(nextTierId("ruby")).toBe("diamond");
    expect(nextTierId("diamond")).toBe("diamond");
    expect(prevTierId("diamond")).toBe("ruby");
    expect(prevTierId("silver")).toBe("bronze");
    expect(prevTierId("bronze")).toBe("bronze");
  });

  it("leagueTier 无效 id 容错落回青铜", () => {
    expect(leagueTier("legendary").id).toBe("bronze");
    expect(leagueTier("gold").name).toBe("黄金联赛");
  });

  it("解锁线为 10 节课", () => {
    expect(UNLOCK_LESSONS).toBe(10);
  });
});

// ============================================================
// botsForWeek
// ============================================================

describe("botsForWeek", () => {
  it("15 个 bot，名字全部来自名池且组内去重", () => {
    const bots = botsForWeek(WEEK);
    expect(bots.length).toBe(LEAGUE_BOT_COUNT);
    expect(LEAGUE_GROUP_SIZE).toBe(LEAGUE_BOT_COUNT + 1);
    const names = bots.map(b => b.name);
    expect(new Set(names).size).toBe(LEAGUE_BOT_COUNT);
    for (const name of names) expect(BOT_NAME_POOL).toContain(name);
  });

  it("名池 ≥32 且本身无重复", () => {
    expect(BOT_NAME_POOL.length).toBeGreaterThanOrEqual(32);
    expect(new Set(BOT_NAME_POOL).size).toBe(BOT_NAME_POOL.length);
  });

  it("同输入结果稳定；换 salt / 换周 / 换段位结果不同", () => {
    expect(botsForWeek(WEEK)).toEqual(botsForWeek(WEEK));
    const otherSalt = botsForWeek({ ...WEEK, salt: "another-salt" });
    const otherWeek = botsForWeek({ ...WEEK, weekKey: "2026-08-31" });
    const otherTier = botsForWeek({ ...WEEK, tier: "ruby" });
    const base = botsForWeek(WEEK).map(b => b.name).join(",");
    expect(otherSalt.map(b => b.name).join(",")).not.toBe(base);
    expect(otherWeek.map(b => b.name).join(",")).not.toBe(base);
    expect(otherTier.map(b => b.name).join(",")).not.toBe(base);
  });

  it("id 按 weekKey/tier/botIndex 稳定编码", () => {
    const bots = botsForWeek(WEEK);
    expect(bots[0].id).toBe("bot-2026-08-24-gold-0");
    expect(bots[14].id).toBe("bot-2026-08-24-gold-14");
  });
});

// ============================================================
// botXpAt
// ============================================================

describe("botXpAt", () => {
  it("周一 00:00 起步为 0；早于本周为 0", () => {
    for (let i = 0; i < LEAGUE_BOT_COUNT; i++) {
      expect(botXpAt({ ...WEEK, botIndex: i, date: new Date(2026, 7, 24, 0, 0) })).toBe(0);
      expect(botXpAt({ ...WEEK, botIndex: i, date: new Date(2026, 7, 23, 18, 0) })).toBe(0);
    }
  });

  it("整周逐小时单调不减，周日深夜收敛到周目标，晚于本周恒为周目标", () => {
    for (let i = 0; i < LEAGUE_BOT_COUNT; i++) {
      const goal = botWeeklyGoal({ ...WEEK, botIndex: i });
      let prev = -1;
      for (let d = 0; d < 7; d++) {
        for (let h = 0; h < 24; h++) {
          const xp = botXpAt({ ...WEEK, botIndex: i, date: new Date(2026, 7, 24 + d, h, 30) });
          expect(xp).toBeGreaterThanOrEqual(prev);
          expect(Number.isInteger(xp)).toBe(true);
          prev = xp;
        }
      }
      expect(prev).toBe(goal);
      expect(botXpAt({ ...WEEK, botIndex: i, date: new Date(2026, 8, 2, 8, 0) })).toBe(goal);
    }
  });

  it("周目标落在段位区间内（抽查全部段位）", () => {
    for (const t of LEAGUE_TIERS) {
      const range = TIER_XP_RANGES[t.id];
      for (let i = 0; i < LEAGUE_BOT_COUNT; i++) {
        const goal = botWeeklyGoal({ weekKey: WEEK.weekKey, tier: t.id, salt: WEEK.salt, botIndex: i });
        expect(goal).toBeGreaterThanOrEqual(range.min);
        expect(goal).toBeLessThanOrEqual(range.max);
      }
    }
  });
});

// ============================================================
// standings / userRank
// ============================================================

describe("standings", () => {
  it("XP 降序排 16 人，rank 1..16", () => {
    const botXps = Array.from({ length: 15 }, (_, i) => (i + 1) * 10); // 10..150
    const rows = standings({ userXp: 85, botXps });
    expect(rows.length).toBe(LEAGUE_GROUP_SIZE);
    rows.forEach((r, i) => expect(r.rank).toBe(i + 1));
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].xp).toBeLessThanOrEqual(rows[i - 1].xp);
    }
    // 85 落在 80 与 90 之间 → 用户排在 150..90（7 个）之后 = 第 8 名
    expect(userRank({ userXp: 85, botXps })).toBe(8);
  });

  it("同分用户靠前", () => {
    const botXps = [100, 100, 100, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const rows = standings({ userXp: 100, botXps });
    expect(rows[0].isUser).toBe(true);
    expect(rows[0].rank).toBe(1);
  });

  it("bot 同分按下标升序，用户 botIndex 为 null", () => {
    const botXps = [50, 50, 50, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const rows = standings({ userXp: 0, botXps });
    expect(rows.slice(0, 3).map(r => r.botIndex)).toEqual([0, 1, 2]);
    const user = rows.find(r => r.isUser)!;
    expect(user.botIndex).toBeNull();
  });
});

// ============================================================
// settleRank
// ============================================================

describe("settleRank", () => {
  it("名次奖励表：1→100, 2→80, 3→60, 4-5→40, 6+→0（未叠加晋级奖励）", () => {
    expect(RANK_GEM_REWARDS).toEqual({ 1: 100, 2: 80, 3: 60, 4: 40, 5: 40 });
    expect(PROMOTION_BONUS_GEMS).toBe(20);
  });

  it("前 5 晋级（+20 宝石），后 5 降级，其余原地", () => {
    expect(PROMOTE_ZONE).toBe(5);
    expect(DEMOTE_ZONE).toBe(5);
    expect(settleRank(1)).toEqual({ promoted: true, demoted: false, gems: 120 });
    expect(settleRank(2)).toEqual({ promoted: true, demoted: false, gems: 100 });
    expect(settleRank(3)).toEqual({ promoted: true, demoted: false, gems: 80 });
    expect(settleRank(4)).toEqual({ promoted: true, demoted: false, gems: 60 });
    expect(settleRank(5)).toEqual({ promoted: true, demoted: false, gems: 60 });
    expect(settleRank(6)).toEqual({ promoted: false, demoted: false, gems: 0 });
    expect(settleRank(11)).toEqual({ promoted: false, demoted: false, gems: 0 });
    expect(settleRank(12)).toEqual({ promoted: false, demoted: true, gems: 0 });
    expect(settleRank(16)).toEqual({ promoted: false, demoted: true, gems: 0 });
  });

  it("钻石封顶：第 1 名不再晋级也无晋级奖励，仍拿名次奖励", () => {
    expect(settleRank(1, "diamond")).toEqual({ promoted: false, demoted: false, gems: 100 });
    expect(settleRank(5, "diamond")).toEqual({ promoted: false, demoted: false, gems: 40 });
  });

  it("青铜保底：第 16 名不降级", () => {
    expect(settleRank(16, "bronze")).toEqual({ promoted: false, demoted: false, gems: 0 });
    expect(settleRank(1, "bronze")).toEqual({ promoted: true, demoted: false, gems: 120 });
  });
});
