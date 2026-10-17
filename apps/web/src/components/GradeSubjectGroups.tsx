"use client";

/**
 * GradeSubjectGroups —— /grade/[grade] 页的学科分组教材列表（客户端）。
 *
 * 「选完学段 → 按科目选版本」的落点：
 *   - 每个学科分组顶部显示版本 chips（该学科有多个出版社版本时），可一键切换；
 *   - 用户选择的版本排在最前，并打「我的版本」徽标；
 *   - 其他版本仍然展示（不同版本学的内容不一样，保留入口），带出版社徽标。
 *
 * 偏好持久化在 progress store 的 subjectVersions（key: `${stage}:${subject}`）。
 */

import { useEffect, useState } from "react";
import { useProgressStore } from "@/store/progress";
import { SoundLink } from "@/components/SoundLink";
import { SUBJECTS } from "@/lib/subjects";
import { orderBooksByVersion, versionsForSubject } from "@/lib/versions";
import type { Book, StageId, SubjectId } from "@/types";
import { cn } from "@/lib/cn";
import { playSfx } from "@/lib/sfx";
import { haptic } from "@/lib/haptic";

// 按学科分组 —— Duolingo 纯色块 + 代表字 + 厚底阴影
interface SubjectTheme {
  id: SubjectId;
  /** 卡片纯色主背景（Duolingo 官方色） */
  bg: string;
  /** 按下/底部阴影的深色（按钮阴影原理） */
  shadow: string;
  /** 代表字（圆形徽章内） */
  glyph: string;
  tagline: string;
}

// 全用 tailwind config 里配好的 Duolingo 动物色
const THEMES: Record<SubjectId, SubjectTheme> = {
  math: { id: "math", bg: "#58CC02", shadow: "#58A700", glyph: "数", tagline: "加减乘除 · 逻辑推理" },
  chinese: { id: "chinese", bg: "#FF4B4B", shadow: "#EA2B2B", glyph: "语", tagline: "识字认词 · 阅读写作" },
  english: { id: "english", bg: "#1CB0F6", shadow: "#1899D6", glyph: "A", tagline: "听说读写 · 启蒙英语" },
  science: { id: "science", bg: "#FFC800", shadow: "#E0A800", glyph: "科", tagline: "探索自然 · 动手实验" },
  moral: { id: "moral", bg: "#A855F7", shadow: "#9333EA", glyph: "德", tagline: "品德修养 · 法治启蒙" },
  physics: { id: "physics", bg: "#1CB0F6", shadow: "#1899D6", glyph: "物", tagline: "力学电学 · 实验探究" },
  chemistry: { id: "chemistry", bg: "#CE82FF", shadow: "#A560E8", glyph: "化", tagline: "元素反应 · 微观世界" },
  biology: { id: "biology", bg: "#58CC02", shadow: "#58A700", glyph: "生", tagline: "细胞遗传 · 生命奥秘" },
  history: { id: "history", bg: "#FF9600", shadow: "#C2660A", glyph: "史", tagline: "上下千年 · 鉴往知来" },
  geography: { id: "geography", bg: "#14D4F4", shadow: "#0F8FA8", glyph: "地", tagline: "山川湖海 · 人地关系" },
  politics: { id: "politics", bg: "#FF4B4B", shadow: "#EA2B2B", glyph: "政", tagline: "制度理论 · 家国天下" },
  computer: { id: "computer", bg: "#235390", shadow: "#1A3E6B", glyph: "编", tagline: "编程思维 · 数字未来" },
};

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

interface GradeSubjectGroupsProps {
  books: Book[];
  stage: StageId;
}

