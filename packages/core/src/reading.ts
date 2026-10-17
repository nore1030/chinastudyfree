/**
 * reading.ts —— 阅读完成 id 的单一事实源（双端互通的 key 空间）
 *
 * 背景：历史上两端各写各的 key，completedReadings 的键空间零交集——
 *   web ：`passage-{passageId}-listen` / `passage-{passageId}-followup` / `story-{storyId}`
 *   iOS ：`{passageId}`（听读）/ `{passageId}-followup`（跟读）/ `{storyId}`（故事）
 * 导致备份互通时阅读进度 100% 失配（导入后全部显示未读，还能重复领 XP）。
 *
 * 现在统一为：`reading:{kind}:{rawId}`
 *   - rawId 是数据层的原始 id（Passage.id / Story.id，形如 `chinese-g1up-p3`、`chinese-g3up-s1`），
 *     不带任何平台前后缀；
 *   - BackupEnvelope.completedReadings 里只允许出现这种规范键（buildBackup / validateBackup
 *     会自动归一化）；两端本地存储也应在迁移时用 normalizeReadingMap 整表升级。
 *
 * 值的契约：条目的值是完成日期，**归一化后一定非空**（日期不详时写
 * {@link UNKNOWN_COMPLETION_DATE}）。所以"这篇读没读过"一律按**键是否存在**判断
 * （`map[key] != null`），不要写成 `if (map[key])` —— 两套口径正是重复领 XP 的老病根。
 *
 * ⚠️ iOS `Domain/Reading.swift` 必须逐行镜像 readingId / normalizeReadingId 的规则。
 */

/** 阅读活动的三种类型：课文听读 / 课文跟读 / 故事阅读（含测验）。 */
export type ReadingKind = "listen" | "followup" | "story";

/** 规范键前缀。 */
export const READING_ID_PREFIX = "reading";

const READING_KINDS: readonly ReadingKind[] = ["listen", "followup", "story"];

/** 规范阅读完成 id：`reading:{kind}:{rawId}`。 */
export function readingId(kind: ReadingKind, rawId: string): string {
  return `${READING_ID_PREFIX}:${kind}:${rawId}`;
}

/** 解析规范 id；不是规范格式（或 kind 未知）返回 null。 */
export function parseReadingId(
  id: string,
): { kind: ReadingKind; rawId: string } | null {
  const head = `${READING_ID_PREFIX}:`;
  if (!id.startsWith(head)) return null;
  const rest = id.slice(head.length);
  const sep = rest.indexOf(":");
  if (sep <= 0) return null;
  const kind = rest.slice(0, sep) as ReadingKind;
  const rawId = rest.slice(sep + 1);
  if (!READING_KINDS.includes(kind) || rawId === "") return null;
  return { kind, rawId };
}

/**
 * 故事 id 的形态：`{bookId}-s{序号}`（如 `chinese-g3up-s1`）。
 * 课文 id 是 `{bookId}-p{序号}`（如 `chinese-g1up-p3`），两者不会互相误判。
 */
const STORY_ID_RE = /-s\d+$/;

/**
 * 把历史 id 归一化成规范 id（已是规范 id 则原样返回，**幂等**）。
 *
 * 消歧规则（按顺序匹配，先长后短，避免前缀/后缀互吃）：
 *   1. `reading:{kind}:{raw}`   → 原样（已规范）
 *   2. `story-{raw}`            → story        （web 故事）
 *   3. `passage-{raw}-followup` → followup     （web 跟读）
 *   4. `passage-{raw}-listen`   → listen       （web 听读）
 *   5. `passage-{raw}`          → listen       （web 早期无后缀写法，按听读处理）
 *   6. `{raw}-followup`         → followup     （iOS 跟读）
 *   7. 裸 `{raw}`               → raw 命中 `-s\d+` 时是 story，否则是 listen
 *      （iOS 听读与故事都用裸 id，只能靠 id 形态区分；web 不存在裸 id，
 *        所以这条规则不会误伤 web 老档。）
 *
 * 无法识别的空串返回空串，交给调用方丢弃。
 */
