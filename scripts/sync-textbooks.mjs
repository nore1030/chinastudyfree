/**
 * sync-textbooks.mjs
 *
 * 拉取 TapXWorld/ChinaTextbook 的开源教材目录树，生成
 * apps/web/public/data/textbook-catalog.json，供「教材中心」(/textbooks) 浏览。
 *
 * 该仓库只提供 PDF 课本（无结构化习题 / 音频），所以这里生成的是「真实教材目录」：
 *   学段(小学/初中/高中/大学) → 学科 → 年级/册 → 教材名 + GitHub 查看链接。
 *
 * 用法：node scripts/sync-textbooks.mjs   （或 npm run sync:textbooks）
 */

import { existsSync, mkdirSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const DATA_DST = path.resolve(REPO_ROOT, "apps/web/public/data/textbook-catalog.json");

const REPO = "TapXWorld/ChinaTextbook";
const RAW_BASE = `https://github.com/${REPO}/blob/master/`;
const API_BASE = `https://api.github.com/repos/${REPO}`;

// 顶层文件夹 → 学段
const STAGE_FOLDERS = {
  小学: "primary",
  "小学（五•四学制）": "primary",
  初中: "middle",
  "初中（五•四学制）": "middle",
  高中: "high",
  大学: "college",
};

const SKIP_PREFIXES = [".cache", "学数学最重要的刷习题在这里", "README.md", "LICENSE"];

/** fetch JSON，带简单重试 */
async function apiGet(url, attempt = 0) {
  const res = await fetch(url, { headers: { "User-Agent": "node-sync-textbooks", Accept: "application/vnd.github+json" } });
  if (res.status === 403 && attempt < 3) {
    // 触发限流：等一秒再试
    await new Promise(r => setTimeout(r, 1000));
    return apiGet(url, attempt + 1);
  }
  if (!res.ok) throw new Error(`GitHub API ${res.status} @ ${url}`);
  return res.json();
}

function blobUrl(p) {
  return RAW_BASE + encodeURI(p);
}

/**
 * 从文件名 / 路径推断「年级 / 册」标签，便于教材中心分组。
 * 优先取文件名里的年级令牌（二年级上册 / 高一 / 必修一 / 第一册 / 上册），
 * 取不到再退回文件夹名。
 */
function extractGrade(name, folderName) {
  const hay = `${name} ${folderName}`;
  const patterns = [
    /[一二三四五六七八九]年级[上下]?册?/, // 二年级上册
    /\d+年级[上下]?册?/, // 12年级上册（罕见）
    /高[一二三]/, // 高一
    /必修[一二三四五]/, // 必修一
    /选修[一二三四五]/, // 选修一
    /第[一二三四五六七八九十]+册/, // 第一册
    /[上下]册/, // 上册 / 下册
  ];
  for (const re of patterns) {
    const m = hay.match(re);
    if (m) return m[0];
  }
  return folderName.replace(/\.pdf$/i, "").trim() || "未分类";
}

/** 从树节点生成一条目录条目 */
function entryFromPath(p) {
  const parts = p.split("/");
  const top = parts[0];
  const stage = STAGE_FOLDERS[top];
  if (!stage) return null;
  if (SKIP_PREFIXES.some(pre => p === pre || p.startsWith(pre + "/"))) return null;
  if (!p.toLowerCase().endsWith(".pdf")) return null;

  const subject = parts[1];
  if (!subject) return null;
  const rest = parts.slice(2);
  const name = parts[parts.length - 1];
  const folderName = rest.length > 1 ? rest[0] : "";

  const grade = extractGrade(name, folderName) || "未分类";

  return {
    stage,
    subject,
    grade,
    name,
    url: blobUrl(p),
    path: p,
  };
}

async function main() {
  console.log("🔄 拉取 ChinaTextbook 目录树 …");
  let tree = [];
  let truncated = false;

  try {
    const root = await apiGet(`${API_BASE}/git/trees/master?recursive=1`);
    tree = root.tree || [];
    truncated = !!root.truncated;
    if (truncated) {
      console.log("⚠️  根树被截断，改按顶层文件夹分别拉取 …");
    }
  } catch (e) {
    console.warn("⚠️  根树拉取失败:", e.message);
  }

  if (truncated || tree.length === 0) {
    // 按已知顶层文件夹分别拉取
    tree = [];
    for (const folder of Object.keys(STAGE_FOLDERS)) {
      try {
        const sub = await apiGet(
          `${API_BASE}/git/trees/master/${encodeURIComponent(folder)}?recursive=1`,
        );
        tree.push(...(sub.tree || []));
      } catch (e) {
        console.warn(`⚠️  跳过 ${folder}:`, e.message);
      }
    }
  }

  const entries = [];
  const seen = new Set();
  for (const node of tree) {
    if (node.type !== "blob") continue;
    const entry = entryFromPath(node.path);
    if (!entry) continue;
    const key = entry.path;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push(entry);
  }

  // 排序：学段 → 学科 → 年级 → 名
  const stageOrder = { primary: 0, middle: 1, high: 2, college: 3 };
  entries.sort((a, b) =>
    stageOrder[a.stage] - stageOrder[b.stage] ||
    a.subject.localeCompare(b.subject, "zh") ||
    a.grade.localeCompare(b.grade, "zh") ||
    a.name.localeCompare(b.name, "zh"),
  );

  const catalog = {
    generatedAt: new Date().toISOString(),
    source: `https://github.com/${REPO}`,
    note: "本目录由 ChinaTextbook 开源教材库自动生成，仅含 PDF 课本链接；互动课程需配置 AI Key 后由流水线生成。",
    count: entries.length,
    entries,
  };

  if (!existsSync(path.dirname(DATA_DST))) {
    mkdirSync(path.dirname(DATA_DST), { recursive: true });
  }
  writeFileSync(DATA_DST, JSON.stringify(catalog, null, 2), "utf-8");

  // 统计
  const byStage = {};
  for (const e of entries) byStage[e.stage] = (byStage[e.stage] || 0) + 1;
  console.log("✅ 已生成教材目录:", DATA_DST);
  console.log("   教材总数:", entries.length);
  for (const [s, n] of Object.entries(byStage)) console.log(`     - ${s}: ${n} 本`);
}

main().catch(err => {
  console.error("❌ 生成教材目录失败:", err);
  process.exit(1);
});
