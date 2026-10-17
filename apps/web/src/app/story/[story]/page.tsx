import { promises as fs } from "fs";
import path from "path";
import { notFound } from "next/navigation";
import type { BookStories, SiteIndex } from "@/types";
import StoryReaderClient from "./StoryReaderClient";

async function getIndex(): Promise<SiteIndex> {
  const p = path.join(process.cwd(), "public", "data", "index.json");
  return JSON.parse(await fs.readFile(p, "utf-8"));
}

async function getStories(bookId: string): Promise<BookStories | null> {
  const p = path.join(process.cwd(), "public", "data", "books", bookId, "stories.json");
  try {
    return JSON.parse(await fs.readFile(p, "utf-8"));
  } catch {
    return null;
  }
}

// 单段动态路由（静态导出友好）：复合键 bookId__storyId
export async function generateStaticParams() {
  const index = await getIndex();
  const params: { story: string }[] = [];
  for (const book of index.books) {
    try {
      const doc = await getStories(book.id);
      if (doc) for (const s of doc.stories) params.push({ story: `${book.id}__${s.id}` });
    } catch {
      // 故事缺失时跳过
    }
  }
  // 兜底：未下载故事资源(data/stories)时至少保留 1 个参数，避免静态导出因空数组报错
  if (params.length === 0) params.push({ story: "__sample__" });
  return params;
}

export default async function StoryPage({ params }: { params: Promise<{ story: string }> }) {
  const raw = (await params).story;
  const sep = raw.indexOf("__");
  const bookId = raw.slice(0, sep);
  const storyId = raw.slice(sep + 2);
  const doc = await getStories(bookId);
  if (!doc) notFound();
  const story = doc.stories.find(s => s.id === storyId);
  if (!story) notFound();
  return <StoryReaderClient story={story} backHref={`/stories/${bookId}/`} />;
}
