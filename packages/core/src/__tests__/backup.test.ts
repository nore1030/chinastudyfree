/**
 * backup.test.ts —— BackupEnvelope v1 校验契约
 *
 * 契约：
 *   - ok=false 仅限结构性损坏（非对象 / schema 错 / version 坏 / data 坏）；
 *   - ok=true 时 data 是补全默认后的完整信封，errors 是字段级修复日志；
 *   - 未知字段忽略、缺字段补默认、坏类型字段重置为默认并记日志；
 *   - version > 1 前向兼容（不拒收）。
 */

import { describe, expect, it } from "vitest";
import {
  BACKUP_SCHEMA,
  BACKUP_VERSION,
  buildBackup,
  validateBackup,
} from "../backup";
import { DEFAULT_EQUIPPED } from "../cosmetics";
import { readingId } from "../reading";
import { DEFAULT_DAILY_GOAL, INITIAL_FREEZES, MAX_HEARTS } from "../economy";
import type { Question } from "../types";

const sampleQuestion: Question = {
  id: 3,
  type: "choice",
  score: 5,
  difficulty: 2,
  knowledge_point: "两位数加法",
  question: "12 + 25 = ?",
  options: ["36", "37", "38", "39"],
  answer: "37",
  explanation: "个位 2+5=7，十位 1+2=3。",
};

describe("buildBackup", () => {
  it("缺省字段自动补默认，产出可回环校验的合法信封", () => {
    const env = buildBackup({ platform: "ios", data: { xp: 120, streak: 7 } });
    expect(env.schema).toBe(BACKUP_SCHEMA);
    expect(env.version).toBe(BACKUP_VERSION);
    expect(env.platform).toBe("ios");
    expect(env.exportedAt).toBeTruthy();
    expect(env.data.xp).toBe(120);
    expect(env.data.streak).toBe(7);
    // 补默认
    expect(env.data.hearts).toBe(MAX_HEARTS);
    expect(env.data.dailyGoal).toBe(DEFAULT_DAILY_GOAL);
    expect(env.data.streakFreezes).toBe(INITIAL_FREEZES);
    expect(env.data.equipped).toEqual(DEFAULT_EQUIPPED);
    expect(env.data.completedLessons).toEqual({});
    expect(env.data.mistakesBank).toEqual([]);

    // 回环：JSON 序列化后仍通过校验且无修复日志
    const result = validateBackup(JSON.parse(JSON.stringify(env)));
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.data).toEqual(env);
  });

  it("显式 undefined 字段不覆盖默认值", () => {
    const env = buildBackup({ platform: "web", data: { xp: undefined } });
    expect(env.data.xp).toBe(0);
  });
});

describe("validateBackup: 合法信封", () => {
  it("完整字段全部保留", () => {
    const env = buildBackup({
      platform: "web",
      exportedAt: "2026-08-25T10:00:00.000Z",
      data: {
        xp: 999,
        streak: 30,
        lastActiveDate: "2026-08-25",
        gems: 500,
        lifetimeGems: 1200,
        hearts: 3,
        joinedDate: "2026-01-01",
        completedLessons: {
          "g1up-u1-kp0": { stars: 3, accuracy: 1, completedAt: "2026-08-01T00:00:00Z" },
        },
        completedReadings: { "chinese-g1up-p1": "2026-08-02" },
        perfectedLessons: { "g1up-u1-kp0": true },
        mistakesBank: [
          {
            lessonId: "g1up-u2-kp1",
            questionId: 3,
            box: 2,
            correctCount: 1,
            nextReviewDate: "2026-08-26",
            graduated: false,
            question: sampleQuestion,
          },
        ],
        claimedChests: { "chest-5": true },
        claimedStreakRewards: { "7": true },
        claimedQuests: { "2026-08-25:earnXP-60": true },
        lastDailyRewardDate: "2026-08-25",
        unlockedAchievements: { first_lesson: true },
        claimedAchievements: { first_lesson: true },
        ownedCosmetics: { skin_default: true },
        equipped: { mascotSkin: "skin_panda", uiTheme: "theme_dark", lessonBackdrop: "backdrop_space" },
        xpHistory: { "2026-08-25": 60 },
        leagueTier: "gold",
        leagueWeekKey: "2026-W35",
      },
    });
    const result = validateBackup(env);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.data).toEqual(env);
    expect(result.data!.data.mistakesBank[0].question?.answer).toBe("37");
    expect(result.data!.data.claimedQuests).toEqual({ "2026-08-25:earnXP-60": true });
  });
});

