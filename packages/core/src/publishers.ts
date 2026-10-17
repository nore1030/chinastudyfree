/**
 * publishers.ts —— 出版社（教材版本）单一事实源
 *
 * 同一学科在同一学段/年级可能存在多个出版社版本（例如小学英语既有「人教版PEP」
 * 也有「沪教版」「外研版」「译林版」）。本模块负责：
 *   1. 登记出版社元数据（显示名 / bookId 短标识 / 主题色 / 匹配关键词）；
 *   2. 从教材文件名（stem）中识别出版社；
 *   3. 从教材目录路径中规范化出版社名（用于「教材中心」的出版社筛选）。
 *
 * bookId 规则（保持向后兼容）：默认出版社不加前缀，其他出版社插入短标识：
 *   english-g3up            ← 人教版PEP（默认）
 *   english-hujiao-g3up     ← 沪教版
 *   math-beishida-g7up      ← 北师大版（数学默认是人教版）
 */

export interface PublisherConfig {
  id: string;
  /** 显示名：人教版 / 沪教版 / 北师大版 … */
  label: string;
  /** bookId 中使用的短标识 */
  slug: string;
  /** 主题色（教材卡片/筛选按钮） */
  color: string;
  /** 文件名匹配规则（按数组顺序优先匹配） */
  patterns: RegExp[];
}

export const PUBLISHERS: PublisherConfig[] = [
  { id: "tongbian", label: "统编版", slug: "tongbian", color: "#FF4B4B", patterns: [/统编版/, /部编版/] },
  { id: "pep", label: "人教版PEP", slug: "pep", color: "#1CB0F6", patterns: [/人教版PEP/, /[（(]PEP[)）]/] },
  { id: "hujiaowai", label: "沪外教版", slug: "hujiaowai", color: "#14D4F4", patterns: [/沪外教版/] },
  { id: "hujiao", label: "沪教版", slug: "hujiao", color: "#CE82FF", patterns: [/沪教版/] },
  { id: "beishida", label: "北师大版", slug: "beishida", color: "#58CC02", patterns: [/北师大版/] },
  { id: "sujiao", label: "苏教版", slug: "sujiao", color: "#FF9600", patterns: [/苏教版/] },
  { id: "waiyanshe", label: "外研版", slug: "waiyan", color: "#235390", patterns: [/外研社版/, /外研版/] },
  { id: "yilin", label: "译林版", slug: "yilin", color: "#FFC800", patterns: [/译林版/] },
  { id: "zhejiao", label: "浙教版", slug: "zhejiao", color: "#FF7A45", patterns: [/浙教版/] },
  { id: "jiaoke", label: "教科版", slug: "jiaoke", color: "#FFC800", patterns: [/教科版/] },
  { id: "renjiao", label: "人教版", slug: "renjiao", color: "#58CC02", patterns: [/人教版/] },
  // 大学公共课主流出版社
  { id: "heps", label: "高教社", slug: "heps", color: "#2B70C9", patterns: [/高教社/, /高等教育出版社/] },
  { id: "tsinghua", label: "清华社", slug: "tsinghua", color: "#7C4DFF", patterns: [/清华社/, /清华大学出版社/] },
  // 无特定出版社（如大学公共课）：label「通用」
  { id: "general", label: "通用", slug: "general", color: "#777777", patterns: [] },
];

export const PUBLISHER_BY_ID: Record<string, PublisherConfig> = Object.fromEntries(
  PUBLISHERS.map(p => [p.id, p]),
);

export function resolvePublisher(id: string | undefined): PublisherConfig {
  return (id && PUBLISHER_BY_ID[id]) || PUBLISHER_BY_ID.renjiao;
}

/**
 * 从教材文件名（不含扩展名）中识别出版社。
 * 找不到关键词时返回 null，由调用方使用该学科的默认出版社。
 */
export function findPublisherByStem(stem: string): PublisherConfig | null {
  for (const p of PUBLISHERS) {
    if (p.patterns.some(re => re.test(stem))) return p;
  }
  return null;
}

/**
 * 规范化教材目录路径中的「版本」标签（用于「教材中心」筛选）。
 *
 * ChinaTextbook 的目录形如：
 *   小学/美术/沪教版/义务教育教科书·美术二年级上册.pdf   → 沪教版
 *   小学/美术/沪教版-上海教育出版社/xxx.pdf              → 沪教版（裁掉出版社后缀）
 *   大学/高等数学/同济大学高等数学第六版/xxx.pdf          → 同济大学高等数学第六版（大学无出版社层级，第三段是版本）
 *   大学/概率论/概率论与数理统计(浙大四版).pdf            → 未标注（第三段直接是书名）
 */
export function publisherOfPath(path: string): string {
  const seg = (path || "").split("/")[2] ?? "";
  if (!seg) return "未标注";
  // 第三段是文件名（没有版本层级）时无可标注
  if (/\.pdf$/i.test(seg) || /\.[a-z0-9]{2,4}$/i.test(seg)) return "未标注";
  return seg
    .replace(/-[^-]*出版社.*$/, "") // 去掉「-上海教育出版社」之类后缀
    .replace(/[（(]主编[:：].*?[)）]/g, "") // 去掉「（主编：吴欣）」
    .trim();
}
