"use client";

/**
 * VersionPickerClient —— 「选完学段 → 按科目选教材版本」交互组件。
 *
 * 同一学科不同出版社版本（人教版 / 沪教版 / 外研版 / 北师大版…）的互动课程
 * **内容不一样**（单元主题 / 知识点 / 难度顺序都不同），所以在进入年级前，
 * 让用户按科目记住自己用的版本。偏好写入 progress store（subjectVersions），
 * /grade 页会把「我的版本」排到最前并打徽标。
 *
 * 只列出**有互动课程**的版本；「默认版本」= bookId 不带出版社前缀的那本
 * （小学英语默认人教版PEP、数学默认人教版、语文默认统编版…）。
 */

import { useEffect, useMemo, useState } from "react";
import { useProgressStore } from "@/store/progress";
import { InnerHeader } from "@/components/InnerHeader";
import { AppShell } from "@/components/layout/AppShell";
import { STAGE_BY_ID, type StageId } from "@cstf/core/stage";
import { SUBJECTS } from "@/lib/subjects";
import {
  defaultPublisherFor,
  subjectVersionKey,
  versionsForSubject,
  type SubjectVersionOption,
} from "@/lib/versions";
import type { Book, SiteIndex, SubjectId } from "@/types";
import { cn } from "@/lib/cn";
import { playSfx } from "@/lib/sfx";
import { haptic } from "@/lib/haptic";

/** 学科展示顺序（与 /grade 页一致，未列出的排最后） */
const SUBJECT_ORDER: SubjectId[] = [
  "math",
  "chinese",
  "english",
  "physics",
  "chemistry",
  "biology",
  "history",
  "geography",
  "politics",
  "moral",
  "science",
  "computer",
];

interface SubjectGroup {
  subject: SubjectId;
  options: SubjectVersionOption[];
  /** 当前生效（含 store 里的旧偏好） */
  current: string;
}

