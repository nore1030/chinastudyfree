/**
 * lessonSession —— 「未完成课程会话」的判定口径单一事实源（webrunner-7）。
 *
 * 之前三处各写各的：
 *   - LessonStartModal 用 `index > 0`（index 其实是"答对数"，全答错时恒为 0 → 不提示、也没有重开入口）
 *   - LessonRunner 恢复只看 lessonId（一题未答的空会话也会被当成"有进度"，从而跳过课前知识讲解）
 *   - ContinueLearningCard 用 correctCount + mistakeCount
 * 统一为：**同一课程 + 有过实际作答** 才算可续会话；剩余题数一律看持久化队列长度。
 */

import type { ActiveLessonSession } from "@/store/progress";

/** 本次会话已经首答过的题数（答对 + 答错）—— 全答错也算作答过 */
export function sessionAnsweredCount(session: ActiveLessonSession): number {
  return session.correctCount + session.mistakeCount;
}

/**
 * 会话里是否有「实际作答」。
 * solvedIds / index 只是兜底：老版本会话（无 queueIds/solvedIds）也能正确判定。
 */
export function hasLessonProgress(
  session: ActiveLessonSession | null | undefined,
): session is ActiveLessonSession {
  if (!session) return false;
  if (sessionAnsweredCount(session) > 0) return true;
  if ((session.solvedIds?.length ?? 0) > 0) return true;
  return session.index > 0;
}

/** 该课程是否有可续的会话；有则返回它，否则 null */
export function resumableSession(
  session: ActiveLessonSession | null | undefined,
  lessonId: string,
): ActiveLessonSession | null {
  if (!session || session.lessonId !== lessonId) return null;
  return hasLessonProgress(session) ? session : null;
}

/**
 * 还剩多少题要做。
 * 优先用持久化队列长度（含错题重排回队尾的题，口径与课内进度一致）；
 * 老会话没有 queueIds 时退回 total - index。
 */
export function remainingQuestionCount(
  session: ActiveLessonSession,
  total: number,
): number {
  const queued = session.queueIds?.length ?? 0;
  if (queued > 0) return Math.min(queued, total);
  return Math.max(0, total - session.index);
}
