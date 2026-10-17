"use client";

/**
 * StageVersionCard —— 学段页顶部的「教材版本」入口卡片。
 *
 * 展示当前各科目版本偏好摘要（英语：沪教版 · 数学：默认…），
 * 点击进入 /stage/{stage}/versions 按科目修改。
 * 没有多版本学科的世段不会渲染本卡片。
 */

import { useEffect, useState } from "react";
import { useProgressStore } from "@/store/progress";
import { SUBJECTS } from "@/lib/subjects";
import { subjectVersionKey, versionsForSubject } from "@/lib/versions";
import type { StageId } from "@cstf/core/stage";
import type { Book, SiteIndex, SubjectId } from "@/types";

export function StageVersionCard({ stage }: { stage: StageId }) {
  const subjectVersions = useProgressStore(s => s.subjectVersions);
  const [books, setBooks] = useState<Book[] | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/data/index.json")
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: SiteIndex) => {
        if (alive) setBooks(data.books ?? []);
      })
      .catch(() => {
        if (alive) setBooks([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (books === null) return null;

  // 只统计「存在多个版本」的学科
  const present = new Set<SubjectId>();
  for (const b of books) {
    if (b.stage === stage) present.add((b.subject ?? "math") as SubjectId);
  }
  const multi = [...present]
    .map(subject => ({ subject, options: versionsForSubject(stage, subject, books) }))
    .filter(g => g.options.length > 1);

  if (multi.length === 0) return null;

  const summary = multi.map(g => {
    const preferred = subjectVersions[subjectVersionKey(stage, g.subject)];
    // 偏好无效（没选过 / 选了个该学段没有的版本）时回退默认版本
    const opt =
      g.options.find(o => o.publisherId === preferred) ?? g.options.find(o => o.isDefault)!;
    return `${SUBJECTS[g.subject]?.label ?? g.subject}：${opt.label}${opt.isDefault ? "（默认）" : ""}`;
  });

  const customCount = multi.filter(g => {
    const preferred = subjectVersions[subjectVersionKey(stage, g.subject)];
    const opt = g.options.find(o => o.publisherId === preferred);
    return opt && !opt.isDefault;
  }).length;

  return (
    <a
      href={`/stage/${stage}/versions/`}
      className="duo-chunky-card group relative block rounded-2xl lg:rounded-3xl select-none overflow-hidden bg-white border-2 border-bg-softer hover:border-secondary/50 transition-colors"
    >
      <div className="flex items-center gap-4 px-5 py-4">
        <div className="w-12 h-12 rounded-full bg-secondary/10 flex items-center justify-center shrink-0 text-2xl">
          📚
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-base lg:text-lg font-extrabold text-ink leading-tight">
            教材版本
            {customCount > 0 && (
              <span className="ml-2 rounded-md bg-secondary/15 px-1.5 py-0.5 text-[10px] font-extrabold text-secondary-dark align-middle">
                已选 {customCount} 科
              </span>
            )}
          </div>
          <div className="text-[11px] lg:text-xs text-ink-light mt-0.5 truncate">
            {summary.join(" · ")}
          </div>
          <div className="text-[11px] lg:text-xs font-semibold text-secondary mt-0.5">
            不同版本学的内容不一样，点此按科目选择 ›
          </div>
        </div>
      </div>
    </a>
  );
}
