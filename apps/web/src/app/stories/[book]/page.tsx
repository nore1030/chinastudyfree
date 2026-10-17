import { promises as fs } from "fs";
import path from "path";
import { notFound } from "next/navigation";
import { SubjectBadge } from "@/components/SubjectBadge";
import { InnerHeader } from "@/components/InnerHeader";
import { AppShell } from "@/components/layout/AppShell";
import type { BookStories, SiteIndex } from "@/types";
import { StoryCard } from "./StoryCard";

async function getIndex(): Promise<SiteIndex> {
  const p = path.join(process.cwd(), "public", "data", "index.json");
  return JSON.parse(await fs.readFile(p, "utf-8"));
}

async function getStories(bookId: string): Promise<BookStories | null> {
  const p = path.join(
    process.cwd(),
    "public",
    "data",
    "books",
    bookId,
    "stories.json",
  );
  try {
    return JSON.parse(await fs.readFile(p, "utf-8"));
  } catch {
    return null;
  }
}

export async function generateStaticParams() {
  const index = await getIndex();
  const params = index.books.filter(b => b.hasStories).map(b => ({ book: b.id }));
  // 同 reading/[book]：没有故事数据（data/stories 未下载）时注入占位参数，保证可静态导出。
  if (params.length === 0) params.push({ book: "__sample__" });
  return params;
}

export default async function StoryListPage({
  params,
}: {
  params: Promise<{ book: string }>;
}) {
  const { book: bookId } = await params;
  const index = await getIndex();
  const book = index.books.find(b => b.id === bookId);
  if (!book) notFound();
  const doc = await getStories(bookId);
  if (!doc) notFound();

  // Group stories by unit
  const byUnit = new Map<number, typeof doc.stories>();
  for (const s of doc.stories) {
    if (!byUnit.has(s.unitNumber)) byUnit.set(s.unitNumber, []);
    byUnit.get(s.unitNumber)!.push(s);
  }
  const units = [...byUnit.entries()].sort((a, b) => a[0] - b[0]);

  return (
    <AppShell centerMaxWidth={720}>
    <main className="min-h-screen bg-bg-soft lg:bg-transparent">
      <InnerHeader
        backHref={`/book/${bookId}/`}
        title={`${book.textbookName}·故事`}
        subtitle={`${doc.stories.length} 篇故事 · 阅读理解`}
        badge={<SubjectBadge book={book} />}
        flatOnDesktop
      />

      <div className="max-w-md lg:max-w-none mx-auto px-4 lg:px-0 py-5 lg:pt-2 space-y-6">
        {units.map(([unitNum, stories]) => (
          <div key={unitNum}>
            <div className="text-xs font-extrabold text-ink-softer uppercase tracking-wider mb-2 px-1">
              第{unitNum}单元 · {stories[0].unitTitle}
            </div>
            <div className="space-y-3 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-3">
              {stories.map(s => (
                <StoryCard key={s.id} story={s} bookId={bookId} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </main>
    </AppShell>
  );
}
