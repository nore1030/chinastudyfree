/**
 * week.ts —— 「一周」与「日期键」的单一事实源
 *
 * 双端（web / iOS）凡是涉及"本周"的功能——联赛周榜、周报、连胜日历——
 * 都必须用这里的日历周定义，**不允许**再出现"最近滚动 7 天"之类的第二套窗口。
 *
 * 约定：
 *   - 日期键统一为本地时区的 `YYYY-MM-DD`（dateKey）；
 *   - 一周从**周一**开始、到**周日**结束（中国校历习惯）；
 *   - 周键（weekKey）= 该周周一的 dateKey；
 *   - 全部按本地日历日计算，不做 UTC 换算，跨月 / 跨年 / 夏令时都安全。
 *
 * ⚠️ iOS `Domain/Week.swift`（或等价工具）必须镜像同一套定义：
 *    weekStartKey / weekDateKeys / dayIndexInWeek 三个函数逐行对齐。
 */

/** 本地时区下把 Date 格式化成 `YYYY-MM-DD`。 */
export function dateKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** `YYYY-MM-DD` 是否是结构合法的日期键（含真实存在性校验，如 2026-02-30 为假）。 */
export function isDateKey(key: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const [y, m, d] = key.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const probe = new Date(y, m - 1, d);
  return (
    probe.getFullYear() === y && probe.getMonth() === m - 1 && probe.getDate() === d
  );
}

/**
 * 解析日期键为**本地时区当天 00:00** 的 Date。
 * 非法键返回 null（调用方自行兜底，绝不抛异常炸掉渲染）。
 */
export function parseDateKey(key: string): Date | null {
  if (!isDateKey(key)) return null;
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/**
 * date 所在**日历周**的周一的日期键（本地时区）。周一自身返回当天。
 *
 * 例：2026-08-30（周日）→ 2026-08-24；2026-08-31（周一）→ 2026-08-31。
 */
export function weekStartKey(date: Date = new Date()): string {
  const day = date.getDay(); // 0=周日..6=周六
  const offset = (day + 6) % 7; // 距本周周一的天数
  return dateKey(new Date(date.getFullYear(), date.getMonth(), date.getDate() - offset));
}

/**
 * 一周 7 天的日期键，**周一 → 周日**顺序（下标 0..6 即 dayIndexInWeek）。
 *
 * 入参既可以是周键本身，也可以是该周内任意一天的日期键——内部一律先归一到
 * 周一，避免调用方各自"先算周一"造成偏差。非法键回退到"今天所在的周"。
 */
export function weekDateKeys(key: string): string[] {
  const parsed = parseDateKey(key);
  const monday = parsed
    ? new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate() - ((parsed.getDay() + 6) % 7))
    : parseDateKey(weekStartKey())!;
  return Array.from({ length: 7 }, (_, i) =>
    dateKey(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i)),
  );
}

/**
 * date 相对 weekKey 那一周周一的天序（周一=0 … 周日=6；早于周一为负，晚于周日 >6）。
 * 用本地日历日的差值计算，对夏令时用 round 兜底。非法 weekKey 回退到本周。
 */
export function dayIndexInWeek(weekKey: string, date: Date): number {
  const monday = parseDateKey(weekKey) ?? parseDateKey(weekStartKey())!;
  const midnight = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((midnight.getTime() - monday.getTime()) / 86_400_000);
}
