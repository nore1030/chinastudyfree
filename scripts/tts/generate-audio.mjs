#!/usr/bin/env node
/**
 * generate-audio.mjs — 生成互动课程所需的预生成 TTS 音频。
 *
 * 为什么需要它：
 *   前端默认播放「预生成音频」（体积小、离线、音色好、零延迟），路径由
 *   apps/web/scripts/build-data.ts 按内容寻址注入：
 *       normalize(text) = trim + 折叠空白
 *       hash            = sha1(normalize(text))
 *       path            = /audio/<hash[0:2]>/<hash><ext>
 *   本脚本负责把缺的文件补齐。**哈希必须与 build-data 完全一致**，
 *   已用 src/lib/uiAudio.ts 里的硬编码哈希表交叉校验过（5/5 匹配）。
 *
 *   ⚠️ public/audio 默认被 .gitignore 忽略，是「本地生成物」。
 *   整目录缺失时：前端 lib/tts.ts 的第 1 级（预生成音频）失效，
 *   会自动落到第 2 级「在线合成 /api/ai/tts」（需后端配置 DASHSCOPE_API_KEY）。
 *   若两级都没有（既没预生成、又没配 Key），则**静默**——因为按产品要求已
 *   彻底移除浏览器 speechSynthesis 系统语音回退。本脚本把音质/延迟补到最好那一档。
 *
 * 用法：
 *   node scripts/tts/generate-audio.mjs --dry-run        # 只统计，不合成
 *   node scripts/tts/generate-audio.mjs --limit 50       # 先试 50 条
 *   DASHSCOPE_API_KEY=sk-xxx node scripts/tts/generate-audio.mjs
 *
 * 环境变量：
 *   DASHSCOPE_API_KEY  必填，缺了只跑 --dry-run
 *   TTS_MODEL          默认 cosyvoice-v1
 *   TTS_VOICE          默认 longxiaochun（童年音色，适合小学生）
 *   TTS_FORMAT         默认 opus（体积最小）；DashScope 不支持时改 mp3
 *   TTS_CONCURRENCY    默认 3（并发数，太高容易 429）
 *
 * 成本提醒：全量约 5～6 万条（题库题干/选项/讲解 + 知识点 + UI 短句）。
 * 建议先 --limit 试听，再按教材/学段分批生成（见 --book / --subject 过滤）。
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..");
const WEB_ROOT = path.resolve(REPO_ROOT, "apps", "web");
const DATA_DIR = path.resolve(WEB_ROOT, "public", "data");
const AUDIO_ROOT = path.resolve(WEB_ROOT, "public", "audio");

// ------------------------------------------------------------
// 参数解析
// ------------------------------------------------------------
const argv = process.argv.slice(2);
const flag = (name, dflt = false) => {
  const i = argv.indexOf(`--${name}`);
  if (i >= 0) {
    const next = argv[i + 1];
    return next && !next.startsWith("--") ? next : true;
  }
  return dflt;
};
const DRY_RUN = !!flag("dry-run", false);
const LIMIT = Number(flag("limit", 0)) || 0;
const BOOK_FILTER = typeof flag("book", false) === "string" ? flag("book") : null;
const CONCURRENCY = Math.max(1, Number(process.env.TTS_CONCURRENCY || 3));

const FORMAT = process.env.TTS_FORMAT || "opus";
const MODEL = process.env.TTS_MODEL || "cosyvoice-v1";
const VOICE = process.env.TTS_VOICE || "longxiaochun";
const API_KEY = process.env.DASHSCOPE_API_KEY || "";

// ------------------------------------------------------------
// 哈希规则（必须与 build-data.ts 保持一致）
// ------------------------------------------------------------
function normalizeText(text) {
  return String(text).trim().replace(/\s+/g, " ");
}
function audioKey(text) {
  const h = createHash("sha1").update(normalizeText(text), "utf8").digest("hex");
  return `${h.slice(0, 2)}/${h}`;
}

// ------------------------------------------------------------
// 收集需要朗读的文本
// ------------------------------------------------------------
function walkJson(dir, out) {
  if (!existsSync(dir)) return;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkJson(p, out);
    else if (e.name.endsWith(".json")) out.push(p);
  }
}

/** 去掉选项的 "A. " / "A、" 前缀，与 build-data 的 stripOptionPrefix 一致。 */
function stripOptionPrefix(opt) {
  return String(opt).replace(/^[A-Da-d][.、]\s*/, "");
}

/** UI 激励短句（与 src/lib/uiAudio.ts 的 UI_AUDIO_MAP 键一致）。 */
const UI_PHRASES = [
  "太棒了！", "完美！", "做得好！", "天才！", "继续保持！", "漂亮！",
  "再想想", "差一点", "加油", "没关系", "下次就对！",
  "太棒!", "完美!", "漂亮!", "好厉害!", "继续!", "别灰心!", "再来一次!",
  "没关系!", "加油!", "连击!", "火力全开!", "势不可挡!",
  "连击 三连!", "连击 五连!", "连击 十连!",
  "一起学！", "超级重要!", "别踩坑哦!", "你最棒!", "完成!", "零失误",
  "继续", "检查", "继续学习", "听全文", "跟读", "开始练习",
];