describe("claimedQuests 随档携带（每日任务领取账本）", () => {
  it("导出 → 导入后领取账本原样保留，不会重复领奖", () => {
    const claimed: Record<string, true> = {
      "2026-08-25:earnXP-60": true,
      "2026-08-25:readTexts-1": true,
    };
    const env = buildBackup({ platform: "web", data: { claimedQuests: claimed } });
    const result = validateBackup(JSON.parse(JSON.stringify(env)));
    expect(result.ok).toBe(true);
    expect(result.data!.data.claimedQuests).toEqual(claimed);
  });

  it("老档（v1 早期无该字段）缺省为空对象，不报错", () => {
    const result = validateBackup({
      schema: BACKUP_SCHEMA,
      version: 1,
      exportedAt: "2026-08-25T10:00:00.000Z",
      platform: "ios",
      data: { xp: 10 },
    });
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.data!.data.claimedQuests).toEqual({});
  });

  it("坏类型重置为空并记修复日志", () => {
    const result = validateBackup({
      schema: BACKUP_SCHEMA,
      version: 1,
      platform: "web",
      data: { claimedQuests: "nope" },
    });
    expect(result.ok).toBe(true);
    expect(result.data!.data.claimedQuests).toEqual({});
    expect(result.errors.some(e => e.includes("claimedQuests"))).toBe(true);
  });
});

describe("completedReadings 归一化（双端同一 key 空间）", () => {
  const PASSAGE = "chinese-g1up-p3";
  const STORY = "chinese-g3up-s1";

  it("导出端把 web 历史键升级成规范键", () => {
    const env = buildBackup({
      platform: "web",
      data: {
        completedReadings: {
          [`passage-${PASSAGE}-listen`]: "2026-08-02",
          [`passage-${PASSAGE}-followup`]: "2026-08-03",
          [`story-${STORY}`]: "2026-08-04",
        },
      },
    });
    expect(env.data.completedReadings).toEqual({
      [readingId("listen", PASSAGE)]: "2026-08-02",
      [readingId("followup", PASSAGE)]: "2026-08-03",
      [readingId("story", STORY)]: "2026-08-04",
    });
  });

  it("导入端把 iOS 历史键升级成同一批规范键（互通）", () => {
    const iosEnv = {
      schema: BACKUP_SCHEMA,
      version: 1,
      exportedAt: "2026-08-25T10:00:00.000Z",
      platform: "ios",
      data: {
        completedReadings: {
          [PASSAGE]: "2026-08-02",
          [`${PASSAGE}-followup`]: "2026-08-03",
          [STORY]: "2026-08-04",
        },
      },
    };
    const webEnv = buildBackup({
      platform: "web",
      data: {
        completedReadings: {
          [`passage-${PASSAGE}-listen`]: "2026-08-02",
          [`passage-${PASSAGE}-followup`]: "2026-08-03",
          [`story-${STORY}`]: "2026-08-04",
        },
      },
    });
    expect(validateBackup(iosEnv).data!.data.completedReadings).toEqual(
      webEnv.data.completedReadings,
    );
  });

  it("值为空串的老档导入后不再是空串（否则会被真值判断当成未读、重复领 XP）", () => {
    const iosEnv = {
      schema: BACKUP_SCHEMA,
      version: 1,
      exportedAt: "2026-08-25T10:00:00.000Z",
      platform: "ios",
      // iOS 早期只存"读过哪些"（Set），导出时值一律是空串
      data: { completedReadings: { [PASSAGE]: "", [STORY]: "" } },
    };
    const d = validateBackup(iosEnv).data!.data.completedReadings;
    expect(Object.keys(d).sort()).toEqual([
      readingId("listen", PASSAGE),
      readingId("story", STORY),
    ]);
    for (const v of Object.values(d)) expect(v).not.toBe("");
  });

  it("规范键回环稳定（幂等，不产生修复日志）", () => {
    const env = buildBackup({
      platform: "ios",
      data: { completedReadings: { [readingId("story", STORY)]: "2026-08-04" } },
    });
    const result = validateBackup(JSON.parse(JSON.stringify(env)));
    expect(result.errors).toEqual([]);
    expect(result.data).toEqual(env);
  });
});

describe("validateBackup: 缺字段给默认", () => {
  it("data 为空对象时全部补默认", () => {
    const result = validateBackup({
      schema: "cstf-backup",
      version: 1,
      exportedAt: "2026-08-25T10:00:00.000Z",
      platform: "ios",
      data: {},
    });
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    const d = result.data!.data;
    expect(d.xp).toBe(0);
    expect(d.streak).toBe(0);
    expect(d.hearts).toBe(MAX_HEARTS);
    expect(d.dailyGoal).toBe(DEFAULT_DAILY_GOAL);
    expect(d.streakFreezes).toBe(INITIAL_FREEZES);
    expect(d.completedLessons).toEqual({});
    expect(d.completedReadings).toEqual({});
    expect(d.mistakesBank).toEqual([]);
    expect(d.equipped).toEqual(DEFAULT_EQUIPPED);
    // 可选字段缺省时不出现
    expect(d.joinedDate).toBeUndefined();
    expect(d.perfectedLessons).toBeUndefined();
    expect(d.claimedAchievements).toBeUndefined();
    expect(d.leagueTier).toBeUndefined();
    expect(d.leagueWeekKey).toBeUndefined();
  });

  it("platform/exportedAt 缺失不致命", () => {
    const result = validateBackup({ schema: "cstf-backup", version: 1, data: {} });
    expect(result.ok).toBe(true);
    expect(result.data!.platform).toBe("web");
    expect(result.data!.exportedAt).toBe("");
  });
});

