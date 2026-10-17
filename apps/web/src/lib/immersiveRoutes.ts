/**
 * immersiveRoutes.ts —— 「沉浸式路由」的单一事实源
 *
 * 沉浸页 = 用户正在专注答题 / 阅读的整屏页面。这些页面：
 *   - 不显示底部固定导航（BottomNav），否则会盖住底部的「检查 / 继续」按钮；
 *   - 不弹全屏结算 Modal（LeagueWatcher / DailyRewardWatcher 等全局看门人），
 *     否则会把用户从答题流里硬生生打断。
 *
 * ⚠️ 新增任何整屏答题 / 阅读路由，只需在下面这一张表里加一行；
 *    **不要**再在组件里各写一份前缀数组——历史上正是因为三个组件各抄一遍，
 *    /jump/ 与 /review/runner/ 被漏掉，底栏盖住了「检查」按钮。
 */

/** 沉浸式路径的匹配规则（对 usePathname() 的返回值求值）。 */
export const IMMERSIVE_PATTERNS: readonly RegExp[] = [
  /** 课程答题 /lesson/{book}/{lesson}/ */
  /^\/lesson(\/|$)/,
  /** 跳级测试 /jump/ */
  /^\/jump(\/|$)/,
  /** 错题复习 runner /review/runner/（注意：错题本列表 /review/ 仍保留导航） */
  /^\/review\/runner(\/|$)/,
  /** 课文阅读器 /reading/{book}/{passage}/（列表页 /reading/{book}/ 保留导航） */
  /^\/reading\/[^/]+\/[^/]+/,
  /** 故事阅读器 /stories/{book}/{story}/（列表页 /stories/{book}/ 保留导航） */
  /^\/stories\/[^/]+\/[^/]+/,
];

/** 该路径是否是沉浸式页面（答题 / 阅读器）。 */
export function isImmersivePath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return IMMERSIVE_PATTERNS.some(re => re.test(pathname));
}