function collectTexts() {
  /** @type {Map<string, {text: string, speak: string, where: string}>} */
  const found = new Map();

  const add = (raw, where) => {
    if (!raw) return;
    const text = String(raw);
    const norm = normalizeText(text);
    if (!norm) return;
    const key = audioKey(norm);
    if (found.has(key)) return;
    found.set(key, { text: norm, speak: cleanForSpeech(text), where });
  };

  // 1) UI 短句
  for (const p of UI_PHRASES) add(p, "ui");

  // 2) 题库：题干 / 选项 / 讲解 / 知识点
  const lessonFiles = [];
  walkJson(path.join(DATA_DIR, "books"), lessonFiles);
  for (const f of lessonFiles) {
    let j;
    try {
      j = JSON.parse(readFileSync(f, "utf8"));
    } catch {
      continue;
    }
    const rel = path.relative(DATA_DIR, f);
    if (BOOK_FILTER && !rel.includes(BOOK_FILTER)) continue;

    const k = j.knowledge;
    if (k) {
      add(k.point, rel);
      add(k.core_concept, rel);
      add(k.key_formula, rel);
      add(k.tips, rel);
      for (const m of k.common_mistakes || []) add(m, rel);
    }
    for (const q of j.questions || []) {
      add(q.question, rel);
      for (const o of q.options || []) add(stripOptionPrefix(o), rel);
      add(q.explanation, rel);
    }
  }

  // 3) 课文 / 故事（若数据存在）
  for (const dir of ["passages", "stories"]) {
    const files = [];
    walkJson(path.join(DATA_DIR, dir), files);
    for (const f of files) {
      let j;
      try {
        j = JSON.parse(readFileSync(f, "utf8"));
      } catch {
        continue;
      }
      const rel = path.relative(DATA_DIR, f);
      for (const s of j.sentences || []) add(s.text, rel);
      for (const q of j.questions || []) {
        add(q.question, rel);
        for (const o of q.options || []) add(stripOptionPrefix(o), rel);
        add(q.explanation, rel);
      }
    }
  }

  return found;
}

/**
 * 把文本清理成适合朗读的内容（**只影响合成内容，不影响哈希**）。
 * 题干里常有 LaTeX（$\\frac12\\times\\frac12$），原样喂给 TTS 会念出一串符号，
 * 这里做一次尽力而为的转换；认不出来的符号直接丢掉。
 */
function cleanForSpeech(text) {
  let s = String(text);
  // \frac{a}{b} → a 除以 b
  s = s.replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, "$1 除以 $2");
  // \frac12（无花括号的简写，题干里很常见）→ 1 除以 2
  s = s.replace(/\\frac(\d)(\d)/g, "$1 除以 $2");
  // \sqrt{x} → 根号 x
  s = s.replace(/\\sqrt\{([^{}]*)\}/g, "根号 $1");
  // 90^\circ / 90^\\circ → 90 度（要先于通用 ^ 规则处理，否则会留下孤号）
  s = s.replace(/\^\s*\\circ/g, " 度");
  s = s.replace(/\\circ/g, " 度");
  // 常见运算符 / 关系符
  const map = [
    [/\\times/g, "乘以"], [/\\div/g, "除以"], [/\\pm/g, "正负"],
    [/\\approx/g, "约等于"], [/\\neq/g, "不等于"], [/\\leq/g, "小于等于"],
    [/\\geq/g, "大于等于"], [/\\cdot/g, "乘以"], [/\\infty/g, "无穷大"],
    [/\\pi/g, "派"], [/\\alpha/g, "阿尔法"], [/\\beta/g, "贝塔"],
    [/\\theta/g, "西塔"], [/\\angle/g, "角"],
    [/\\triangle/g, "三角形"], [/\\parallel/g, "平行"], [/\\perp/g, "垂直"],
  ];
  for (const [re, to] of map) s = s.replace(re, to);
  // 上标 ^2 / ^3 → 平方 / 立方
  s = s.replace(/\^2/g, "的平方").replace(/\^3/g, "的立方");
  s = s.replace(/\^\{?(\w+)\}?/g, "的 $1 次方");
  // 下标 _{xy} → 直接接写
  s = s.replace(/_\{?(\w+)\}?/g, "$1");
  // 去掉所有剩余 LaTeX 痕迹与公式定界符（含孤立的 ^ 与 _）
  s = s.replace(/[\^_${}\\]/g, "");
  // 归一化空白
  s = s.replace(/\s+/g, " ").trim();
  // 纯符号 / 空 → 跳过（返回空串，调用方会过滤）
  if (!s || !/[\u4e00-\u9fa5a-zA-Z0-9]/.test(s)) return "";
  return s;
}

