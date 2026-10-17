/**
 * stage.ts —— 学段（小学 / 初中 / 高中 / 大学）单一事实源
 *
 * 原平台只覆盖小学 1-6 年级。为支持初中 / 高中 / 大学，引入「学段」概念：
 *   - primary 小学：年级 1-6
 *   - middle  初中：年级 7-9
 *   - high    高中：年级 10-12
 *   - college 大学：无年级，按学科 / 课程组织
 *
 * 年级 → 学段由 grade 数值推导；年级中文名（一 / 七 / 高一）由 gradeLabel 推导。
 */

export type StageId = "primary" | "middle" | "high" | "college";

export interface StageMeta {
  id: StageId;
  /** 中文名：小学 / 初中 / 高中 / 大学 */
  name: string;
  /** 单字简称：小 / 初 / 高 / 大 */
  short: string;
  /** 该学段包含的年级（college 为空数组） */
  grades: number[];
  /** 是否大学（按学科 / 课程组织，无年级） */
  isCollege: boolean;
  /** 主题色（Duolingo 风），用于学段卡片 / 导航高亮 */
  color: string;
  /** 主题色阴影（厚底按钮用） */
  shadow: string;
}

export const STAGES: StageMeta[] = [
  {
    id: "primary",
    name: "小学",
    short: "小",
    grades: [1, 2, 3, 4, 5, 6],
    isCollege: false,
    color: "#58CC02",
    shadow: "#58A700",
  },
  {
    id: "middle",
    name: "初中",
    short: "初",
    grades: [7, 8, 9],
    isCollege: false,
    color: "#1CB0F6",
    shadow: "#1899D6",
  },
  {
    id: "high",
    name: "高中",
    short: "高",
    grades: [10, 11, 12],
    isCollege: false,
    color: "#FF4B4B",
    shadow: "#EA2B2B",
  },
  {
    id: "college",
    name: "大学",
    short: "大",
    grades: [],
    isCollege: true,
    color: "#FFC800",
    shadow: "#E0A800",
  },
];

export const STAGE_BY_ID: Record<StageId, StageMeta> = Object.fromEntries(
  STAGES.map(s => [s.id, s]),
) as Record<StageId, StageMeta>;

/** 年级（1-12）→ 学段；0 或越界按大学处理 */
export function stageOfGrade(grade: number): StageId {
  if (grade <= 0) return "college";
  if (grade <= 6) return "primary";
  if (grade <= 9) return "middle";
  if (grade <= 12) return "high";
  return "college";
}

/**
 * 学段感知的「年级标签」：
 *   1 → 一, 6 → 六, 7 → 七, 9 → 九, 10 → 高一, 12 → 高三
 */
const GRADE_LABELS: Record<number, string> = {
  1: "一",
  2: "二",
  3: "三",
  4: "四",
  5: "五",
  6: "六",
  7: "七",
  8: "八",
  9: "九",
  10: "高一",
  11: "高二",
  12: "高三",
  13: "大学",
};

export function gradeLabel(grade: number): string {
  return GRADE_LABELS[grade] ?? String(grade);
}

/** 年级全名：一年级 / 七年级 / 高一 / 大学 */
export function gradeFullName(grade: number): string {
  if (grade >= 13) return "大学";
  const label = gradeLabel(grade);
  return label.endsWith("年级") ? label : `${label}年级`;
}

/** 取某学段的年级标签数组（college 返回空） */
export function gradeLabelsForStage(stage: StageId): string[] {
  const meta = STAGE_BY_ID[stage];
  if (!meta || meta.isCollege) return [];
  return meta.grades.map(gradeLabel);
}
