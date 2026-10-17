import { promises as fs } from "fs";
import path from "path";
import type { Lesson, SiteIndex } from "@/types";
import type { PathLessonMeta } from "@/components/PathMap";
import { findChestAfterLesson } from "@/lib/chestLogic";
import LessonPageClient from "./LessonPageClient";

async function getIndex(): Promise<SiteIndex> {
  const p = path.join(process.cwd(), "public", "data", "index.json");
  return JSON.parse(await fs.readFile(p, "utf-8"));
}

interface OutlineFile {
  lessons: PathLessonMeta[];
  /** 单元挑战课经由 units[].examLessonId 暴露（不进 lessons 普通节点） */
  units?: Array<{ unit_number: number; examLessonId?: string }>;
}

async function getOutline(bookId: string): Promise<OutlineFile> {
  const p = path.join(process.cwd(), "public", "data", "books", bookId, "outline.json");
  return JSON.parse(await fs.readFile(p, "utf-8"));
}

async function getLesson(bookId: string, lessonId: string): Promise<Lesson> {
  const p = path.join(process.cwd(), "public", "data", "books", bookId, "lessons", `${lessonId}.json`);
  return JSON.parse(await fs.readFile(p, "utf-8"));
}

// 单段动态路由（静态导出友好）：复合键 bookId__lessonId
export async function generateStaticParams() {
  const index = await getIndex();
  const params: { lesson: string }[] = [];
  for (const book of index.books) {
    try {
      const outline = await getOutline(book.id);
      for (const l of outline.lessons) {
        params.push({ lesson: `${book.id}__${l.id}` });
      }
      // ⚔️ 单元挑战课（exam）也要预渲染
      for (const u of outline.units ?? []) {
        if (u.examLessonId) params.push({ lesson: `${book.id}__${u.examLessonId}` });
      }
    } catch {
      // outline 缺失时跳过
    }
  }
  return params;
}

export default async function LessonPage({ params }: { params: Promise<{ lesson: string }> }) {
  const raw = (await params).lesson;
  const sep = raw.indexOf("__");
  const bookId = raw.slice(0, sep);
  const lessonId = raw.slice(sep + 2);
  const [lesson, outline] = await Promise.all([
    getLesson(bookId, lessonId),
    getOutline(bookId),
  ]);
  // 本节课结束后是否紧跟一个宝箱 slot
  const chestSlot = findChestAfterLesson(bookId, outline.lessons, lessonId);
  return <LessonPageClient lesson={lesson} chestSlot={chestSlot} />;
}
