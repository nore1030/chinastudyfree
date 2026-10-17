/**
 * 一次性数据修复：修掉上游题库里 13 处「选项重复 / 答案不在选项中 / 答案与选项不一致」的缺陷。
 * 同时作用于 output/（工作副本）与 upstream/output/（原始副本），
 * 这样将来按「仅补缺失」从 upstream 恢复时不会把 bug 带回来。
 * 每条修复都带 before 断言：对不上就报错退出，绝不静默改错文件。
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ROOTS = [path.join(ROOT, "output"), path.join(ROOT, "upstream", "output")];

/** section: "unit" | "exam"；id：题目在该 section 内的 id */
const FIXES = [
  {
    file: "chinese/义务教育教科书·语文三年级上册_unit2.json",
    section: "unit", id: 6,
    set: { options: ["寒山石径", "白云人家", "爱枫林晚", "霜叶红于二月花"] },
    before: { options: ["寒山石径", "白云人家", "爱枫林晚", "爱枫林晚"] },
  },
  {
    file: "chinese/义务教育教科书·语文三年级上册_unit3.json",
    section: "exam", id: 6,
    set: {
      question: "‘不要紧（　）’小公鸡说道（　）‘第一次学啼叫，都是这样的。’",
      options: ["！，", "，。", "。，", "！。"],
      answer: "！，",
      explanation: "第一个空是感叹语气，用「！」；「说道」后面停顿，用「，」。",
    },
    before: { answer: "，”" },
  },
  {
    file: "chinese/义务教育教科书·语文二年级下册_unit6.json",
    section: "unit", id: 7,
    set: { options: ["hāng", "huāng", "hàng", "huáng"] },
    before: { options: ["hāng", "huāng", "huāng", "huáng"] },
  },
  {
    file: "chinese/义务教育教科书·语文五年级上册_unit8.json",
    section: "unit", id: 11,
    set: {
      options: ["虽然……但是……", "与其……不如……", "不但……而且……", "既然……就……"],
      answer: "与其……不如……",
      explanation: "「与其……不如……」表示在两种情况中择优，符合「要精不要多」的取舍。",
    },
    before: { options: ["虽然……但是……", "与其……不如……", "与其……不如……", "与其博而不精，不如少而求精。"] },
  },
  {
    file: "english/义务教育教科书·英语（三年级起点）五年级下册_unit4.json",
    section: "exam", id: 11,
    set: { options: ["nineth", "ninth", "nineteen", "ninty"] },
    before: { options: ["nineth", "ninth", "nineth", "ninter"] },
  },
  {
    file: "english/义务教育教科书·英语（三年级起点）六年级下册_unit1.json",
    section: "unit", id: 11,
    set: { options: ["That dinosaur is tall than me.", "That dinosaur is taller than me.", "That dinosaur is taller than I am.", "That dinosaur is more tall than me."] },
    before: { options: ["That dinosaur is tall than me.", "That dinosaur is taller than me.", "That dinosaur is taller than I am.", "That dinosaur is taller than me."] },
  },
  {
    file: "math/义务教育教科书 · 数学一年级上册_unit6.json",
    section: "unit", id: 11,
    set: { answer: "1 个十和 8 个一" },
    before: { answer: "1 个十 and 8 个一" },
  },
  {
    file: "math/义务教育教科书 · 数学一年级上册_unit6.json",
    section: "unit", id: 16,
    set: { options: ["13", "11", "18", "20"] },
    before: { options: ["13", "11", "18", "18"] },
  },
  {
    file: "math/义务教育教科书 · 数学三年级上册_unit5.json",
    section: "exam", id: 11,
    set: { answer: "3 倍" },
    before: { answer: "3_倍" },
  },
  {
    file: "math/义务教育教科书 · 数学三年级上册_unit7.json",
    section: "unit", id: 16,
    set: { options: ["米", "厘米", "分米", "千米"] },
    before: { options: ["米", "厘米", "米", "千米"] },
  },
  {
    file: "math/义务教育教科书 · 数学五年级上册_unit1.json",
    section: "unit", id: 9,
    set: { options: ["1.25×8×1.1", "1.25×8+0.8", "1.25×8+1.1", "1.25×10-1.25×1.2"] },
    before: { options: ["1.25×8×1.1", "1.25×8+0.8", "1.25×8×1.1", "1.25×10-1.25×1.2"] },
  },
  {
    file: "math/义务教育教科书 · 数学六年级上册_unit5.json",
    section: "exam", id: 9,
    set: { options: ["62.8", "31.4", "12.56", "50.24"] },
    before: { options: ["62.8", "31.4", "12.56", "62.8"] },
  },
  {
    file: "math/义务教育教科书·数学五年级下册_unit6.json",
    section: "exam", id: 12,
    set: { answer: "(\\frac{7}{10} + \\frac{3}{10}) - \\frac{1}{3}" },
    before: { answer: "(\\7/10 + 3/10) - 1/3" },
  },
  {
    file: "math/义务教育教科书·数学四年级下册_unit1.json",
    section: "unit", id: 10,
    set: { answer: "4 条大船和 2 条小船" },
    before: { answer: "4 条大船 and 2 条小船" },
  },
];