describe("validateBackup: 未知字段忽略（前向兼容）", () => {
  it("信封层与 data 层的未知字段都被丢弃且不报错", () => {
    const result = validateBackup({
      schema: "cstf-backup",
      version: 1,
      exportedAt: "2026-08-25T10:00:00.000Z",
      platform: "web",
      futureTopLevel: { anything: true },
      data: {
        xp: 10,
        futureFeatureState: [1, 2, 3],
        anotherUnknown: "hello",
      },
    });
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.data!.data.xp).toBe(10);
    expect((result.data!.data as unknown as Record<string, unknown>)["futureFeatureState"]).toBeUndefined();
    expect((result.data! as unknown as Record<string, unknown>)["futureTopLevel"]).toBeUndefined();
  });

  it("version=2 的未来备份仍可导入（只读已知字段）", () => {
    const result = validateBackup({
      schema: "cstf-backup",
      version: 2,
      exportedAt: "2027-01-01T00:00:00.000Z",
      platform: "ios",
      data: { xp: 5000, newV2Field: { nested: true } },
    });
    expect(result.ok).toBe(true);
    expect(result.data!.version).toBe(2);
    expect(result.data!.data.xp).toBe(5000);
  });
});

describe("validateBackup: 坏类型", () => {
  it("非对象输入直接拒收", () => {
    for (const bad of [null, undefined, 42, "not json", [1, 2]]) {
      const result = validateBackup(bad);
      expect(result.ok).toBe(false);
      expect(result.data).toBeUndefined();
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it("schema / version / data 结构性损坏拒收", () => {
    expect(validateBackup({ schema: "other-app", version: 1, data: {} }).ok).toBe(false);
    expect(validateBackup({ schema: "cstf-backup", version: 0, data: {} }).ok).toBe(false);
    expect(validateBackup({ schema: "cstf-backup", version: 1.5, data: {} }).ok).toBe(false);
    expect(validateBackup({ schema: "cstf-backup", version: "1", data: {} }).ok).toBe(false);
    expect(validateBackup({ schema: "cstf-backup", version: 1 }).ok).toBe(false);
    expect(validateBackup({ schema: "cstf-backup", version: 1, data: [] }).ok).toBe(false);
  });

  it("字段级坏类型重置为默认并记入修复日志，整体仍可导入", () => {
    const result = validateBackup({
      schema: "cstf-backup",
      version: 1,
      exportedAt: "2026-08-25T10:00:00.000Z",
      platform: "android", // 非法平台 → web
      data: {
        xp: "many", // 坏类型 → 0
        streak: -5, // 负数 → 0
        gems: 100, // 合法保留
        lastActiveDate: 20260825, // 坏类型 → ""
        completedLessons: {
          good: { stars: 2, accuracy: 0.9, completedAt: "2026-08-01T00:00:00Z" },
          badStars: { stars: 9, accuracy: 2, completedAt: "x" }, // stars→1, accuracy 截到 1
          dropped: "not an object", // 丢弃
        },
        mistakesBank: [
          { lessonId: "l1", questionId: 1, box: 7 }, // box 非法 → 省略 box
          { questionId: 2 }, // 缺 lessonId → 丢弃
          "junk", // 丢弃
        ],
        xpHistory: { "2026-08-25": 60, "2026-08-24": "sixty" }, // 坏值丢弃
        equipped: { mascotSkin: 42 }, // 坏类型分量回退默认
      },
    });
    expect(result.ok).toBe(true);
    expect(result.errors.length).toBeGreaterThan(0);

    const d = result.data!.data;
    expect(result.data!.platform).toBe("web");
    expect(d.xp).toBe(0);
    expect(d.streak).toBe(0);
    expect(d.gems).toBe(100);
    expect(d.lastActiveDate).toBe("");
    expect(Object.keys(d.completedLessons).sort()).toEqual(["badStars", "good"]);
    expect(d.completedLessons["badStars"]).toEqual({ stars: 1, accuracy: 1, completedAt: "x" });
    expect(d.mistakesBank).toEqual([{ lessonId: "l1", questionId: 1 }]);
    expect(d.xpHistory).toEqual({ "2026-08-25": 60 });
    expect(d.equipped).toEqual(DEFAULT_EQUIPPED);
  });
});
