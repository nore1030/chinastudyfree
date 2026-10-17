/**
 * versions.ts —— 「选完学段 → 按科目选教材版本」的辅助逻辑
 *
 * 背景：同一学科同一阶段常有多个出版社版本（小学英语：人教版PEP / 沪教版 / 外研版 /
 * 译林版…），且**不同版本的互动课程内容不一样**（单元主题、知识点、难度顺序都不同）。
 * 用户在选好学段后，可以按科目记住自己用的版本（progress store 的 subjectVersions），
 * /grade 页据此把「我的版本」排到最前并打徽标。
 *
 * 默认出版社表与 apps/web/scripts/build-data.ts 的 SUBJECTS 保持一致
 * （默认版本 = bookId 不带出版社前缀的那本）。
 */

import type { Book, StageId, SubjectId } from "@/types";
import { PUBLISHER_BY_ID, resolvePublisher } from "@cstf/core/publishers";

/** 学科默认出版社（与 build-data.ts SUBJECTS 的 publisher 字段同源） */
export const DEFAULT_PUBLISHER_BY_SUBJECT: Record<string, string> = {
  math: "renjiao",
  chinese: "tongbian",
  english: "pep",
  science: "jiaoke",
  moral: "tongbian",
  physics: "renjiao",
  chemistry: "renjiao",
  biology: "renjiao",
  history: "tongbian",
  geography: "renjiao",
  politics: "tongbian",
  computer: "general",
};

/**
 * 按「学段 + 学科」取默认出版社。
 * 英语例外：小学默认人教版PEP（一起点/三起点，bookId 无前缀如 english-g3up），
 * 初中/高中默认人教版（bookId 形如 english-renjiao-g7up，因为 stem 里
 * 「人教版」匹配不到「人教版PEP」关键词，按非默认出版社加了 slug 前缀）。
 */
export function defaultPublisherFor(stage: StageId, subject: SubjectId): string {
  if (subject === "english" && stage !== "primary") return "renjiao";
  return DEFAULT_PUBLISHER_BY_SUBJECT[subject] || "renjiao";
}

/** store subjectVersions 的 key：`${stage}:${subject}` */
export function subjectVersionKey(stage: StageId, subject: string): string {
  return `${stage}:${subject}`;
}

export interface SubjectVersionOption {
  /** 出版社 id（publishers.ts），如 hujiao */
  publisherId: string;
  /** 显示名，如「沪教版」 */
  label: string;
  /** 主题色 */
  color: string;
  /** 该版本在本题下的教材册数（上/下册各算一本） */
  bookCount: number;
  /** 是否学科默认版本（默认 = bookId 不带出版社前缀的那本） */
  isDefault: boolean;
  /** 该版本的教材卡片（用于统计单元/课数） */
  books: Book[];
}

/**
 * 某学段某学科下所有可选的教材版本（按册数降序，默认版本优先）。
 * 只有**有互动课程**的版本才会出现在列表里（没有互动课的版本选了也没内容可学）。
 */
export function versionsForSubject(
  stage: StageId,
  subject: SubjectId,
  books: Book[],
): SubjectVersionOption[] {
  const stageBooks = books.filter(
    b => b.stage === stage && (b.subject ?? "math") === subject,
  );
  const byPub = new Map<string, Book[]>();
  for (const b of stageBooks) {
    const pid = b.publisher || DEFAULT_PUBLISHER_BY_SUBJECT[subject] || "renjiao";
    if (!byPub.has(pid)) byPub.set(pid, []);
    byPub.get(pid)!.push(b);
  }
  const defaultId = defaultPublisherFor(stage, subject);
  return [...byPub.entries()]
    .map(([publisherId, list]) => {
      const meta = PUBLISHER_BY_ID[publisherId] ?? resolvePublisher(publisherId);
      return {
        publisherId,
        label: meta.label,
        color: meta.color,
        bookCount: list.length,
        isDefault: publisherId === defaultId,
        books: list,
      };
    })
    .sort(
      (a, b) =>
        Number(b.isDefault) - Number(a.isDefault) ||
        b.bookCount - a.bookCount ||
        a.label.localeCompare(b.label, "zh"),
    );
}

/** 某学科当前生效的出版社 id（用户偏好优先，缺省 = 学科默认） */
export function effectivePublisherId(
  stage: StageId,
  subject: SubjectId,
  books: Book[],
  preferred: string | undefined,
): string {
  if (preferred) {
    const exists = books.some(
      b => b.stage === stage && (b.subject ?? "math") === subject && b.publisher === preferred,
    );
    if (exists) return preferred;
  }
  return defaultPublisherFor(stage, subject);
}

/**
 * 把某学科的教材按「用户选择的版本」排序：我的版本最前，其余按出版社名排。
 * 不隐藏任何版本（不同版本内容不同，保留入口供切换），只排序 + 由 UI 打徽标。
 */
export function orderBooksByVersion(books: Book[], chosenPublisherId: string): Book[] {
  return [...books].sort((a, b) => {
    const aChosen = (a.publisher ?? "") === chosenPublisherId ? 0 : 1;
    const bChosen = (b.publisher ?? "") === chosenPublisherId ? 0 : 1;
    if (aChosen !== bChosen) return aChosen - bChosen;
    // 同学科内：上册优先，再按出版社名
    const sem = (a.semester === "up" ? -1 : 1) - (b.semester === "up" ? -1 : 1);
    if (sem !== 0) return sem;
    return (a.publisherName ?? "").localeCompare(b.publisherName ?? "", "zh");
  });
}
