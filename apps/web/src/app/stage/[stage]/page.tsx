import { notFound } from "next/navigation";
import { InnerHeader } from "@/components/InnerHeader";
import { AppShell } from "@/components/layout/AppShell";
import { StageVersionCard } from "@/components/StageVersionCard";
import {
  STAGES,
  STAGE_BY_ID,
  gradeFullName,
  type StageId,
} from "@cstf/core/stage";

export function generateStaticParams() {
  return STAGES.map(s => ({ stage: s.id }));
}

export default async function StagePage({
  params,
}: {
  params: Promise<{ stage: string }>;
}) {
  const { stage: stageId } = await params;
  const stage = STAGE_BY_ID[stageId as StageId];
  if (!stage) notFound();

  // 大学按学科 / 课程组织，无年级 → 直接引导到教材中心
  if (stage.isCollege) {
    return (
      <AppShell centerMaxWidth={840}>
        <main className="min-h-screen flex flex-col items-center px-4 pt-4 pb-8 lg:pt-2 lg:px-0">
          <InnerHeader
            backHref="/"
            title={stage.name}
            subtitle="按学科 / 课程浏览官方教材"
            flatOnDesktop
          />
          <div className="w-full max-w-3xl mx-auto mt-6 rounded-2xl bg-white border-2 border-bg-softer px-5 py-8 text-center">
            <div className="text-lg font-extrabold text-ink">
              {stage.name}教材按学科 / 课程组织
            </div>
            <p className="text-sm text-ink-light mt-2">
              大学没有「年级」概念。去「教材中心」按 高数 / 大学英语 / 大学物理 等课程浏览官方课本。
            </p>
            {/* 用 <a> 硬跳转：静态导出 + 安卓 WebView 下 Next <Link> 软导航偶发 404 */}
            <a
              href={`/textbooks/?stage=${stage.id}`}
              className="btn-chunky-primary mt-5 inline-block px-8"
            >
              去教材中心
            </a>
          </div>
        </main>
      </AppShell>
    );
  }

  // 小学 / 初中 / 高中：列出年级，点进去是该年级的互动课程（或教材中心入口）
  return (
    <AppShell centerMaxWidth={840}>
      <main className="min-h-screen flex flex-col items-center px-4 pt-4 pb-8 lg:pt-2 lg:px-0">
        <InnerHeader
          backHref="/"
          title={stage.name}
          subtitle="选择年级开始学习"
          flatOnDesktop
        />
        {/* 教材版本入口：选完学段后按科目选出版社版本（人教版 / 沪教版…内容不同） */}
        <div className="w-full max-w-3xl mx-auto mt-5">
          <StageVersionCard stage={stage.id} />
        </div>
        <div className="w-full max-w-3xl mx-auto mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 lg:gap-5">
          {stage.grades.map(g => (
            <a
              key={g}
              href={`/grade/${g}/`}
              className="duo-chunky-card group relative block rounded-2xl lg:rounded-3xl select-none overflow-hidden"
              style={{
                backgroundColor: stage.color,
                boxShadow: `0 5px 0 0 ${stage.shadow}`,
              }}
            >
              <div className="relative flex items-center gap-4 px-5 py-5">
                <div className="w-14 h-14 lg:w-16 lg:h-16 rounded-full bg-white flex items-center justify-center shrink-0">
                  <span
                    className="text-2xl lg:text-3xl font-extrabold"
                    style={{ color: stage.color }}
                  >
                    {stage.short}
                  </span>
                </div>
                <div className="flex-1 min-w-0 text-white">
                  <div className="text-base lg:text-xl font-extrabold leading-tight">
                    {gradeFullName(g)}
                  </div>
                  <div className="text-[11px] lg:text-xs font-semibold opacity-85 mt-1">
                    互动课程 / 教材
                  </div>
                </div>
                <div className="text-white/90 text-2xl font-extrabold shrink-0 group-hover:translate-x-1 transition-transform">
                  ›
                </div>
              </div>
            </a>
          ))}
        </div>
      </main>
    </AppShell>
  );
}
