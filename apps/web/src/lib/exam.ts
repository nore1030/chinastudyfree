/**
 * exam.ts —— 单元挑战（exam 课）的 web 侧小工具
 *
 * 单元挑战课 id 形如 "{bookId}-u{n}-exam"，由 build-data 在该单元
 * exam 题数 ≥4 时产出；outline 的 unit 带 examLessonId/examQuestionCount。
 * XP 倍率真值在 @cstf/core economy（EXAM_XP_MULTIPLIER）。
 */

/** 单元挑战「征服」线：accuracy ≥ 0.8 → 奖杯金色态（与 iOS 同口径） */
export const EXAM_CONQUER_ACCURACY = 0.8;

/** 是否为单元挑战课 id（"{bookId}-u{n}-exam"） */
export function isExamLessonId(id: string): boolean {
  return /-u\d+-exam$/.test(id);
}
