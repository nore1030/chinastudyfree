"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useProgressStore } from "@/store/progress";
import { InnerHeader } from "@/components/InnerHeader";
import { AppShell } from "@/components/layout/AppShell";
import { STAGES, STAGE_BY_ID, type StageId } from "@cstf/core/stage";
import { publisherOfPath } from "@cstf/core/publishers";
import { BookOpen } from "@/components/icons";
import { cn } from "@/lib/cn";

interface CatalogEntry {
  stage: StageId;
  subject: string;
  grade: string;
  name: string;
  url: string;
  path: string;
}

interface Catalog {
  generatedAt: string;
  source: string;
  note: string;
  count: number;
  entries: CatalogEntry[];
}

export function TextbooksClient() {
  const params = useSearchParams();
  const selectedStage = useProgressStore(s => s.selectedStage);
  const initialStage = (params.get("stage") as StageId) || selectedStage || "primary";

  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [activeStage, setActiveStage] = useState<StageId>(initialStage);
  // 支持 ?publisher= 预设出版社（从「选教材版本」页等位置链接过来时可分享）
  const [activePublisher, setActivePublisher] = useState<string | null>(
    () => params.get("publisher"),
  );
  const [showAllPublishers, setShowAllPublishers] = useState(false);
  const [query, setQuery] = useState("");

  /** 切换出版社：同步写回 URL（replaceState），刷新/分享链接不丢状态 */
  function selectPublisher(name: string | null) {
    setActivePublisher(name);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (name) url.searchParams.set("publisher", name);
      else url.searchParams.delete("publisher");
      window.history.replaceState(null, "", url.toString());
    }
  }

  useEffect(() => {
    let alive = true;
    fetch("/data/textbook-catalog.json")
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: Catalog) => {
        if (alive) setCatalog(data);
      })
      .catch(() => {
        if (alive) setCatalog(null);
      });
    return () => {
      alive = false;
    };
  }, []);

  // 若 URL 带 stage 参数，跟随切换
  useEffect(() => {
    const s = params.get("stage") as StageId | null;
    if (s && STAGE_BY_ID[s]) setActiveStage(s);
  }, [params]);

  // 若 URL 带 publisher 参数（如从版本选择页跳入），跟随选中
  useEffect(() => {
    setActivePublisher(params.get("publisher"));
  }, [params]);

  const stageEntries = useMemo(
    () => (catalog?.entries ?? []).filter(e => e.stage === activeStage),
    [catalog, activeStage],
  );

  // 出版社（教材版本）清单 —— 中国教材同一年级同一学科常有多个版本（人教版 / 沪教版 / 北师大版 …）
  const publishers = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of stageEntries) {
      const p = publisherOfPath(e.path);
      if (p === "未标注") continue;
      counts.set(p, (counts.get(p) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh"));
  }, [stageEntries]);

  // 出版社动辄数十个（小学 65 个），默认只展示前 12 个，其余折叠
  const PUBLISHER_PREVIEW = 12;
  const visiblePublishers = showAllPublishers
    ? publishers
    : publishers.slice(0, PUBLISHER_PREVIEW);

  // 切换学段后，原来选中的出版社若在新学段不存在，则回到「全部」
  useEffect(() => {
    if (activePublisher && !publishers.some(([p]) => p === activePublisher)) {
      setActivePublisher(null);
    }
  }, [publishers, activePublisher]);

  const filtered = useMemo(() => {
    const q = query.trim();
    let list = stageEntries;
    if (activePublisher) list = list.filter(e => publisherOfPath(e.path) === activePublisher);
    if (!q) return list;
    return list.filter(
      e =>
        e.name.includes(q) ||
        e.subject.includes(q) ||
        e.grade.includes(q) ||
        publisherOfPath(e.path).includes(q),
    );
  }, [stageEntries, query, activePublisher]);

  const subjects = useMemo(
    () => [...new Set(filtered.map(e => e.subject))].sort((a, b) => a.localeCompare(b, "zh")),
    [filtered],
  );

  const grouped = useMemo(() => {
    const g: Record<string, Record<string, CatalogEntry[]>> = {};
    for (const e of filtered) {
      (g[e.subject] ??= {});
      (g[e.subject][e.grade] ??= []).push(e);
    }
    return g;
  }, [filtered]);

  const stageMeta = STAGE_BY_ID[activeStage];

  return (
    <AppShell centerMaxWidth={960}>
      <main className="min-h-screen bg-bg-soft lg:bg-transparent">
        <InnerHeader
          backHref="/"
          title="教材中心"
          subtitle={`来自 ChinaTextbook 开源教材库 · 共 ${catalog?.count ?? 0} 本`}
          flatOnDesktop
        />

        {/* 学段切换 */}
        <div className="max-w-3xl lg:max-w-none mx-auto px-4 lg:px-0 pt-3">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {STAGES.map(s => {
              const active = s.id === activeStage;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setActiveStage(s.id)}
                  className={cn(
                    "shrink-0 px-4 py-2 rounded-full font-extrabold text-sm border-2 transition-colors",
                    active ? "text-white" : "bg-white text-ink-light border-bg-softer",
                  )}
                  style={active ? { backgroundColor: s.color, borderColor: s.color } : undefined}
                >
                  {s.name}
                </button>
              );
            })}
          </div>

          {/* 出版社（教材版本）筛选 */}
          {publishers.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1 mt-3">
              <button
                type="button"
                onClick={() => selectPublisher(null)}
                className={cn(
                  "shrink-0 px-3 py-1.5 rounded-full text-xs font-extrabold border-2 transition-colors",
                  activePublisher === null
                    ? "bg-ink text-white border-ink"
                    : "bg-white text-ink-light border-bg-softer",
                )}
              >
                全部版本 {stageEntries.length}
              </button>
              {visiblePublishers.map(([name, count]) => {
                const active = name === activePublisher;
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => selectPublisher(active ? null : name)}
                    className={cn(
                      "shrink-0 px-3 py-1.5 rounded-full text-xs font-extrabold border-2 transition-colors",
                      active
                        ? "bg-secondary text-white border-secondary"
                        : "bg-white text-ink-light border-bg-softer",
                    )}
                  >
                    {name} {count}
                  </button>
                );
              })}
              {publishers.length > PUBLISHER_PREVIEW && (
                <button
                  type="button"
                  onClick={() => setShowAllPublishers(v => !v)}
                  className="shrink-0 px-3 py-1.5 rounded-full text-xs font-extrabold border-2 border-dashed border-bg-softer bg-white text-secondary"
                >
                  {showAllPublishers ? "收起" : `全部 ${publishers.length} 个版本`}
                </button>
              )}
            </div>
          )}

          {/* 搜索 */}
          <div className="mt-3 relative">
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={`在「${stageMeta?.name}」教材中搜索（书名 / 学科 / 年级 / 出版社）`}
              className="w-full px-4 py-3 rounded-2xl border-2 border-bg-softer bg-white text-sm focus:border-secondary outline-none"
            />
          </div>
        </div>

        {/* 列表 */}
        <div className="max-w-3xl lg:max-w-none mx-auto px-4 lg:px-0 py-4 space-y-5">
          {!catalog && (
            <div className="rounded-2xl bg-white border-2 border-bg-softer px-5 py-8 text-center text-ink-light">
              正在加载教材目录…
            </div>
          )}

          {catalog && subjects.length === 0 && (
            <div className="rounded-2xl bg-white border-2 border-bg-softer px-5 py-8 text-center text-ink-light">
              {query.trim() || activePublisher
                ? "没有符合条件的教材，换个关键词或点「全部版本」看看。"
                : "该学段暂无可浏览的教材。"}
            </div>
          )}

          {subjects.map(subject => {
            const grades = Object.keys(grouped[subject] ?? {}).sort((a, b) =>
              a.localeCompare(b, "zh"),
            );
            return (
              <section key={subject}>
                <div className="flex items-center gap-2 mb-2 px-1">
                  <div
                    className="w-1.5 h-6 rounded-full shrink-0"
                    style={{ backgroundColor: stageMeta?.color }}
                  />
                  <div className="text-base lg:text-lg font-extrabold text-ink">{subject}</div>
                  <div className="text-xs text-ink-light">
                    {grades.reduce((n, g) => n + (grouped[subject][g]?.length ?? 0), 0)} 本
                  </div>
                </div>

                <div className="space-y-3">
                  {grades.map(grade => (
                    <div
                      key={grade}
                      className="rounded-2xl bg-white border border-bg-softer overflow-hidden"
                    >
                      <div className="px-4 py-2 bg-bg-soft text-xs font-extrabold text-ink-light">
                        {grade}
                      </div>
                      <ul className="divide-y divide-bg-softer">
                        {grouped[subject][grade].map(e => {
                          const version = publisherOfPath(e.path);
                          return (
                            <li key={e.path}>
                              <a
                                href={e.url}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-3 px-4 py-3 hover:bg-bg-soft transition-colors"
                              >
                                <BookOpen className="w-5 h-5 text-ink-softer shrink-0" />
                                <span className="flex-1 min-w-0 text-sm text-ink truncate">
                                  {e.name}
                                </span>
                                {version !== "未标注" && (
                                  <span
                                    className="shrink-0 max-w-[130px] truncate rounded-md bg-bg-soft px-1.5 py-0.5 text-[10px] font-extrabold text-ink-light"
                                    title={version}
                                  >
                                    {version}
                                  </span>
                                )}
                                <span className="text-[11px] text-secondary font-extrabold shrink-0">
                                  查看 ›
                                </span>
                              </a>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </main>
    </AppShell>
  );
}
