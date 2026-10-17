/**
 * jump.ts —— 跳级测试（jump ahead）抽题纯函数
 *
 * 规则（双端口径）：
 *   - 从目标单元之前所有单元的课程题库里均匀抽 JUMP_TEST_SIZE 道题；
 *   - 通过线 JUMP_PASS_ACCURACY；
 *   - 抽样是纯函数：同一 seed + 同一题库 → 同一结果，方便测试与"重试换一套题"
 *     （重试时换 seed 即可）；
 *   - 均匀 = 按课程轮转取题（round-robin），每节课被抽到的题数最多差 1，
 *     保证靠前 / 靠后的单元都被覆盖；
 *   - 题库不足 size 时全取（仍做确定性洗牌）。
 *
 * 注意：跳级测试是合成会话，不写 completedLessons；通过后由调用端批量
 * 标记之前未完成课程 completed{stars:1, accuracy:0.8}，不发 XP / 宝石。
 */

import type { Question } from "./types";
import { djb2Hash, mix64, U64_MASK } from "./rng";

/** 跳级测试题数 */
export const JUMP_TEST_SIZE = 15;
/** 跳级通过线（正确率 ≥ 0.80） */
export const JUMP_PASS_ACCURACY = 0.8;

/** 一节前置课程的题目来源 */
export interface JumpQuestionSource {
  lessonId: string;
  questions: Question[];
}

/** 抽出的题目（保留来源课程 id，便于错题归档 / 报错定位） */
export interface JumpSampledQuestion {
  lessonId: string;
  question: Question;
}

/** SplitMix64 计数流 → [0,1) 浮点（仅 TS 端内部使用，无跨端黄金向量要求）。 */
function makeRng(seedStr: string): () => number {
  let state = djb2Hash(seedStr);
  return () => {
    state = (state + 1n) & U64_MASK;
    // 取高 53 位构造 [0,1) 双精度
    return Number(mix64(state) >> 11n) / 2 ** 53;
  };
}

/** 确定性 Fisher–Yates 洗牌（原地，返回同一数组）。 */
function shuffleInPlace<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * 从全部前置课程的题库均匀抽 size 道题。
 *
 * @param sources 目标单元之前所有课程的题目（按课程分组）
 * @param size    抽题数，默认 JUMP_TEST_SIZE
 * @param seed    随机种子字符串；缺省 "jump"。重试可传新 seed 换一套题
 *
 * 保证：
 *   - 去重：同一课程内相同题目 id 只保留一次；
 *   - 均匀：题库充足时各课程被抽题数最多相差 1；
 *   - 不足：可用题总数 ≤ size 时全部返回；
 *   - 确定性：同 (sources, size, seed) 输出完全一致。
 */
export function sampleJumpQuestions(
  sources: JumpQuestionSource[],
  size: number = JUMP_TEST_SIZE,
  seed = "jump",
): JumpSampledQuestion[] {
  if (size <= 0) return [];

  // 1. 每节课内部去重（按题目 id），并各自确定性洗牌
  const groups: JumpSampledQuestion[][] = [];
  for (const src of sources) {
    const seen = new Set<number>();
    const group: JumpSampledQuestion[] = [];
    for (const q of src.questions) {
      if (seen.has(q.id)) continue;
      seen.add(q.id);
      group.push({ lessonId: src.lessonId, question: q });
    }
    if (group.length === 0) continue;
    shuffleInPlace(group, makeRng(`${seed}#${src.lessonId}`));
    groups.push(group);
  }

  const total = groups.reduce((n, g) => n + g.length, 0);
  const targetSize = Math.min(size, total);
  if (targetSize === 0) return [];

  // 2. 课程顺序确定性洗牌（避免总是从第一单元开始占满名额）
  shuffleInPlace(groups, makeRng(`${seed}#groups`));

  // 3. 轮转取题：每轮从每节课取 1 道，直到取满
  const picked: JumpSampledQuestion[] = [];
  let round = 0;
  while (picked.length < targetSize) {
    let tookAny = false;
    for (const group of groups) {
      if (picked.length >= targetSize) break;
      if (round < group.length) {
        picked.push(group[round]);
        tookAny = true;
      }
    }
    if (!tookAny) break; // 所有课程都取空（理论上到不了这里，兜底防死循环）
    round++;
  }

  // 4. 出题顺序整体再洗一次，避免同一课程的题总是相邻
  return shuffleInPlace(picked, makeRng(`${seed}#order`));
}
