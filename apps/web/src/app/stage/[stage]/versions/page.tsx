import { notFound } from "next/navigation";
import { InnerHeader } from "@/components/InnerHeader";
import { AppShell } from "@/components/layout/AppShell";
import { VersionPickerClient } from "@/components/VersionPickerClient";
import { STAGES, STAGE_BY_ID, type StageId } from "@cstf/core/stage";

export function generateStaticParams() {
  return STAGES.map(s => ({ stage: s.id }));
}

export default async function StageVersionsPage({
  params,
}: {
  params: Promise<{ stage: string }>;
}) {
  const { stage: stageId } = await params;
  const stage = STAGE_BY_ID[stageId as StageId];
  if (!stage) notFound();

  // 大学按学科 / 课程组织，每门课只有一个出版社版本 → 无需选版本
  if (stage.isCollege) {
    return (
      <AppShell centerMaxWidth={840}>
        <main className="min-h-screen flex flex-col items-center px-4 pt-4 pb-8 lg:pt-2 lg:px-0">
          <InnerHeader backHref="/" title={stage.name} subtitle="按学科 / 课程浏览官方教材" flatOnDesktop />
          <div className="w-full max-w-3xl mx-auto mt-6 rounded-2xl bg-white border-2 border-bg-softer px-5 py-8 text-center">
            <div className="text-lg font-extrabold text-ink">大学课程无需选择版本</div>
            <p className="text-sm text-ink-light mt-2">
              大学按学科 / 课程组织（高数 / 大学英语 / 大学物理…），每门课只有一个出版社版本。
            </p>
            {/* <a> 硬跳转：静态导出 + 安卓 WebView 下 Next <Link> 软导航偶发 404 */}
            <a href={`/textbooks/?stage=${stage.id}`} className="btn-chunky-primary mt-5 inline-block px-8">
              去教材中心
            </a>
          </div>
        </main>
      </AppShell>
    );
  }

  return <VersionPickerClient stage={stage.id} />;
}
