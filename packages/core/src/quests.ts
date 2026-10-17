/**
 * quests.ts —— 每日任务（Daily Quests）单一事实源
 *
 * 与 iOS `Domain/Quests.swift` 逐行对齐：同一天双端必须给出完全相同的
 * 三条任务（同 kind / 同 target / 同 reward / 同顺序）。
 *
 * 确定性来源：日期字符串（YYYY-MM-DD）→ djb2 滚动哈希 → SplitMix64
 * finalizer 雪崩 → 对候选池取模。哈希原语抽在 rng.ts（quests / league 共用），
 * TS 端用 BigInt 模拟 Swift 的 UInt64 环绕运算（&+ / &*），位运算逐位一致；
 * spec/golden-vectors.json 的 `quests` 组是双端对照的黄金向量。
 */

import { U64_MASK, djb2Hash, mix64 as mix } from "./rng";

export type QuestKind = "earnXP" | "finishLessons" | "reviewMistakes" | "readTexts";

export interface Quest {
  kind: QuestKind;
  /** 目标计数（earnXP 为 XP 数，其余为次数） */
  target: number;
  /** 完成奖励（宝石） */
  reward: number;
  /** 当日内稳定的 id —— 领取账本以 `"${date}:${id}"` 记账 */
  id: string;
  /** 儿童友好中文标题（与 iOS 文案一致） */
  title: string;
}

function makeQuest(kind: QuestKind, target: number, reward: number): Quest {
  return { kind, target, reward, id: `${kind}-${target}`, title: questTitle(kind, target) };
}

/** 与 iOS `Quest.title` 完全一致的中文文案。 */
export function questTitle(kind: QuestKind, target: number): string {
  switch (kind) {
    case "earnXP":         return `获得 ${target} 点经验`;
    case "finishLessons":  return `完成 ${target} 节小课`;
    case "reviewMistakes": return `复习 ${target} 道错题`;
    case "readTexts":      return `读完 ${target} 篇课文或故事`;
  }
}

/**
 * 候选池 —— 与 iOS `Quests.pool` 逐项一致（顺序也一致，
 * 因为 pick 是「按 kind 过滤后取模」，顺序参与结果）。
 */
export const QUEST_POOL: readonly Quest[] = [
  makeQuest("earnXP", 30, 10),
  makeQuest("earnXP", 60, 15),
  makeQuest("earnXP", 100, 25),
  makeQuest("finishLessons", 1, 10),
  makeQuest("finishLessons", 2, 20),
  makeQuest("finishLessons", 3, 30),
  makeQuest("reviewMistakes", 1, 10),
  makeQuest("reviewMistakes", 3, 20),
  makeQuest("readTexts", 1, 15),
  makeQuest("readTexts", 2, 25),
];

/**
 * 给定日期（YYYY-MM-DD）的三条每日任务，确定性生成：
 *   - 第一条必为 earnXP；
 *   - 后两条从 finishLessons / reviewMistakes / readTexts 中不放回抽取，
 *     因此一天内三条任务 kind 两两不同；
 *   - 同一天任何时刻、任何端调用结果完全一致。
 */
export function dailyQuests(dateString: string): Quest[] {
  const hash = mix(djb2Hash(dateString));

  const index = (count: number, salt: bigint): number => {
    if (count <= 0) return 0;
    return Number(mix((hash + salt) & U64_MASK) % BigInt(count));
  };
  const pick = (kind: QuestKind, salt: bigint): Quest => {
    const options = QUEST_POOL.filter(q => q.kind === kind);
    return options[index(options.length, salt)];
  };

  // 与 iOS 一致：先抽走 firstKind（不放回），再在剩余里抽 secondKind
  const rest: QuestKind[] = ["finishLessons", "reviewMistakes", "readTexts"];
  const [firstKind] = rest.splice(index(rest.length, 0x11n), 1);
  const secondKind = rest[index(rest.length, 0x22n)];

  return [pick("earnXP", 0x01n), pick(firstKind, 0x33n), pick(secondKind, 0x44n)];
}
