import { promises as fs } from "fs";
import path from "path";
import { StatsBar } from "@/components/StatsBar";
import { AppShell } from "@/components/layout/AppShell";
import { ChangeGradeButton } from "@/components/ChangeGradeButton";
import { GradeSubjectGroups } from "@/components/GradeSubjectGroups";
import type { SiteIndex } from "@/types";
import { gradeFullName, STAGE_BY_ID, stageOfGrade } from "@cstf/core/stage";

async function getIndex(): Promise<SiteIndex> {
  const p = path.join(process.cwd(), "public", "data", "index.json");
  return JSON.parse(await fs.readFile(p, "utf-8"));
}

export async function generateStaticParams() {
  // 小学 1-6 / 初中 7-9 / 高中 10-12 / 大学 13 都预渲染（静态导出下必须全部落盘，
  // 否则从 /stage 页面点进 /grade/7 等会 404；无互动书的年级显示空态）。
  return Array.from({ length: 13 }, (_, i) => ({ grade: String(i + 1) }));
}

export default async function GradePage({ params }: { params: Promise<{ grade: string }> }) {
  const { grade } = await params;
  const gradeNum = Number(grade);
  const index = await getIndex();
  const allBooks = index.books.filter(b => b.grade === gradeNum);

  const gradeName = gradeFullName(gradeNum);
  const stage = STAGE_BY_ID[stageOfGrade(gradeNum)];

  return (
    <AppShell centerMaxWidth={840}>
    <main className="min-h-screen flex flex-col items-center px-4 pt-4 pb-8 lg:pt-2 lg:px-0">
      {/* 页头：移动端带 compact StatsBar；lg+ 由右栏 RightRail 常驻 HUD，不再重复 */}
      <div className="w-full max-w-3xl lg:max-w-none">
        <div className="lg:hidden flex justify-end mb-4">
          <StatsBar compact />
        </div>
        <div className="flex items-end justify-between gap-3 mb-5 lg:mb-8">
          <h1 className="text-2xl lg:text-4xl font-extrabold text-ink leading-tight truncate">
            {gradeName}
          </h1>
          <div className="shrink-0">
            <ChangeGradeButton />
          </div>
        </div>
      </div>
      <div className="w-full">
        {allBooks.length === 0 && (
          <div className="max-w-3xl mx-auto mt-2 lg:mt-4 rounded-2xl bg-white border-2 border-bg-softer px-5 py-8 text-center">
            <div className="text-lg font-extrabold text-ink">{gradeName}的互动课程还在制作中</div>
            <p className="text-sm text-ink-light mt-2">
              你可以先去「教材中心」浏览{stage?.name}的官方课本（来自 ChinaTextbook 开源教材库）。
            </p>
            <a
              href={`/textbooks?stage=${stage?.id ?? "primary"}`}
              className="btn-chunky-primary mt-5 inline-block px-8"
            >
              去教材中心
            </a>
          </div>
        )}

        {/* 按学科分组的教材卡片（客户端：按「我的版本」排序 + 版本快切 chips） */}
        {allBooks.length > 0 && stage && (
          <GradeSubjectGroups books={allBooks} stage={stage.id} />
        )}
      </div>
    </main>
    </AppShell>
  );
}