// ------------------------------------------------------------
// 合成
// ------------------------------------------------------------
async function synthesize(text) {
  const res = await fetch(
    "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        input: { model: MODEL, text, voice: VOICE },
        parameters: {
          voice: VOICE,
          text_type: "plain",
          output_audio: { format: FORMAT, sample_rate: 24000 },
        },
      }),
    },
  );
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${t.slice(0, 300)}`);
  }
  const data = await res.json();
  const audioField = data?.output?.choices?.[0]?.message?.output?.audio;
  if (!audioField) throw new Error("返回缺少音频字段");
  const parsed = typeof audioField === "string" ? JSON.parse(audioField) : audioField;
  const b64 = parsed?.audio;
  if (!b64) throw new Error("未返回音频数据");
  return Buffer.from(b64, "base64");
}

/** 简单并发池 */
async function pool(items, worker, n) {
  const idx = { i: 0 };
  const runners = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (idx.i < items.length) {
      const my = idx.i++;
      await worker(items[my], my);
    }
  });
  await Promise.all(runners);
}

// ------------------------------------------------------------
// 主流程
// ------------------------------------------------------------
async function main() {
  const all = collectTexts();
  const keys = [...all.keys()];

  // 过滤：没有可朗读内容 / 文件已存在
  const missing = [];
  let noSpeech = 0;
  let exists = 0;
  for (const k of keys) {
    const item = all.get(k);
    const file = path.join(AUDIO_ROOT, `${k}.${FORMAT}`);
    if (existsSync(file) && statSync(file).size > 0) {
      exists++;
      continue;
    }
    if (!item.speak) {
      noSpeech++;
      continue;
    }
    missing.push({ key: k, ...item });
  }

  console.log("=== TTS 音频生成 ===");
  console.log(`数据源: ${DATA_DIR}`);
  console.log(`输出目录: ${AUDIO_ROOT}`);
  console.log(`需朗读文本总数: ${keys.length}`);
  console.log(`  已存在(跳过): ${exists}`);
  console.log(`  无可朗读内容(公式等，跳过): ${noSpeech}`);
  console.log(`  待生成: ${missing.length}`);
  console.log(`合成参数: model=${MODEL} voice=${VOICE} format=${FORMAT} 并发=${CONCURRENCY}`);

  if (DRY_RUN || !API_KEY) {
    if (!API_KEY && !DRY_RUN) {
      console.log("\n⚠️ 未设置 DASHSCOPE_API_KEY，仅做统计（等同 --dry-run）。");
      console.log("   注意：没有音频也能用——前端会降级到浏览器 speechSynthesis。");
    }
    if (missing.length) {
      console.log("\n待生成样例（前 10 条）：");
      for (const m of missing.slice(0, 10)) {
        console.log(`  ${m.key}  [${m.where}]`);
        console.log(`    原文: ${m.text.slice(0, 60)}`);
        console.log(`    朗读: ${m.speak.slice(0, 60)}`);
      }
    }
    // 按来源分布，便于分批生成
    const byWhere = new Map();
    for (const m of missing) {
      const top = m.where === "ui" ? "ui" : m.where.split(path.sep)[0] + "/" + (m.where.split(path.sep)[1] || "");
      byWhere.set(top, (byWhere.get(top) || 0) + 1);
    }
    console.log("\n待生成来源分布（前 15）：");
    for (const [w, c] of [...byWhere.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
      console.log(`  ${c.toString().padStart(5)}  ${w}`);
    }
    return;
  }

  const queue = LIMIT > 0 ? missing.slice(0, LIMIT) : missing;
  if (queue.length === 0) {
    console.log("\n✅ 没有需要生成的音频。");
    return;
  }

  console.log(`\n开始合成 ${queue.length} 条（预估 DashScope 调用 ${queue.length} 次）…`);
  let ok = 0;
  let fail = 0;
  const failures = [];
  const t0 = Date.now();

  await pool(queue, async item => {
    try {
      const buf = await synthesize(item.speak);
      const file = path.join(AUDIO_ROOT, `${item.key}.${FORMAT}`);
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, buf);
      ok++;
      if (ok % 20 === 0) {
        const el = ((Date.now() - t0) / 1000).toFixed(0);
        console.log(`  … ${ok}/${queue.length} 成功, ${fail} 失败 (${el}s)`);
      }
    } catch (e) {
      fail++;
      if (failures.length < 10) failures.push(`${item.key}: ${e.message}`);
    }
  }, CONCURRENCY);

  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  console.log(`\n=== 完成：成功 ${ok} / 失败 ${fail}（耗时 ${secs}s）===`);
  if (failures.length) {
    console.log("失败样例：");
    for (const f of failures) console.log(`  ${f}`);
  }
  console.log(`\n下一步：重新生成数据以注入音频路径`);
  console.log(`  cd apps/web && npm run build:data`);
  console.log(`  （build-data 会扫描 public/audio 下的 .${FORMAT} 并注入 /audio/... 路径）`);
}

main().catch(e => {
  console.error("生成失败:", e);
  process.exit(1);
});
