/**
 * srs.ts —— 简化的 Leitner 3-box 间隔重复算法
 *
 * 设计原则：
 *   - 3 个盒子（box 1/2/3），分别对应今天 / 明天 / 3天后 / 7天后的复习节奏
 *   - 答错 → 降级回 box 1
 *   - 答对 → 升级到下一个 box
 *   - 已经在 box 3 且连续答对 N 次 → 暂时"毕业"，不再频繁出现
 *
 * 算法极简，纯前端 + 零依赖，符合公益项目"低成本高效果"的目标。
 */

import type { Question } from "./types";

export type SrsBox = 1 | 2 | 3;

export interface SrsMistakeEntry {
  lessonId: string;
  lessonTitle?: string;
  question: Question;
  /** 首次加入错题本的时间 */
  addedAt: string;
  /** 当前所在 box */
  box?: SrsBox;
  /** 总答对次数 */
  correctCount?: number;
  /** 上次复习时间（ISO） */
  lastReviewedAt?: string;
  /** 下次应当复习的日期（YYYY-MM-DD）。空 = 立即可复习 */
  nextReviewDate?: string;
  /**
   * 已毕业：box 3 且累计答对 ≥ SRS_GRADUATE_MIN_CORRECT。
   * 毕业条目保留在错题本里展示「已掌握」，但不再进入 due 队列。
   */
  graduated?: boolean;
}

/** 毕业线（盒子）：至少升到 box 3。 */
export const SRS_GRADUATE_MIN_BOX = 3;
/** 毕业线（答对次数）：累计答对达到该值（与 iOS reviewMistake 移除条件一致）。 */
export const SRS_GRADUATE_MIN_CORRECT = 2;

/**
 * 毕业判定只需要这三个字段——刻意收窄成最小输入，
 * 让错题本条目、备份里的 BackupMistake、iOS 的 MistakeEntry 都能直接喂进来。
 */
export interface SrsGraduationState {
  graduated?: boolean;
  box?: number;
  correctCount?: number;
}

/**
 * 条目是否达到毕业语义：**显式 graduated 标记，或 box ≥ 3 且累计答对 ≥ 2**。
 *
 * ⚠️ 这是派生判定，不是"只认显式标记"：老档 / 另一端导入的条目常常只有
 * box + correctCount 而没有 graduated 字段，只认标记会让它们永远留在
 * due 队列里反复出现。
 *
 * ⚠️ iOS `Domain/SRS.swift` 必须逐行镜像本判定（due 过滤也必须用它，
 * 不能只判 `graduated != true`）。spec/golden-vectors.json 的 `srsGraduation`
 * 组是双端对照的黄金向量，任何一端改判定都会让两端测试同时飘红。
 */
export function isSrsGraduated(entry: SrsGraduationState): boolean {
  if (entry.graduated === true) return true;
  return (
    (entry.box ?? 1) >= SRS_GRADUATE_MIN_BOX &&
    (entry.correctCount ?? 0) >= SRS_GRADUATE_MIN_CORRECT
  );
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dateNDaysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * 给 SRS 条目应用一次复习结果，返回新的快照（不可变）。
 */
export function reviewSrsEntry(
  entry: SrsMistakeEntry,
  isCorrect: boolean,
): SrsMistakeEntry {
  const next: SrsMistakeEntry = { ...entry };
  next.lastReviewedAt = new Date().toISOString();

  if (!isCorrect) {
    // 答错 → 重置回 box 1，今天就再练
    next.box = 1;
    next.correctCount = 0;
    next.nextReviewDate = todayStr();
    return next;
  }

  // 答对：根据当前 box 升级
  next.correctCount = (next.correctCount ?? 0) + 1;
  const currentBox = (entry.box ?? 1) as SrsBox;

  switch (currentBox) {
    case 1:
      next.box = 2;
      next.nextReviewDate = dateNDaysFromNow(1); // 明天
      break;
    case 2:
      next.box = 3;
      next.nextReviewDate = dateNDaysFromNow(3); // 3 天后
      break;
    case 3:
      next.box = 3;
      next.nextReviewDate = dateNDaysFromNow(7); // 7 天后
      break;
  }
  return next;
}

/**
 * 从错题集筛出"今天应该复习"的题目，并按优先级排序：
 *   1. box 等级低的优先（box 1 > box 2 > box 3）
 *   2. 同 box 内按 lastReviewedAt 旧的优先
 *   3. 没有 nextReviewDate 的视作立即可复习
 *
 * 毕业过滤必须走 isSrsGraduated（派生判定），iOS 侧同名过滤要逐行镜像。
 */
export function getDueSrsEntries(
  entries: SrsMistakeEntry[],
): SrsMistakeEntry[] {
  const today = todayStr();
  const due = entries.filter(e => {
    if (isSrsGraduated(e)) return false; // 毕业条目不再进入复习队列
    if (!e.nextReviewDate) return true;
    return e.nextReviewDate <= today;
  });
  return due.sort((a, b) => {
    const ba = a.box ?? 1;
    const bb = b.box ?? 1;
    if (ba !== bb) return ba - bb;
    const la = a.lastReviewedAt ?? a.addedAt ?? "";
    const lb = b.lastReviewedAt ?? b.addedAt ?? "";
    return la.localeCompare(lb);
  });
}

/**
 * 给一条新错题（首次加入）填充 SRS 默认字段。
 */
export function newSrsEntry(
  partial: Pick<SrsMistakeEntry, "lessonId" | "lessonTitle" | "question">,
): SrsMistakeEntry {
  return {
    ...partial,
    addedAt: new Date().toISOString(),
    box: 1,
    correctCount: 0,
    nextReviewDate: todayStr(),
  };
}