export function normalizeReadingId(legacyId: string): string {
  const id = legacyId.trim();
  if (id === "") return "";

  if (parseReadingId(id)) return id;

  if (id.startsWith("story-")) {
    const raw = id.slice("story-".length);
    return raw === "" ? "" : readingId("story", raw);
  }

  if (id.startsWith("passage-")) {
    let raw = id.slice("passage-".length);
    let kind: ReadingKind = "listen";
    if (raw.endsWith("-followup")) {
      raw = raw.slice(0, -"-followup".length);
      kind = "followup";
    } else if (raw.endsWith("-listen")) {
      raw = raw.slice(0, -"-listen".length);
    }
    return raw === "" ? "" : readingId(kind, raw);
  }

  if (id.endsWith("-followup")) {
    const raw = id.slice(0, -"-followup".length);
    return raw === "" ? "" : readingId("followup", raw);
  }

  return readingId(STORY_ID_RE.test(id) ? "story" : "listen", id);
}

/**
 * 完成日期未知时的占位值。
 *
 * 为什么不能留空串：`completedReadings` 的值只是"完成凭证"，各处读取口径不一
 * （`map[key] != null` vs `if (map[key])`）。一旦某条的值是空串，真值口径会判它
 * **未完成**、存在性口径判它**已完成** —— 同一份数据两套结论，卡片显示"已读"
 * 却还能再领一次 XP（历史上 iOS 导出的值就是空串，导入 web 后每篇都能重复领）。
 * 归一化后一律保证"值非空"，任何口径都得到一致结论。
 *
 * 取值刻意不是日期形态：它是"读过，但不知道哪天"的诚实表达，
 * 不会被误当成 1970 之类的假日期显示给小朋友。
 */
export const UNKNOWN_COMPLETION_DATE = "unknown";

/** 这个完成时间是不是"读过但日期不详"（空串 / 占位值）。 */
function isUnknownCompletion(v: string): boolean {
  return v.trim() === "" || v === UNKNOWN_COMPLETION_DATE;
}

/**
 * 整表归一化（导入侧 + 本地迁移共用）。
 *
 * - 值是完成日期（`YYYY-MM-DD`，老档里可能是 ISO 时间戳，两种都保留原样）；
 * - 多个历史键归到同一个规范键时**保留较早的完成日期**：先比日期部分（前 10 位），
 *   同日再取字典序较小者（即 `2026-08-02` 优于 `2026-08-02T09:00:00Z`），
 *   保证与遍历顺序无关、双端结果一致；
 * - 空键 / 非字符串值直接丢弃；
 * - 空串（或纯空白）日期不覆盖已有的真实日期，且**不会原样留在结果里**——
 *   会写成 {@link UNKNOWN_COMPLETION_DATE}，保证输出中不存在"值为空串"的条目；
 * - 幂等：对结果再跑一次得到完全相同的表。
 */
export function normalizeReadingMap(
  map: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(map ?? {})) {
    if (typeof rawValue !== "string") continue;
    const key = normalizeReadingId(rawKey);
    if (key === "") continue;
    // 日期不详的条目也是"读过"，只是丢了日期：换成占位值，绝不留空串
    const value = rawValue.trim() === "" ? UNKNOWN_COMPLETION_DATE : rawValue;
    const prev = out[key];
    out[key] = prev === undefined ? value : earlierCompletion(prev, value);
  }
  return out;
}

/** 两个完成时间取较早的一个（日期不详的一方永远输给有真实日期的一方）。 */
function earlierCompletion(a: string, b: string): string {
  if (isUnknownCompletion(a)) return isUnknownCompletion(b) ? UNKNOWN_COMPLETION_DATE : b;
  if (isUnknownCompletion(b)) return a;
  const da = a.slice(0, 10);
  const db = b.slice(0, 10);
  if (da !== db) return da < db ? a : b;
  return a <= b ? a : b;
}
