/**
 * build-data.ts
 *
 * 把 ../output/{subject}/ 下的 outlines/ + quizzes/ + knowledge/ 转换成
 * frontend/public/data/ 下前端可直接 fetch 的结构。
 *
 * 多学科支持：遍历 output/{math,chinese,english,science}/ 每个子目录。
 *
 * bookId 规则：
 *   - math 维持 `g1up` 等老格式（兼容老用户 localStorage 进度）
 *   - 非 math 学科带前缀：`chinese-g1up` / `english-g3up` / `science-g1up`
 */

import { createHash } from "crypto";
import { existsSync, promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type {
  Lesson,
  Outline,
  QuizFile,
  Question,
  Book,
  SiteIndex,
  SubjectId,
  Passage,
  BookPassages,
  Story,
  StoryQuestion,
  BookStories,
} from "../src/types/index.js";
import { stageOfGrade, STAGE_BY_ID, gradeFullName } from "@cstf/core/stage";
import {
  findPublisherByStem,
  resolvePublisher,
  type PublisherConfig,
} from "@cstf/core/publishers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
// Repo root is two levels up from apps/web (ROOT)
const REPO_ROOT = path.resolve(ROOT, "..", "..");
const OUTPUT_SRC = path.resolve(REPO_ROOT, "output");
const PASSAGES_SRC = path.resolve(REPO_ROOT, "data", "passages");
const STORIES_SRC = path.resolve(REPO_ROOT, "data", "stories");
const DATA_DST = path.resolve(ROOT, "public", "data");
const AUDIO_ROOT = path.resolve(ROOT, "public", "audio");
const PAGES_ROOT = path.resolve(ROOT, "public", "textbook-pages");
const STORY_IMAGES_ROOT = path.resolve(ROOT, "public", "story-images");

// ============================================================
// TTS 音频映射：与 scripts/tts/generate-audio.mjs 的 hash 规则保持一致
//   - normalize: trim + 折叠空白
//   - hash:      sha1(text)
//   - rel path:  /audio/<hash[0:2]>/<hash><ext>
// 仅当对应音频已生成时才注入路径，避免前端 404。
//
// 扩展名不写死：生成脚本默认产 .opus，也可产 .mp3 / .wav
// （见 AUDIO_EXTS，按优先级取第一个实际存在的）。
// 若 public/audio 整个缺失（未生成），所有 audioFor() 返回 undefined，
// 前端会降级到「在线合成 → 浏览器 speechSynthesis」，仍有声音（见 lib/tts.ts）。
// ============================================================

/** 支持的音频扩展名，按优先级排列（opus 体积最小，优先）。 */
const AUDIO_EXTS = [".opus", ".mp3", ".wav"] as const;

function normalizeText(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

function textHash(text: string): string {
  return createHash("sha1").update(text, "utf8").digest("hex");
}

/** 音频的相对 key（不含扩展名）：`<hash[0:2]>/<hash>` */
function audioRel(text: string): string {
  const h = textHash(text);
  return `${h.slice(0, 2)}/${h}`;
}

let audioIndex: Set<string> | null = null;

async function buildAudioIndex(): Promise<Set<string>> {
  if (audioIndex) return audioIndex;
  const set = new Set<string>();
  if (!existsSync(AUDIO_ROOT)) {
    audioIndex = set;
    return set;
  }
  const buckets = await fs.readdir(AUDIO_ROOT);
  for (const b of buckets) {
    const dir = path.join(AUDIO_ROOT, b);
    let entries: string[];
    try {
      entries = await fs.readdir(dir);
    } catch {
      continue;
    }
    for (const f of entries) {
      const ext = AUDIO_EXTS.find(e => f.endsWith(e));
      if (ext) set.add(`${b}/${f.slice(0, f.length - ext.length)}`);
    }
  }
  audioIndex = set;
  return set;
}

function audioFor(text: string | undefined | null): string | undefined {
  if (!text) return undefined;
  const norm = normalizeText(text);
  if (!norm) return undefined;
  const rel = audioRel(norm);
  if (!audioIndex) return undefined;
  for (const ext of AUDIO_EXTS) {
    if (audioIndex.has(`${rel}${ext}`)) return `/audio/${rel}${ext}`;
  }
  return undefined;
}

function stripOptionPrefix(opt: string): string {
  return opt.replace(/^[A-Da-d][.、]\s*/, "");
}

// ============================================================
// 题型改派（web-lesson-13）：fill_blank / calculation 走数字键盘，
// 但部分题的答案含非数字字符（汉字/单位/①② 等），数字键盘根本打不出来
// → 构建时自动改派为 fill_blank_text（文字输入，汉字键盘可答）。
// ============================================================

/** 数字键盘可输入的字符集：0-9 . / -（分数、小数、负数、比号用斜杠） */
const NUMERIC_ANSWER_RE = /^[0-9./-]+$/;

let retypedQuestionCount = 0;

/**
 * 答案无法用数字键盘作答的 fill_blank / calculation 题，改派为
 * fill_blank_text。返回（可能被改派过的）同一个对象。
 */
function normalizeQuestionType(q: Question): Question {
  if (q.type !== "fill_blank" && q.type !== "calculation") return q;
  const answer = (q.answer ?? "").trim();
  if (answer !== "" && NUMERIC_ANSWER_RE.test(answer)) return q;
  q.type = "fill_blank_text";
  retypedQuestionCount++;
  return q;
}

// ============================================================
// 单元挑战（Wave E1）：exam 题库复活
//   - 每个 exam 题数 ≥4 的单元产出挑战课 "{bookId}-u{n}-exam"
//   - 题目取 exam 全部，上限 15，超出按均匀抽样
//   - outline 的 unit 注入 examLessonId / examQuestionCount
// ============================================================

/** 挑战课成课的最小 exam 题数 */
const EXAM_MIN_QUESTIONS = 4;
/** 挑战课题目上限（超出均匀抽样） */
const EXAM_MAX_QUESTIONS = 15;

let examLessonCount = 0;
let examQuestionTotal = 0;

/** 均匀抽样：n ≤ cap 全取；否则取下标 floor(i * n / cap)（i = 0..cap-1），保持原序 */
function sampleUniform<T>(items: T[], cap: number): T[] {
  if (items.length <= cap) return items;
  const out: T[] = [];
  for (let i = 0; i < cap; i++) {
    out.push(items[Math.floor((i * items.length) / cap)]);
  }
  return out;
}

function decorateQuestion(q: Question): Question {
  const audio: NonNullable<Question["audio"]> = {};
  const qa = audioFor(q.question);
  if (qa) audio.question = qa;
  if (q.options && q.options.length) {
    const opts = q.options.map(o => audioFor(stripOptionPrefix(o)) ?? null);
    if (opts.some(Boolean)) audio.options = opts;
  }
  const ea = audioFor(q.explanation);
  if (ea) audio.explanation = ea;
  if (Object.keys(audio).length) q.audio = audio;
  return q;
}

function decorateKnowledge<T extends { point: string; core_concept: string; key_formula: string; tips: string; common_mistakes: string[]; audio?: unknown }>(
  ks: T,
): T {
  const audio: Record<string, unknown> = {};
  const p = audioFor(ks.point); if (p) audio.point = p;
  const c = audioFor(ks.core_concept); if (c) audio.core_concept = c;
  const f = audioFor(ks.key_formula); if (f) audio.key_formula = f;
  const t = audioFor(ks.tips); if (t) audio.tips = t;
  if (Array.isArray(ks.common_mistakes) && ks.common_mistakes.length) {
    const cm = ks.common_mistakes.map(m => audioFor(m) ?? null);
    if (cm.some(Boolean)) audio.common_mistakes = cm;
  }
  if (Object.keys(audio).length) (ks as { audio?: unknown }).audio = audio;
  return ks;
}

// ============================================================
// 课文听读（passages）构建
// 读 data/passages/{subject}/{bookId}.json，对每个 sentence 注入音频路径，
// 输出到 public/data/books/{bookId}/passages.json
// 返回一个 Set，记录有课文的 bookId，供上游给 Book 打 hasPassages 标记
// ============================================================

/**
 * 读 render_pages.py 写的 pages.json 映射。
 * 结构：{ bookId, offset, passages: [{passage_id, page_hint, pdf_page, pages: [n...]}] }
 * 这个映射已经把 Gemini 的 page_hint 应用了书级 offset，得到真实 PDF 物理页 + ±1 兜底。
 */
interface PagesMapping {
  bookId: string;
  offset: number;
  passages: Array<{
    passage_id: string;
    page_hint: number | null;
    pdf_page: number | null;
    pages: number[];
  }>;
}

interface PagesInfo {
  pdfPage: number | null;
  pages: number[];
}

async function loadPagesMapping(bookId: string): Promise<Map<string, PagesInfo>> {
  const file = path.join(PAGES_ROOT, bookId, "pages.json");
  if (!existsSync(file)) return new Map();
  try {
    const doc = JSON.parse(await fs.readFile(file, "utf-8")) as PagesMapping;
    return new Map(
      doc.passages.map(p => [
        p.passage_id,
        { pdfPage: p.pdf_page, pages: p.pages },
      ]),
    );
  } catch {
    return new Map();
  }
}

async function buildPassages(): Promise<Set<string>> {
  const withPassages = new Set<string>();
  if (!existsSync(PASSAGES_SRC)) {
    console.log("  [跳过] data/passages/ 不存在，无课文听读数据");
    return withPassages;
  }
  const subjectDirs = await fs.readdir(PASSAGES_SRC);
  let totalBooks = 0;
  let totalPassages = 0;
  let totalSentences = 0;
  let audioHit = 0;
  let passageWithImage = 0;

  for (const subject of subjectDirs) {
    const subjectDir = path.join(PASSAGES_SRC, subject);
    let stat;
    try {
      stat = await fs.stat(subjectDir);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;

    const files = (await fs.readdir(subjectDir)).filter(
      f => f.endsWith(".json") && !f.endsWith(".draft.json"),
    );
    for (const f of files) {
      const srcPath = path.join(subjectDir, f);
      let doc: {
        bookId: string;
        subject: SubjectId;
        textbook: string;
        passages: Array<{
          id: string;
          unitNumber: number | null;
          lessonNumber: number;
          title: string;
          kind: Passage["kind"];
          author?: string | null;
          language: "Chinese" | "English";
          sentences: string[];
          page_hint?: number | null;
        }>;
      };
      try {
        doc = JSON.parse(await fs.readFile(srcPath, "utf-8"));
      } catch (e) {
        console.warn(`  ⚠️  解析失败 ${f}: ${(e as Error).message}`);
        continue;
      }

      const bookId = doc.bookId;
      if (!bookId || !Array.isArray(doc.passages) || doc.passages.length === 0) {
        continue;
      }

      const pagesMap = await loadPagesMapping(bookId);

      const enriched: Passage[] = doc.passages.map(p => {
        const info = pagesMap.get(p.id) ?? { pdfPage: null, pages: [] };
        const pageImages = info.pages.map(
          n => `/textbook-pages/${bookId}/p${n}.jpg`,
        );
        if (pageImages.length > 0) passageWithImage++;
        return {
          id: p.id,
          bookId,
          unitNumber: p.unitNumber,
          lessonNumber: p.lessonNumber,
          title: p.title,
          kind: p.kind,
          author: p.author ?? null,
          language: p.language,
          pageHint: p.page_hint ?? null,
          pdfPage: info.pdfPage,
          pageImages,
          sentences: p.sentences.map(s => {
            const audio = audioFor(s);
            if (audio) audioHit++;
            totalSentences++;
            return { text: s, audio };
          }),
        };
      });

      const bookDir = path.join(DATA_DST, "books", bookId);
      await fs.mkdir(bookDir, { recursive: true });
      const out: BookPassages = {
        bookId,
        subject: doc.subject,
        textbook: doc.textbook,
        passages: enriched,
      };
      await fs.writeFile(
        path.join(bookDir, "passages.json"),
        JSON.stringify(out, null, 2),
        "utf-8",
      );

      withPassages.add(bookId);
      totalBooks++;
      totalPassages += enriched.length;
    }
  }

  console.log(
    `📖 课文听读: ${totalBooks} 本 / ${totalPassages} 篇 / ${totalSentences} 句 ` +
      `(${audioHit} 句已生成 TTS, ${totalSentences - audioHit} 句待合成)`,
  );
  console.log(
    `📕 课本原页: ${passageWithImage}/${totalPassages} 篇挂上了 pageImages`,
  );
  return withPassages;
}

// ============================================================
// 故事阅读（stories）构建
// 读 data/stories/{subject}/{bookId}.json，注入 TTS 音频路径，
// 输出到 public/data/books/{bookId}/stories.json
// ============================================================

function decorateStoryQuestion(q: StoryQuestion): StoryQuestion {
  const audio: NonNullable<StoryQuestion["audio"]> = {};
  const qa = audioFor(q.question);
  if (qa) audio.question = qa;
  if (q.options && q.options.length) {
    const opts = q.options.map(o => audioFor(o) ?? null);
    if (opts.some(Boolean)) audio.options = opts;
  }
  const ea = audioFor(q.explanation);
  if (ea) audio.explanation = ea;
  if (Object.keys(audio).length) q.audio = audio;
  return q;
}

async function buildStories(): Promise<Set<string>> {
  const withStories = new Set<string>();
  if (!existsSync(STORIES_SRC)) {
    console.log("  [跳过] data/stories/ 不存在，无故事数据");
    return withStories;
  }
  const subjectDirs = await fs.readdir(STORIES_SRC);
  let totalBooks = 0;
  let totalStories = 0;
  let totalSentences = 0;
  let audioHit = 0;

  for (const subject of subjectDirs) {
    const subjectDir = path.join(STORIES_SRC, subject);
    let stat;
    try {
      stat = await fs.stat(subjectDir);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;
    // skip cache dir
    if (subject.startsWith(".")) continue;

    const files = (await fs.readdir(subjectDir)).filter(
      f => f.endsWith(".json"),
    );
    for (const f of files) {
      const srcPath = path.join(subjectDir, f);
      let doc: {
        bookId: string;
        subject: SubjectId;
        textbook: string;
        grade: number;
        stories: Array<{
          id: string;
          unitNumber: number;
          unitTitle: string;
          storyIndex: number;
          title: string;
          language: "Chinese" | "English";
          sentences: string[];
          vocabulary_used?: string[];
          questions: StoryQuestion[];
        }>;
      };
      try {
        doc = JSON.parse(await fs.readFile(srcPath, "utf-8"));
      } catch (e) {
        console.warn(`  ⚠️  解析失败 ${f}: ${(e as Error).message}`);
        continue;
      }

      const bookId = doc.bookId;
      if (!bookId || !Array.isArray(doc.stories) || doc.stories.length === 0) {
        continue;
      }

      const enriched: Story[] = doc.stories.map(s => {
        // decorate questions
        s.questions.forEach(decorateStoryQuestion);

        // check for story image
        const imgPath = path.join(STORY_IMAGES_ROOT, bookId, `${s.id}.jpg`);
        const image = existsSync(imgPath) ? `/story-images/${bookId}/${s.id}.jpg` : undefined;

        return {
          id: s.id,
          bookId,
          unitNumber: s.unitNumber,
          unitTitle: s.unitTitle,
          storyIndex: s.storyIndex,
          title: s.title,
          language: s.language,
          sentences: s.sentences.map(text => {
            const audio = audioFor(text);
            if (audio) audioHit++;
            totalSentences++;
            return { text, audio };
          }),
          questions: s.questions,
          image,
        };
      });

      const bookDir = path.join(DATA_DST, "books", bookId);
      await fs.mkdir(bookDir, { recursive: true });
      const out: BookStories = {
        bookId,
        subject: doc.subject,
        textbook: doc.textbook,
        stories: enriched,
      };
      await fs.writeFile(
        path.join(bookDir, "stories.json"),
        JSON.stringify(out, null, 2),
        "utf-8",
      );

      withStories.add(bookId);
      totalBooks++;
      totalStories += enriched.length;
    }
  }

  console.log(
    `📚 故事阅读: ${totalBooks} 本 / ${totalStories} 篇 / ${totalSentences} 句 ` +
      `(${audioHit} 句已生成 TTS, ${totalSentences - audioHit} 句待合成)`,
  );
  return withStories;
}

// ============================================================
// 学科配置（与 Python 侧 subjects.py 对齐）
// ============================================================

interface SubjectMeta {
  id: SubjectId;
  name: string;
  /** 默认出版社（该学科的主流版本）——默认版本沿用原 bookId，保证老进度不丢 */
  publisher: string;
}

const SUBJECTS: SubjectMeta[] = [
  { id: "math", name: "数学", publisher: "renjiao" },
  { id: "chinese", name: "语文", publisher: "tongbian" },
  { id: "english", name: "英语", publisher: "pep" },
  { id: "science", name: "科学", publisher: "jiaoke" },
  { id: "moral", name: "道德与法治", publisher: "tongbian" },
  // ── 初中 / 高中新增学科 ──
  { id: "physics", name: "物理", publisher: "renjiao" },
  { id: "chemistry", name: "化学", publisher: "renjiao" },
  { id: "biology", name: "生物", publisher: "renjiao" },
  { id: "history", name: "历史", publisher: "tongbian" },
  { id: "geography", name: "地理", publisher: "renjiao" },
  { id: "politics", name: "思想政治", publisher: "tongbian" },
  { id: "computer", name: "信息技术", publisher: "general" },
];

// ============================================================
// 文件名解析
// ============================================================

const FILENAME_PATTERNS: { regex: RegExp; grade: number; semester: "up" | "down" }[] = [
  // ── 小学 1-6 ──
  { regex: /一年级上册/, grade: 1, semester: "up" },
  { regex: /二年级上册/, grade: 2, semester: "up" },
  { regex: /三年级上册/, grade: 3, semester: "up" },
  { regex: /四年级上册/, grade: 4, semester: "up" },
  { regex: /五年级上册/, grade: 5, semester: "up" },
  { regex: /六年级上册/, grade: 6, semester: "up" },
  { regex: /一年级下册/, grade: 1, semester: "down" },
  { regex: /二年级下册/, grade: 2, semester: "down" },
  { regex: /三年级下册/, grade: 3, semester: "down" },
  { regex: /四年级下册/, grade: 4, semester: "down" },
  { regex: /五年级下册/, grade: 5, semester: "down" },
  { regex: /六年级下册/, grade: 6, semester: "down" },
  // ── 初中 7-9 ──
  { regex: /七年级上册/, grade: 7, semester: "up" },
  { regex: /七年级下册/, grade: 7, semester: "down" },
  { regex: /八年级上册/, grade: 8, semester: "up" },
  { regex: /八年级下册/, grade: 8, semester: "down" },
  { regex: /九年级上册/, grade: 9, semester: "up" },
  { regex: /九年级下册/, grade: 9, semester: "down" },
  // ── 高中 10-12（按 高一/高二/高三 × 上/下册 组织）──
  { regex: /高一上册/, grade: 10, semester: "up" },
  { regex: /高一下册/, grade: 10, semester: "down" },
  { regex: /高二上册/, grade: 11, semester: "up" },
  { regex: /高二下册/, grade: 11, semester: "down" },
  { regex: /高三上册/, grade: 12, semester: "up" },
  { regex: /高三下册/, grade: 12, semester: "down" },
];

/**
 * 大学课程 → ASCII bookId 片段。
 * 中文出现在 bookId 里会进入 URL 与文件路径（静态导出 / Android 资源路径），
 * 容易触发编码不一致问题，因此统一映射为英文 slug（显示名仍用中文课程名）。
 */
const COLLEGE_SLUGS: Record<string, string> = {
  高等数学: "advanced-math",
  线性代数: "linear-algebra",
  概率论与数理统计: "probability-statistics",
  程序设计基础: "programming-basics",
  "程序设计基础（Python）": "python-programming",
  大学英语: "comprehensive",
  "大学英语（综合）": "comprehensive",
  大学物理: "mechanics-electromagnetism",
  "大学物理（力学与电磁学基础）": "mechanics-electromagnetism",
  计算机基础: "computer-basics",
};

function slugifyCourse(course: string): string {
  const mapped = COLLEGE_SLUGS[course];
  if (mapped) return mapped;
  const ascii = course
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return ascii || "course";
}

/** 大学课程的默认出版社：大学公共课以「高教社」为主，程序设计类以「清华社」为主 */
const COLLEGE_PUBLISHER_BY_SUBJECT: Partial<Record<SubjectId, string>> = {
  computer: "tsinghua",
};
const COLLEGE_DEFAULT_PUBLISHER = "heps";

/** 大学课程：以「大学」开头的文件名，按课程名生成 bookId（无年级，grade=13） */
const COLLEGE_RE = /^大学/;
function parseCollege(
  stem: string,
  subjectId: SubjectId,
): { grade: number; semester: "up" | "down"; bookId: string } | null {
  if (!COLLEGE_RE.test(stem)) return null;
  const semester: "up" | "down" = /（下）|下册|\(下\)/.test(stem) ? "down" : "up";
  const course = collegeCourseName(stem);
  // 课程名已能唯一定位（如 高等数学 / 大学英语（综合）），故 bookId 不再插入出版社短标识
  const bookId = `college-${subjectId}-${slugifyCourse(course)}`;
  return { grade: 13, semester, bookId };
}

/** 去掉「大学·」前缀后的课程名，如「大学·大学英语（综合）」→「大学英语（综合）」 */
function collegeCourseName(stem: string): string {
  return stem
    .replace(/^大学[·\s]*/, "")
    .replace(/[（(][上下][)）]/g, "")
    .replace(/\s+/g, "")
    .trim();
}

const GRADE_NAMES = ["", "一", "二", "三", "四", "五", "六"]; // 兼容保留（现由 gradeFullName 统一处理年级名）

function parseStem(
  stem: string,
  subjectId: SubjectId,
  defaultPublisher: string,
): { grade: number; semester: "up" | "down"; bookId: string; publisher: PublisherConfig } | null {
  // 出版社：文件名中显式标注优先；大学课程默认「高教社」；其余用学科默认版本
  const isCollegeStem = COLLEGE_RE.test(stem);
  const collegePublisher = COLLEGE_PUBLISHER_BY_SUBJECT[subjectId] ?? COLLEGE_DEFAULT_PUBLISHER;
  const publisher =
    findPublisherByStem(stem) ??
    (isCollegeStem ? resolvePublisher(collegePublisher) : resolvePublisher(defaultPublisher));
  const isDefaultPublisher = publisher.id === defaultPublisher;

  // 大学课程优先（按课程名成 book，不受年级模式限制）
  const college = parseCollege(stem, subjectId);
  if (college) return { ...college, publisher };

  for (const p of FILENAME_PATTERNS) {
    if (p.regex.test(stem)) {
      // bookId 命名规则：math 维持原状，其他学科加前缀；非默认出版社再插入出版社短标识
      const baseId = `g${p.grade}${p.semester}`;
      const bookId = isDefaultPublisher
        ? subjectId === "math"
          ? baseId
          : `${subjectId}-${baseId}`
        : `${subjectId}-${publisher.slug}-${baseId}`;
      return { grade: p.grade, semester: p.semester, bookId, publisher };
    }
  }
  return null;
}

// ============================================================
// 单本教材处理
// ============================================================

async function processTextbook(
  subject: SubjectMeta,
  outlineFile: string,
  outlineDir: string,
  quizDir: string,
): Promise<{ book: Book; lessonCount: number; questionCount: number } | null> {
  const stem = outlineFile.replace(/\.json$/, "");
  const parsed = parseStem(stem, subject.id, subject.publisher);
  if (!parsed) {
    console.warn(`  ⚠️  跳过无法识别的教材: ${stem}`);
    return null;
  }

  const { grade, semester, bookId, publisher } = parsed;
  const outline: Outline = JSON.parse(
    await fs.readFile(path.join(outlineDir, outlineFile), "utf-8"),
  );

  const bookDir = path.join(DATA_DST, "books", bookId);
  await fs.mkdir(bookDir, { recursive: true });

  // 处理每个单元 → 拆成多个 lesson
  const allLessons: Lesson[] = [];
  // 单元挑战课（不进 outline.lessons / 路径普通节点，单独写文件）
  const examLessons: Lesson[] = [];

  for (const unit of outline.units) {
    const quizPath = path.join(quizDir, `${stem}_unit${unit.unit_number}.json`);
    let quiz: QuizFile;
    try {
      quiz = JSON.parse(await fs.readFile(quizPath, "utf-8"));
    } catch {
      console.warn(`    ⚠️  缺失题库: ${stem}_unit${unit.unit_number}.json`);
      continue;
    }

    quiz.knowledge_summary.forEach(decorateKnowledge);
    quiz.unit_test.questions.forEach(q => decorateQuestion(normalizeQuestionType(q)));
    quiz.exam?.questions?.forEach(q => decorateQuestion(normalizeQuestionType(q)));

    const ksByPoint = new Map(quiz.knowledge_summary.map(ks => [ks.point, ks]));
    const allUnitQuestions = quiz.unit_test.questions;

    // 按 knowledge_point 分组
    const byKp = new Map<string, Question[]>();
    for (const q of allUnitQuestions) {
      const kp = q.knowledge_point || "其他";
      if (!byKp.has(kp)) byKp.set(kp, []);
      byKp.get(kp)!.push(q);
    }

    // 按大纲中的 KP 顺序生成 lessons
    const kpNames = unit.knowledge_points.map(kp => kp.name);
    for (const kp of byKp.keys()) {
      if (!kpNames.includes(kp)) kpNames.push(kp);
    }

    const unitLessons: Lesson[] = [];
    kpNames.forEach((kpName, idx) => {
      const questions = byKp.get(kpName) ?? [];
      if (questions.length === 0) return;
      unitLessons.push({
        id: `${bookId}-u${unit.unit_number}-kp${idx + 1}`,
        title: kpName,
        bookId,
        unitNumber: unit.unit_number,
        unitTitle: unit.title,
        kpIndex: idx,
        kpTotal: kpNames.length,
        questions,
        knowledge: ksByPoint.get(kpName) ?? null,
      });
    });

    const realTotal = unitLessons.length;
    unitLessons.forEach((l, i) => {
      l.kpIndex = i;
      l.kpTotal = realTotal;
    });

    allLessons.push(...unitLessons);

    // === ⚔️ 单元挑战课（exam 题库复活，Wave E1）===
    // 该单元有普通课可解锁、且 exam 题数 ≥4 时才产出
    const examQuestions = quiz.exam?.questions ?? [];
    if (unitLessons.length > 0 && examQuestions.length >= EXAM_MIN_QUESTIONS) {
      const picked = sampleUniform(examQuestions, EXAM_MAX_QUESTIONS);
      const examLessonId = `${bookId}-u${unit.unit_number}-exam`;
      examLessons.push({
        id: examLessonId,
        title: `第 ${unit.unit_number} 单元挑战`,
        bookId,
        unitNumber: unit.unit_number,
        unitTitle: unit.title,
        kpIndex: realTotal,
        kpTotal: realTotal,
        questions: picked,
        knowledge: null,
      });
      unit.examLessonId = examLessonId;
      unit.examQuestionCount = picked.length;
      examLessonCount++;
      examQuestionTotal += picked.length;
    }
  }

  // 写每个 lesson 一个 JSON 文件（普通课 + 单元挑战课）
  const lessonDir = path.join(bookDir, "lessons");
  await fs.mkdir(lessonDir, { recursive: true });
  for (const lesson of [...allLessons, ...examLessons]) {
    await fs.writeFile(
      path.join(lessonDir, `${lesson.id}.json`),
      JSON.stringify(lesson, null, 2),
      "utf-8",
    );
  }

  // 写大纲
  const outlineWithLessons = {
    ...outline,
    bookId,
    grade,
    semester,
    subject: subject.id,
    lessons: allLessons.map(l => ({
      id: l.id,
      title: l.title,
      unitNumber: l.unitNumber,
      unitTitle: l.unitTitle,
      kpIndex: l.kpIndex,
      kpTotal: l.kpTotal,
      questionCount: l.questions.length,
    })),
  };
  await fs.writeFile(
    path.join(bookDir, "outline.json"),
    JSON.stringify(outlineWithLessons, null, 2),
    "utf-8",
  );

  const semesterName = semester === "up" ? "上册" : "下册";
  const isCollege = grade >= 13;
  const courseName = stem.replace(/^大学[·\s]*/, "");
  const gradeName = isCollege ? "大学" : gradeFullName(grade);
  const stage = stageOfGrade(grade);
  const stageName = STAGE_BY_ID[stage]?.name ?? "";
  // 高中教材名优先取「必修第X册 / 选择性必修第X册 / 必修X / 必修上册」（与真实教材一致）
  const reqMatch = stem.match(
    /(选择性必修第[一二三四1-4]册|选择性必修[一二三四1-4]|选择性必修[上下]册|必修第[一二三四1-4]册|必修[一二三四1-4]|必修[上下]册|中外历史纲要[（(][上下][)）])/,
  );
  const textbookName = isCollege ? courseName : reqMatch ? reqMatch[1] : `${gradeName}${semesterName}`;
  // 大学课程名本身已含「大学」（如大学英语（综合）），避免拼成「高教社大学大学英语（综合）」
  const collegeCourse = isCollege ? courseName.replace(/^大学/, "") : "";
  const book: Book = {
    id: bookId,
    grade,
    semester,
    subject: subject.id,
    gradeName,
    semesterName,
    subjectName: subject.name,
    textbookName,
    fullName: isCollege
      ? `${publisher.label}${stageName}${collegeCourse}`
      : `${publisher.label}${stageName}${subject.name}${textbookName}`,
    publisher: publisher.id,
    publisherName: publisher.label,
    unitsCount: outline.units.length,
    lessonsCount: allLessons.length,
    stage,
  };

  const questionCount = allLessons.reduce((s, l) => s + l.questions.length, 0);
  return { book, lessonCount: allLessons.length, questionCount };
}

// ============================================================
// 主流程
// ============================================================

async function main() {
  console.log("🚀 build-data: 开始处理 output/ → public/data/");
  console.log(`   源: ${OUTPUT_SRC}`);
  console.log(`   目标: ${DATA_DST}`);

  // 清空目标目录（仅删 index.json 与 books/，保留 textbook-catalog.json 等生成物）
  await fs.rm(path.join(DATA_DST, "index.json"), { force: true });
  await fs.rm(path.join(DATA_DST, "books"), { recursive: true, force: true });
  await fs.mkdir(DATA_DST, { recursive: true });
  await fs.mkdir(path.join(DATA_DST, "books"), { recursive: true });

  // 索引已生成的 TTS 音频文件
  const audio = await buildAudioIndex();
  console.log(`🔊 已索引 ${audio.size} 个 TTS 音频文件`);

  // 构建课文听读 + 故事阅读（在教材处理之前跑一次，得到 bookId → 有无课文/故事 的映射）
  const booksWithPassages = await buildPassages();
  const booksWithStories = await buildStories();

  const books: Book[] = [];
  let totalLessons = 0;
  let totalQuestions = 0;

  // 遍历每个学科目录
  for (const subject of SUBJECTS) {
    const subjectDir = path.join(OUTPUT_SRC, subject.id);
    if (!existsSync(subjectDir)) {
      console.log(`  [跳过] 学科 ${subject.id} 没有数据目录`);
      continue;
    }

    const outlineDir = path.join(subjectDir, "outlines");
    const quizDir = path.join(subjectDir, "quizzes");
    if (!existsSync(outlineDir)) {
      console.log(`  [跳过] 学科 ${subject.id} 没有 outlines/`);
      continue;
    }

    const outlineFiles = (await fs.readdir(outlineDir)).filter(f => f.endsWith(".json"));
    if (outlineFiles.length === 0) {
      console.log(`  [跳过] 学科 ${subject.id} outlines 为空`);
      continue;
    }

    console.log(`\n📘 处理学科: ${subject.name} (${subject.id}) — ${outlineFiles.length} 本教材`);

    for (const outlineFile of outlineFiles) {
      const result = await processTextbook(subject, outlineFile, outlineDir, quizDir);
      if (!result) continue;
      if (booksWithPassages.has(result.book.id)) {
        result.book.hasPassages = true;
      }
      if (booksWithStories.has(result.book.id)) {
        result.book.hasStories = true;
      }
      books.push(result.book);
      totalLessons += result.lessonCount;
      totalQuestions += result.questionCount;
      console.log(
        `  ✓ ${result.book.textbookName.padEnd(8)} ${result.book.unitsCount} 单元 → ${result.lessonCount.toString().padStart(2)} 节课`,
      );
    }
  }

  // 排序：先按学科 (math 最前)，再按学期 (上 → 下)，再按年级
  const subjectOrder: Record<string, number> = {
    math: 0,
    chinese: 1,
    english: 2,
    science: 3,
  };
  books.sort((a, b) => {
    const sa = subjectOrder[a.subject ?? "math"] ?? 99;
    const sb = subjectOrder[b.subject ?? "math"] ?? 99;
    if (sa !== sb) return sa - sb;
    if (a.semester !== b.semester) return a.semester === "up" ? -1 : 1;
    return a.grade - b.grade;
  });

  const index: SiteIndex = {
    books,
    generatedAt: new Date().toISOString(),
    totalLessons,
    totalQuestions,
  };
  await fs.writeFile(path.join(DATA_DST, "index.json"), JSON.stringify(index, null, 2), "utf-8");

  console.log("\n📊 汇总:");
  console.log(`   教材: ${books.length} 本`);
  console.log(`   课程: ${totalLessons} 节`);
  console.log(`   题目: ${totalQuestions} 道`);
  console.log(
    `   题型改派: ${retypedQuestionCount} 道（fill_blank/calculation 答案含非数字字符 → fill_blank_text）`,
  );
  console.log(
    `   ⚔️ 单元挑战: ${examLessonCount} 节（共 ${examQuestionTotal} 道 exam 题，单元 exam ≥${EXAM_MIN_QUESTIONS} 题成课，上限 ${EXAM_MAX_QUESTIONS} 道均匀抽样）`,
  );
  // 按学科分组打印
  const bySubject = new Map<SubjectId, number>();
  for (const b of books) {
    const sid = (b.subject ?? "math") as SubjectId;
    bySubject.set(sid, (bySubject.get(sid) ?? 0) + 1);
  }
  for (const [sid, n] of bySubject) {
    console.log(`     - ${sid}: ${n} 本`);
  }
  console.log("✅ build-data 完成");
}

main().catch(err => {
  console.error("❌ build-data 失败:", err);
  process.exit(1);
});
