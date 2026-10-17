/**
 * quests.test.ts —— 每日任务确定性与结构约束。
 *
 * spec/golden-vectors.json 的 `quests` 组是 web / iOS 双端黄金向量：
 * Swift 侧（Domain/Quests.swift）对同一日期必须给出完全相同的三元组。
 */

import { describe, expect, it } from "vitest";
import vectors from "../../spec/golden-vectors.json";
import { dailyQuests, QUEST_POOL, questTitle, type QuestKind } from "../quests";

describe("golden vectors: quests（双端同日同任务）", () => {
  for (const v of vectors.quests) {
    it(`${v.date} → ${v.expQuests.map(q => q.id).join(", ")}`, () => {
      const quests = dailyQuests(v.date);
      expect(
        quests.map(q => ({ kind: q.kind, target: q.target, reward: q.reward, id: q.id })),
      ).toEqual(v.expQuests);
    });
  }
});

describe("dailyQuests 结构约束", () => {
  // 扫一段连续日期，覆盖各种 hash 分布
  const dates: string[] = [];
  for (let day = 1; day <= 28; day++) {
    dates.push(`2026-09-${String(day).padStart(2, "0")}`);
    dates.push(`2027-03-${String(day).padStart(2, "0")}`);
  }

  it("同一天多次调用完全一致（确定性）", () => {
    for (const d of dates) {
      expect(dailyQuests(d)).toEqual(dailyQuests(d));
    }
  });

  it("每天恰好 3 条", () => {
    for (const d of dates) {
      expect(dailyQuests(d)).toHaveLength(3);
    }
  });

  it("三条任务 kind 两两不同", () => {
    for (const d of dates) {
      const kinds = dailyQuests(d).map(q => q.kind);
      expect(new Set(kinds).size).toBe(3);
    }
  });

  it("必含 earnXP 且排在第一位", () => {
    for (const d of dates) {
      expect(dailyQuests(d)[0].kind).toBe("earnXP");
    }
  });

  it("每条任务都来自候选池（id / reward / target 一致）", () => {
    const poolIds = new Map(QUEST_POOL.map(q => [q.id, q]));
    for (const d of dates) {
      for (const q of dailyQuests(d)) {
        const src = poolIds.get(q.id);
        expect(src).toBeDefined();
        expect(q.target).toBe(src!.target);
        expect(q.reward).toBe(src!.reward);
      }
    }
  });
});

describe("questTitle 中文文案", () => {
  const cases: Array<[QuestKind, number, string]> = [
    ["earnXP", 30, "获得 30 点经验"],
    ["finishLessons", 2, "完成 2 节小课"],
    ["reviewMistakes", 3, "复习 3 道错题"],
    ["readTexts", 1, "读完 1 篇课文或故事"],
  ];
  for (const [kind, target, expected] of cases) {
    it(`${kind}(${target}) → ${expected}`, () => {
      expect(questTitle(kind, target)).toBe(expected);
    });
  }
});
