/**
 * 校验 output/{subject}/quizzes 里的题目质量：
 *  1. choice 题的 answer 必须严格等于某个 option（防答案与选项不一致）；
 *  2. choice 题 options 不得重复；
 *  3. true_false 题 answer 必须是「对」或「错」；
 *  4. 所有题必须有 question / explanation。
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUTPUT = path.join(ROOT, "output");

let checked = 0;
const problems = [];

for (const subject of fs.readdirSync(OUTPUT)) {
  const quizDir = path.join(OUTPUT, subject, "quizzes");
  if (!fs.existsSync(quizDir)) continue;
  for (const f of fs.readdirSync(quizDir).filter(f => f.endsWith(".json"))) {
    const quiz = JSON.parse(fs.readFileSync(path.join(quizDir, f), "utf-8"));
    const questions = [...(quiz.unit_test?.questions ?? []), ...(quiz.exam?.questions ?? [])];
    for (const q of questions) {
      checked++;
      const where = `${subject}/${f} #${q.id}`;
      if (!q.question || !q.explanation) problems.push(`${where}: 缺题干或解析`);
      if (q.type === "choice") {
        if (!Array.isArray(q.options) || q.options.length < 2) {
          problems.push(`${where}: choice 选项少于 2 个`);
          continue;
        }
        if (!q.options.includes(q.answer)) {
          problems.push(`${where}: 答案「${q.answer}」不在选项中 ${JSON.stringify(q.options)}`);
        }
        if (new Set(q.options).size !== q.options.length) {
          problems.push(`${where}: 选项有重复 ${JSON.stringify(q.options)}`);
        }
      }
      if (q.type === "true_false" && q.answer !== "对" && q.answer !== "错") {
        problems.push(`${where}: true_false 答案必须是 对/错，实际「${q.answer}」`);
      }
      if ((q.type === "fill_blank" || q.type === "calculation") && (q.answer === "" || q.answer == null)) {
        problems.push(`${where}: 填空/计算题为空答案`);
      }
    }
  }
}

console.log(`共检查 ${checked} 道题`);
if (problems.length) {
  console.log(`❌ 发现 ${problems.length} 个问题：`);
  for (const p of problems.slice(0, 40)) console.log("  -", p);
  if (problems.length > 40) console.log(`  …还有 ${problems.length - 40} 个`);
  process.exit(1);
} else {
  console.log("✅ 全部通过：答案都在选项中、无重复选项、判断题答案合法");
}