export function VersionPickerClient({ stage }: { stage: StageId }) {
  const stageMeta = STAGE_BY_ID[stage];
  const subjectVersions = useProgressStore(s => s.subjectVersions);
  const setSubjectVersion = useProgressStore(s => s.setSubjectVersion);

  const [books, setBooks] = useState<Book[] | null>(null);
  const [hydrated, setHydrated] = useState(false);
  /** 本次会话的选择：subject → publisherId（null = 用默认版本） */
  const [draft, setDraft] = useState<Record<string, string | null>>({});

  useEffect(() => setHydrated(true), []);

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

  // store 偏好就绪后，初始化草稿
  useEffect(() => {
    if (!hydrated || !books) return;
    const init: Record<string, string | null> = {};
    for (const b of books) {
      if (b.stage !== stage) continue;
      const sid = (b.subject ?? "math") as SubjectId;
      const key = subjectVersionKey(stage, sid);
      init[sid] = subjectVersions[key] ?? null;
    }
    setDraft(init);
  }, [hydrated, books, stage, subjectVersions]);

  const groups: SubjectGroup[] = useMemo(() => {
    if (!books) return [];
    const present = new Set<SubjectId>();
    for (const b of books) {
      if (b.stage === stage) present.add((b.subject ?? "math") as SubjectId);
    }
    return SUBJECT_ORDER.filter(s => present.has(s))
      .map(subject => {
        const options = versionsForSubject(stage, subject, books);
        const current = draft[subject] ?? defaultPublisherFor(stage, subject);
        return { subject, options, current };
      })
      .filter(g => g.options.length > 0);
  }, [books, stage, draft]);

  const multiCount = groups.filter(g => g.options.length > 1).length;
  const chosenCount = groups.filter(
    g => g.options.length > 1 && !g.options.find(o => o.publisherId === g.current)?.isDefault,
  ).length;

  function pick(subject: SubjectId, publisherId: string) {
    playSfx("tap");
    haptic("light");
    setDraft(d => ({ ...d, [subject]: publisherId }));
  }

  function save() {
    playSfx("star");
    haptic("success");
    for (const g of groups) {
      const chosen = draft[g.subject] ?? null;
      const isDefault = g.options.find(o => o.publisherId === chosen)?.isDefault ?? true;
      // 选默认版本 = 清除偏好（保持 store 干净）
      setSubjectVersion(stage, g.subject, isDefault ? null : chosen);
    }
    // 硬跳转：避免 next.js (output: export + trailingSlash) router.push 偶发 404
    window.location.assign(`/stage/${stage}/`);
  }

  if (!stageMeta) return null;

  return (
    <AppShell centerMaxWidth={840}>
      <main className="min-h-screen flex flex-col items-center px-4 pt-4 pb-8 lg:pt-2 lg:px-0">
        <InnerHeader
          backHref={`/stage/${stage}/`}
          title="选择教材版本"
          subtitle={`${stageMeta.name} · 按科目选你用的课本版本`}
          flatOnDesktop
        />

        <div className="w-full max-w-3xl mx-auto mt-5 rounded-2xl bg-white border-2 border-bg-softer px-5 py-4">
          <div className="text-sm font-extrabold text-ink">为什么选版本？</div>
          <p className="text-xs text-ink-light mt-1 leading-relaxed">
            同一科目不同出版社的课本，<b className="text-ink">学的内容不一样</b>
            （单元主题、知识点、难度顺序都不同）。选你正在用的版本，互动课程就会按它来学。
            之后随时可以改。
          </p>
        </div>

        {books === null && (
          <div className="w-full max-w-3xl mx-auto mt-4 rounded-2xl bg-white border-2 border-bg-softer px-5 py-8 text-center text-ink-light text-sm">
            正在加载教材版本…
          </div>
        )}

        {books !== null && multiCount === 0 && (
          <div className="w-full max-w-3xl mx-auto mt-4 rounded-2xl bg-white border-2 border-bg-softer px-5 py-8 text-center">
            <div className="text-base font-extrabold text-ink">
              {stageMeta.name}各科目目前都只有默认版本
            </div>
            <p className="text-sm text-ink-light mt-2">其他出版社版本正在制作中，先去学习吧。</p>
            <button
              type="button"
              onClick={() => {
                playSfx("tap");
                window.location.assign(`/stage/${stage}/`);
              }}
              className="btn-chunky-primary mt-5 px-8"
            >
              去选年级
            </button>          </div>
        )}

        <div className="w-full max-w-3xl mx-auto mt-4 space-y-4">
          {groups.map(g => {
            const subjectMeta = SUBJECTS[g.subject];
            return (
              <section
                key={g.subject}
                className="rounded-2xl bg-white border-2 border-bg-softer px-4 py-3.5"
              >
                <div className="flex items-center gap-2 mb-2.5">
                  <div className="text-base font-extrabold text-ink">{subjectMeta?.label ?? g.subject}</div>
                  {g.options.length === 1 && (
                    <span className="rounded-md bg-bg-soft px-1.5 py-0.5 text-[10px] font-extrabold text-ink-light">
                      仅默认版本
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {g.options.map(opt => {
                    const active = opt.publisherId === g.current;
                    return (
                      <button
                        key={opt.publisherId}
                        type="button"
                        onClick={() => pick(g.subject, opt.publisherId)}
                        className={cn(
                          "flex items-center gap-1.5 rounded-xl border-2 px-3 py-2 text-sm font-extrabold transition-colors",
                          active
                            ? "text-white"
                            : "bg-white text-ink-light border-bg-softer hover:border-ink-softer",
                        )}
                        style={
                          active
                            ? { backgroundColor: opt.color, borderColor: opt.color }
                            : undefined
                        }
                      >
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: active ? "white" : opt.color }}
                        />
                        {opt.label}
                        {opt.isDefault && (
                          <span className={cn("text-[10px]", active ? "text-white/80" : "text-ink-softer")}>
                            默认
                          </span>
                        )}
                        <span className={cn("text-[10px]", active ? "text-white/80" : "text-ink-softer")}>
                          {opt.bookCount} 册
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>

        {/* 底部操作栏 */}
        {multiCount > 0 && (
          <div className="w-full max-w-3xl mx-auto mt-6 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => {
                playSfx("tap");
                window.location.assign(`/stage/${stage}/`);
              }}
              className="text-sm font-extrabold text-ink-light hover:text-ink px-2 py-2 text-left"
            >
              暂时跳过，用默认版本
            </button>
            <button type="button" onClick={save} className="btn-chunky-primary px-10 py-3">
              保存并继续{chosenCount > 0 ? `（已选 ${chosenCount} 科）` : ""}
            </button>
          </div>
        )}
      </main>
    </AppShell>
  );
}