let applied = 0;
let missing = 0;

for (const fix of FIXES) {
  const [subject, name] = fix.file.split("/");
  for (const root of ROOTS) {
    const p = path.join(root, subject, "quizzes", name);
    if (!fs.existsSync(p)) {
      if (root === ROOTS[0]) {
        console.log(`⚠️  文件不存在: ${p}`);
        missing++;
      }
      continue;
    }
    const quiz = JSON.parse(fs.readFileSync(p, "utf-8"));
    const arr = fix.section === "unit" ? quiz.unit_test?.questions : quiz.exam?.questions;
    if (!Array.isArray(arr)) {
      console.log(`⚠️  ${fix.file} 没有 ${fix.section} 段`);
      missing++;
      continue;
    }
    const q = arr.find(x => x.id === fix.id);
    if (!q) {
      console.log(`⚠️  ${fix.file} ${fix.section} #${fix.id} 找不到`);
      missing++;
      continue;
    }
    // before 断言：任一字段对不上就整条跳过，绝不再 Object.assign
    let assertOk = true;
    for (const [k, v] of Object.entries(fix.before)) {
      const cur = q[k];
      const same = Array.isArray(v)
        ? Array.isArray(cur) && v.length === cur.length && v.every((x, i) => x === cur[i])
        : cur === v;
      if (!same) {
        console.log(`⚠️  ${fix.file} ${fix.section} #${fix.id} 字段 ${k} 与预期不符:\n     实际 ${JSON.stringify(cur)}\n     预期 ${JSON.stringify(v)}`);
        assertOk = false;
        break;
      }
    }
    if (!assertOk) {
      // 幂等友好：如果当前已等于目标状态，视为已修复
      const already = Object.entries(fix.set).every(([k, v]) => {
        const cur = q[k];
        return Array.isArray(v)
          ? Array.isArray(cur) && v.length === cur.length && v.every((x, i) => x === cur[i])
          : cur === v;
      });
      if (already) {
        console.log(`✅ ${fix.file} ${fix.section} #${fix.id} 已是目标状态 (${root === ROOTS[0] ? "output" : "upstream/output"})`);
        applied++;
      } else {
        missing++;
      }
      continue;
    }
    Object.assign(q, fix.set);
    fs.writeFileSync(p, JSON.stringify(quiz, null, 2), "utf-8");
    applied++;
    console.log(`✅ ${fix.file} ${fix.section} #${fix.id} 已修 (${root === ROOTS[0] ? "output" : "upstream/output"})`);
  }
}

console.log(`\n共应用 ${applied} 处修复（预期 ${FIXES.length * 2}），异常 ${missing} 处`);
if (missing > 0) process.exit(1);
