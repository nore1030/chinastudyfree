/**
 * coverage-report.mjs —— 教材覆盖矩阵报告
 *
 * 读取 apps/web/public/data/index.json，按「学段 × 年级 × 学科」列出已有教材与缺口，
 * 并打印全部教材明细（含出版社），用于核对一纲多本与年级学科覆盖是否完整。
 *
 * 运行：npm run coverage（需先 npm run build:data）
 */

import fs from "node:fs";

const d = JSON.parse(fs.readFileSync("apps/web/public/data/index.json", "utf8"));
const books = d.books;

// 覆盖率矩阵：stage -> grade -> subject -> [bookId...]
const SUBJECTS = ["chinese", "math", "english", "science", "moral", "physics", "chemistry", "biology", "history", "geography", "politics", "computer"];
const SUBJECT_CN = {
  chinese: "语文", math: "数学", english: "英语", science: "科学", moral: "道法",
  physics: "物理", chemistry: "化学", biology: "生物", history: "历史",
  geography: "地理", politics: "政治", computer: "信息",
};

const matrix = {};
for (const b of books) {
  const g = b.grade ?? 13;
  const st = b.stage ?? "?";
  matrix[st] ??= {};
  matrix[st][g] ??= {};
  matrix[st][g][b.subject] ??= [];
  matrix[st][g][b.subject].push(b.id);
}

const STAGE_CN = { primary: "小学", middle: "初中", high: "高中", college: "大学" };
const STAGE_ORDER = ["primary", "middle", "high", "college"];

for (const st of STAGE_ORDER) {
  console.log(`\n===== ${STAGE_CN[st] ?? st} (${st}) =====`);
  const grades = Object.keys(matrix[st] ?? {}).map(Number).sort((a, b) => a - b);
  for (const g of grades) {
    const row = matrix[st][g];
    const have = SUBJECTS.filter(s => row[s]);
    const missing = SUBJECTS.filter(s => !row[s]);
    console.log(`grade ${g}: 有 [${have.map(s => SUBJECT_CN[s]).join(",")}]`);
    console.log(`           缺 [${missing.map(s => SUBJECT_CN[s]).join(",")}]`);
  }
}

console.log("\n\n===== 所有书籍明细（按学段/年级/学科/出版社） =====");
const sorted = [...books].sort((a, b) => {
  const so = STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage);
  if (so) return so;
  if ((a.grade ?? 0) !== (b.grade ?? 0)) return (a.grade ?? 0) - (b.grade ?? 0);
  if (a.subject !== b.subject) return SUBJECTS.indexOf(a.subject) - SUBJECTS.indexOf(b.subject);
  return (a.publisherName ?? "").localeCompare(b.publisherName ?? "", "zh");
});
for (const b of sorted) {
  console.log(`${STAGE_CN[b.stage] ?? b.stage} g${b.grade ?? "-"} ${SUBJECT_CN[b.subject] ?? b.subject} [${b.publisherName ?? "-"}] ${b.id}  (units=${b.unitsCount} lessons=${b.lessonsCount})`);
}