export function GradeSubjectGroups({ books, stage }: GradeSubjectGroupsProps) {
  const storedVersions = useProgressStore(s => s.subjectVersions);
  const setSubjectVersion = useProgressStore(s => s.setSubjectVersion);
  // 水合守卫：SSR / 首次客户端渲染一律用「无偏好」（与服务端 HTML 一致），
  // 挂载后再套用 localStorage 里的版本偏好，避免 hydration mismatch。
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const subjectVersions = hydrated ? storedVersions : {};

  // 按学科分组
  const bySubject = new Map<SubjectId, Book[]>();
  for (const b of books) {
    const sid = (b.subject ?? "math") as SubjectId;
    if (!bySubject.has(sid)) bySubject.set(sid, []);
    bySubject.get(sid)!.push(b);
  }

  return (
    <div className="space-y-6">
      {SUBJECT_ORDER.map(subjectId => {
        const subjectBooks = bySubject.get(subjectId);
        if (!subjectBooks || subjectBooks.length === 0) return null;
        const theme = THEMES[subjectId];
        const subject = SUBJECTS[subjectId];

        // 版本信息：该学科有哪些出版社版本、当前生效哪个
        const options = versionsForSubject(stage, subjectId, books);
        const preferred = subjectVersions[`${stage}:${subjectId}`];
        const chosenId =
          options.find(o => o.publisherId === preferred)?.publisherId ??
          options.find(o => o.isDefault)?.publisherId ??
          options[0]?.publisherId ??
          "";
        const ordered = orderBooksByVersion(subjectBooks, chosenId);

        return (
          <section key={subjectId}>
            {/* 学科分组 header */}
            <div className="flex items-center gap-2.5 mb-3 px-1">
              <div
                className="w-1.5 h-6 rounded-full shrink-0"
                style={{ backgroundColor: theme.bg }}
              />
              <div className="flex-1 min-w-0">
                <div className="text-base lg:text-xl font-extrabold text-ink">
                  {subject.label}
                </div>
                <div className="text-[11px] lg:text-xs text-ink-light mt-0.5">{theme.tagline}</div>
              </div>
            </div>

            {/* 版本快切 chips —— 仅当该学科有多个出版社版本 */}
            {options.length > 1 && (
              <div className="flex flex-wrap gap-1.5 mb-3 px-1">
                {options.map(opt => {
                  const active = opt.publisherId === chosenId;
                  return (
                    <button
                      key={opt.publisherId}
                      type="button"
                      title={`${opt.label}${opt.isDefault ? "（默认版本）" : ""} · ${opt.bookCount} 册`}
                      onClick={() => {
                        playSfx("tap");
                        haptic("light");
                        // 选默认版本 = 清除偏好
                        setSubjectVersion(stage, subjectId, opt.isDefault ? null : opt.publisherId);
                      }}
                      className={cn(
                        "rounded-lg border-2 px-2 py-1 text-[11px] font-extrabold transition-colors",
                        active
                          ? "text-white"
                          : "bg-white text-ink-light border-bg-softer hover:border-ink-softer",
                      )}
                      style={active ? { backgroundColor: opt.color, borderColor: opt.color } : undefined}
                    >
                      {opt.label}
                      {opt.isDefault && (
                        <span className={cn("ml-1", active ? "text-white/80" : "text-ink-softer")}>默认</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* 该学科的书本卡片 —— Duolingo 纯色块 + 厚底阴影 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 lg:gap-5">
              {ordered.map(book => {
                const isMine = book.publisher === chosenId;
                return (
                  <SoundLink
                    key={book.id}
                    href={`/book/${book.id}/`}
                    hapticIntensity="medium"
                    className="duo-chunky-card group relative block rounded-2xl lg:rounded-3xl select-none overflow-hidden"
                    style={{
                      backgroundColor: theme.bg,
                      boxShadow: `0 5px 0 0 ${theme.shadow}`,
                    }}
                  >
                    <div className="relative flex items-center gap-3 lg:gap-4 px-4 py-3.5 lg:px-5 lg:py-5">
                      {/* 白色圆形徽章内的代表字 —— Duolingo 技能气泡风 */}
                      <div
                        className="w-12 h-12 lg:w-16 lg:h-16 rounded-full bg-white flex items-center justify-center shrink-0"
                        style={{ boxShadow: `inset 0 -3px 0 0 rgba(0,0,0,0.08)` }}
                      >
                        <span
                          className="text-2xl lg:text-3xl font-extrabold"
                          style={{ color: theme.bg }}
                        >
                          {theme.glyph}
                        </span>
                      </div>

                      {/* 白色文字右侧 */}
                      <div className="flex-1 min-w-0 text-white">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] lg:text-xs font-extrabold uppercase tracking-widest opacity-80">
                            {subject.label}
                          </span>
                          {/* 出版社徽标 —— 同一年级同一学科可能有多个版本（如英语人教版 / 沪教版） */}
                          {book.publisherName && (
                            <span
                              className="shrink-0 rounded-md bg-white/25 px-1.5 py-px text-[10px] lg:text-[11px] font-extrabold leading-4"
                              title={`${book.publisherName}版本`}
                            >
                              {book.publisherName}
                            </span>
                          )}
                          {/* 我的版本徽标 */}
                          {isMine && options.length > 1 && (
                            <span
                              className="shrink-0 rounded-md bg-white px-1.5 py-px text-[10px] lg:text-[11px] font-extrabold leading-4"
                              style={{ color: theme.shadow }}
                              title="你在版本选择里选定的版本"
                            >
                              ✓ 我的版本
                            </span>
                          )}
                        </div>
                        <div className="text-base lg:text-xl font-extrabold leading-tight truncate mt-0.5">
                          {book.grade >= 13 ? book.textbookName : `${book.gradeName}${book.semesterName}`}
                        </div>
                        <div className="text-[11px] lg:text-xs font-semibold opacity-85 mt-0.5 lg:mt-1">
                          {book.unitsCount} 单元 · {book.lessonsCount} 节小课
                        </div>
                      </div>

                      {/* 右侧箭头 */}
                      <div className="text-white/90 text-xl lg:text-2xl font-extrabold shrink-0 group-hover:translate-x-1 transition-transform">
                        ›
                      </div>
                    </div>

                    {/* 装饰：右上角的淡色大字光影（像 Duolingo 的背景水印） */}
                    <span
                      aria-hidden
                      className="pointer-events-none absolute -top-2 -right-2 text-[80px] lg:text-[120px] font-extrabold leading-none select-none text-white"
                      style={{ opacity: 0.08 }}
                    >
                      {theme.glyph}
                    </span>
                  </SoundLink>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
