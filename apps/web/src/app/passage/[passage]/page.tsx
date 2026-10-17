import { promises as fs } from "fs";
import path from "path";
import { notFound } from "next/navigation";
import type { BookPassages, SiteIndex } from "@/types";
import { PassageReader } from "@/components/PassageReader";

async function getIndex(): Promise<SiteIndex> {
  const p = path.join(process.cwd(), "public", "data", "index.json");
  return JSON.parse(await fs.readFile(p, "utf-8"));
}

async function getPassages(bookId: string): Promise<BookPassages | null> {
  const p = path.join(process.cwd(), "public", "data", "books", bookId, "passages.json");
  try {
    return JSON.parse(await fs.readFile(p, "utf-8"));
  } catch {
    return null;
  }
}

// 单段动态路由（静态导出友好）：复合键 bookId__passageId
export async function generateStaticParams() {
  const index = await getIndex();
  const params: { passage: string }[] = [];
  for (const book of index.books) {
    try {
      const doc = await getPassages(book.id);
      if (doc) for (const pp of doc.passages) params.push({ passage: `${book.id}__${pp.id}` });
    } catch {
      // 课文缺失时跳过
    }
  }
  // 兜底：未下载课文资源(data/passages)时至少保留 1 个参数，避免静态导出因空数组报错
  if (params.length === 0) params.push({ passage: "__sample__" });
  return params;
}

export default async function ReadingPage({ params }: { params: Promise<{ passage: string }> }) {
  const raw = (await params).passage;
  const sep = raw.indexOf("__");
  const bookId = raw.slice(0, sep);
  const passageId = raw.slice(sep + 2);
  const doc = await getPassages(bookId);
  if (!doc) notFound();
  const passage = doc.passages.find(p => p.id === passageId);
  if (!passage) notFound();
  return <PassageReader passage={passage} backHref={`/reading/${bookId}/`} />;
}
