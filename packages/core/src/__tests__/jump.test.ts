/**
 * jump.test.ts —— 跳级测试抽题：均匀性 / 去重 / 不足全取 / 确定性
 */

import { describe, expect, it } from "vitest";
import type { Question } from "../types";
import {
  JUMP_PASS_ACCURACY,
  JUMP_TEST_SIZE,
  sampleJumpQuestions,
  type JumpQuestionSource,
} from "../jump";

function makeQuestion(id: number, stem: string): Question {
  return {
    id,
    type: "choice",
    score: 5,
    difficulty: 2,
    knowledge_point: "kp",
    question: stem,
    options: ["A", "B", "C", "D"],
    answer: "A",
    explanation: "",
  };
}

function makeSource(lessonId: string, count: number): JumpQuestionSource {
  return {
    lessonId,
    questions: Array.from({ length: count }, (_, i) =>
      makeQuestion(i + 1, `${lessonId} 第 ${i + 1} 题`),
    ),
  };
}

describe("常量口径", () => {
  it("15 题、0.80 通过线", () => {
    expect(JUMP_TEST_SIZE).toBe(15);
    expect(JUMP_PASS_ACCURACY).toBe(0.8);
  });
});

describe("sampleJumpQuestions: 均匀性", () => {
  it("5 节课各 10 题抽 15 → 每节课恰好 3 题", () => {
    const sources = ["a", "b", "c", "d", "e"].map(id => makeSource(id, 10));
    const picked = sampleJumpQuestions(sources, 15, "seed-1");
    expect(picked).toHaveLength(15);
    const byLesson = new Map<string, number>();
    for (const p of picked) {
      byLesson.set(p.lessonId, (byLesson.get(p.lessonId) ?? 0) + 1);
    }
    expect([...byLesson.values()]).toEqual([3, 3, 3, 3, 3]);
  });

  it("课程数不整除时各课程被抽数最多差 1", () => {
    const sources = ["a", "b", "c", "d"].map(id => makeSource(id, 10));
    const picked = sampleJumpQuestions(sources, 15, "seed-2");
    expect(picked).toHaveLength(15);
    const counts = ["a", "b", "c", "d"].map(
      id => picked.filter(p => p.lessonId === id).length,
    );
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    expect(counts.reduce((s, n) => s + n, 0)).toBe(15);
  });

  it("小课程取空后名额由大课程补足", () => {
    // a 只有 1 题，b/c 很多 → 仍抽满 15
    const sources = [makeSource("a", 1), makeSource("b", 20), makeSource("c", 20)];
    const picked = sampleJumpQuestions(sources, 15, "seed-3");
    expect(picked).toHaveLength(15);
    expect(picked.filter(p => p.lessonId === "a")).toHaveLength(1);
    const b = picked.filter(p => p.lessonId === "b").length;
    const c = picked.filter(p => p.lessonId === "c").length;
    expect(b + c).toBe(14);
    expect(Math.abs(b - c)).toBeLessThanOrEqual(1);
  });
});

describe("sampleJumpQuestions: 去重", () => {
  it("同一课程内重复题目 id 只保留一次", () => {
    const dup: JumpQuestionSource = {
      lessonId: "dup",
      questions: [
        makeQuestion(1, "一"),
        makeQuestion(1, "一（重复）"),
        makeQuestion(2, "二"),
        makeQuestion(2, "二（重复）"),
        makeQuestion(3, "三"),
      ],
    };
    const picked = sampleJumpQuestions([dup], 15, "seed-4");
    expect(picked).toHaveLength(3);
    expect(picked.map(p => p.question.id).sort()).toEqual([1, 2, 3]);
  });

  it("结果内无重复的 (lessonId, questionId) 组合", () => {
    const sources = ["a", "b", "c"].map(id => makeSource(id, 8));
    const picked = sampleJumpQuestions(sources, 15, "seed-5");
    const keys = picked.map(p => `${p.lessonId}#${p.question.id}`);
    expect(new Set(keys).size).toBe(picked.length);
  });
});

describe("sampleJumpQuestions: 不足 15 题时全取", () => {
  it("总题数少于 size → 全部返回", () => {
    const sources = [makeSource("a", 4), makeSource("b", 5)];
    const picked = sampleJumpQuestions(sources, 15, "seed-6");
    expect(picked).toHaveLength(9);
    expect(picked.filter(p => p.lessonId === "a")).toHaveLength(4);
    expect(picked.filter(p => p.lessonId === "b")).toHaveLength(5);
  });

  it("空题库 / 空课程返回空数组", () => {
    expect(sampleJumpQuestions([], 15)).toEqual([]);
    expect(sampleJumpQuestions([{ lessonId: "empty", questions: [] }], 15)).toEqual([]);
    expect(sampleJumpQuestions([makeSource("a", 3)], 0)).toEqual([]);
  });
});

describe("sampleJumpQuestions: 确定性", () => {
  const sources = ["a", "b", "c", "d", "e", "f"].map(id => makeSource(id, 12));

  it("同 seed 结果逐项一致", () => {
    const p1 = sampleJumpQuestions(sources, 15, "same-seed");
    const p2 = sampleJumpQuestions(sources, 15, "same-seed");
    expect(p1.map(p => `${p.lessonId}#${p.question.id}`)).toEqual(
      p2.map(p => `${p.lessonId}#${p.question.id}`),
    );
  });

  it("不同 seed（重试换题）结果不同", () => {
    const p1 = sampleJumpQuestions(sources, 15, "retry-1");
    const p2 = sampleJumpQuestions(sources, 15, "retry-2");
    expect(p1.map(p => `${p.lessonId}#${p.question.id}`)).not.toEqual(
      p2.map(p => `${p.lessonId}#${p.question.id}`),
    );
  });

  it("不改输入数组（纯函数）", () => {
    const src = makeSource("a", 10);
    const before = src.questions.map(q => q.id);
    sampleJumpQuestions([src], 5, "no-mutate");
    expect(src.questions.map(q => q.id)).toEqual(before);
  });
});
