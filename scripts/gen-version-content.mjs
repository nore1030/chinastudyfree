/**
 * gen-version-content.mjs —— 生成「多出版社教材（一纲多本）」的互动课程内容
 *
 * 同一学科在同一学段常有多个教材版本（人教版 / 沪教版 / 外研版 / 译林版 /
 * 北师大版 / 苏教版 / 浙教版…），不同版本的单元主题、知识点与难度顺序
 * **并不相同**。本脚本按各版本真实教材目录生成内容，产出写入
 * output/{subject}/outlines|quizzes/，随后 npm run build:data 会把它构建为
 * 前端教材 / 课程数据。
 *
 * bookId 规则（与 build-data.ts 一致）：默认出版社不加前缀，非默认出版社
 * 插入 ASCII 短标识：
 *   english-g3up            人教版PEP（默认）
 *   english-hujiao-g3up     沪教版
 *   english-waiyan-g3up     外研社版
 *   english-yilin-g7up      译林版
 *   math-beishida-g1up      北师大版
 *   math-zhejiao-g7up       浙教版
 *
 * 原则（与 gen-stage-content.mjs 相同）：
 *   - 知识点(KP)与概念题(choice/true_false)人工编写，保证学科准确性；
 *   - 计算题由程序按规则生成，答案由程序计算 —— 不会出错；
 *   - 每单元含 knowledge_summary + unit_test + exam(单元挑战)。
 *
 * 单元结构参考各版本现行教材目录（2024/2025 秋）：
 *   沪教版英语三上（牛津上海版 3A）：4 模块 12 单元
 *   外研社版英语三上（一年级起点）：10 模块 20 单元（取模块主题成课）
 *   沪教版英语七上（2024 沪教牛津版）：4 模块 8 单元
 *   外研版英语七上：10 模块
 *   译林版英语七上：8 单元
 *   人教版英语必修第一册：Welcome Unit + 5 单元
 *   北师大版数学一上：8 单元；北师大版数学七上：6 章
 *   苏教版数学一上：8 单元；浙教版数学七上：6 章
 *
 * 运行：node scripts/gen-version-content.mjs（增量 + 覆盖写，不删其它文件）
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUTPUT = path.join(ROOT, "output");

// ══════════════════════ 题目构造器 ══════════════════════
let QID = 0;
const reset = () => { QID = 0; };
const tf = (kp, d, q, a, e) => ({ type: "true_false", score: 2, difficulty: d, knowledge_point: kp, question: q, options: [], answer: a, explanation: e });
const ch = (kp, d, q, o, a, e) => ({ type: "choice", score: 5, difficulty: d, knowledge_point: kp, question: q, options: o, answer: a, explanation: e });
const fb = (kp, d, q, a, e) => ({ type: "fill_blank", score: 5, difficulty: d, knowledge_point: kp, question: q, options: [], answer: String(a), explanation: e });
const ca = (kp, d, q, a, e) => ({ type: "calculation", score: 6, difficulty: d, knowledge_point: kp, question: q, options: [], answer: String(a), explanation: e });

const fmt = n => (Number.isInteger(n) ? String(n) : String(Math.round(n * 1e6) / 1e6));

/** 算术计算题批量生成 */
function arith(kp, d, pairs, op) {
  const sym = { "+": "+", "-": "−", "*": "×", "/": "÷" }[op];
  return pairs.map(([a, b]) => {
    let ans;
    if (op === "+") ans = a + b;
    else if (op === "-") ans = a - b;
    else if (op === "*") ans = a * b;
    else ans = a / b;
    return ca(kp, d, `计算：${fmt(a)} ${sym} ${fmt(b)} = ？`, ans, `${fmt(a)} ${sym} ${fmt(b)} = ${fmt(ans)}。`);
  });
}

/** 一元一次方程求解题批量生成：ax+b=c → x */
function genLinear(kp, d, triples) {
  return triples.map(([a, b, c]) => {
    const x = (c - b) / a;
    return ca(kp, d, `解方程：$${a}x ${b >= 0 ? "+ " + b : "− " + -b} = ${c}$，则 $x = $ ？`, x,
      `移项得 $${a}x = ${c} ${b >= 0 ? "− " + b : "+ " + -b}$，即 $${a}x = ${c - b}$，两边同除以 ${a}，得 $x = ${fmt(x)}$。`);
  });
}

/** 平方根/算术平方根题批量生成（浙教版 实数） */
function genSqrt(kp, d, nums) {
  return nums.map(n =>
    ca(kp, d, `计算：$\\sqrt{${n}} = $ ？`, Math.sqrt(n), `$\\sqrt{${n}} = ${fmt(Math.sqrt(n))}$（${Math.sqrt(n)} 的平方是 ${n}）。`),
  );
}

/** 立方根题批量生成 */
function genCubeRoot(kp, d, nums) {
  return nums.map(n =>
    ca(kp, d, `计算：$\\sqrt[3]{${n}} = $ ？`, Math.cbrt(n), `$\\sqrt[3]{${n}} = ${fmt(Math.cbrt(n))}$，因为 ${fmt(Math.cbrt(n))} 的立方是 ${n}。`),
  );
}

// ══════════════════════ 写入器 ══════════════════════
const stats = { books: 0, units: 0, questions: 0 };

function writeBook(subject, stem, textbook, unitList) {
  const outline = {
    textbook,
    units: unitList.map(u => ({
      unit_number: u.n,
      title: u.title,
      knowledge_points: u.kps.map(k => ({
        name: k.name, description: k.desc, difficulty: k.d ?? 2,
        question_types: k.qt ?? ["选择", "填空", "计算"],
      })),
    })),
  };
  const outDir = path.join(OUTPUT, subject, "outlines");
  const quizDir = path.join(OUTPUT, subject, "quizzes");
  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(quizDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, `${stem}.json`), JSON.stringify(outline, null, 2), "utf-8");

  for (const u of unitList) {
    reset();
    const unitQuestions = u.qs.map(q => ({ id: ++QID, ...q }));
    const examQuestions = (u.exam ?? []).map(q => ({ id: ++QID, ...q }));
    const quiz = {
      textbook, unit: u.title, unit_number: u.n,
      unit_test: {
        title: `第${u.n}单元「${u.title}」基础过关测验`,
        total_score: 100, time_minutes: 40, questions: unitQuestions,
      },
      knowledge_summary: u.kps.map(k => ({
        point: k.name, core_concept: k.core, key_formula: k.formula ?? "",
        common_mistakes: k.mistakes ?? [], tips: k.tips ?? "",
      })),
    };
    if (examQuestions.length >= 4) quiz.exam = { questions: examQuestions };
    fs.writeFileSync(path.join(quizDir, `${stem}_unit${u.n}.json`), JSON.stringify(quiz, null, 2), "utf-8");
    stats.units++;
    stats.questions += unitQuestions.length + examQuestions.length;
  }
  stats.books++;
}

/** 单元构造器（英语按 Module/Unit，数学按章） */
const unit = (n, title, kps, qs, exam) => ({ n, title, kps, qs, exam });

const E = "english";
const M = "math";

// ════════════════════════════════════════════════════════════════════
// 一、小学英语（默认版本 = 人教版PEP；此处为非默认版本）
// ════════════════════════════════════════════════════════════════════

// —— 沪教版（牛津上海版）英语三年级上册：Module 1-4 / Unit 1-12 ——
writeBook(E, "沪教版 · 英语（三年级起点）三年级上册", "三年级上册", [
  unit(1, "Module 1 Getting to know you — Hello! 见面问候", [
    { name: "问候语 Hello / Hi / Good morning", desc: "掌握不同时段的问候语。", d: 1, core: "打招呼泛用 Hello / Hi；Good morning（早上）、Good afternoon（下午）、Good evening（晚上）按时段使用。", formula: "Good morning! — Good morning!", mistakes: ["晚上好说成 Good night（那是睡前道别）。"], tips: "问候语看时段，道别看场合。" },
    { name: "道别 Goodbye / Good night", desc: "掌握告别用语。", d: 1, core: "告别用 Goodbye / Bye；睡前与家人道别用 Good night，回答也用 Good night。", formula: "Goodbye! — Bye!", mistakes: ["把 Good night 当晚上好。"], tips: "Good night = 晚安（道别）。" },
  ], [
    ch("问候语 Hello / Hi / Good morning", 1, "早上见到老师，应该说（　）", ["Good morning!", "Good night!", "Goodbye!", "Good evening!"], "Good morning!", "早上问候用 Good morning。"),
    ch("道别 Goodbye / Good night", 1, "睡前和爸爸妈妈道别应说（　）", ["Good morning", "Good night", "Hello", "Good afternoon"], "Good night", "Good night 是睡前道别。"),
    ch("问候语 Hello / Hi / Good morning", 1, "下午见到同学应说（　）", ["Good morning", "Good afternoon", "Good night", "Goodbye"], "Good afternoon", "下午用 Good afternoon。"),
    tf("问候语 Hello / Hi / Good morning", 1, "Hello 和 Hi 都可以用来打招呼。", "对", "两者皆可，Hi 更随意。"),
  ], [
    ch("问候语 Hello / Hi / Good morning", 2, "第一次见面说 Nice to meet you.，对方应回答（　）", ["Nice to meet you, too.", "Goodbye.", "Good night.", "I'm nine."], "Nice to meet you, too.", "回应加 too。"),
    ch("道别 Goodbye / Good night", 2, "放学和老师说再见，应说（　）", ["Good morning", "Good night", "Goodbye", "Good evening"], "Goodbye", "放学道别用 Goodbye。"),
    tf("道别 Goodbye / Good night", 1, "Good evening 的意思是「晚上好」。", "对", "Good evening 是晚间问候。"),
    ch("问候语 Hello / Hi / Good morning", 2, "— Good morning, class! — ___", ["Good morning, Miss Fang!", "Good night!", "Goodbye!", "Hello!"], "Good morning, Miss Fang!", "互相问候用同一用语。"),
  ]),
  unit(2, "Module 1 Getting to know you — How are you? 你好吗", [
    { name: "询问身体与情绪 How are you?", desc: "掌握 How are you? 及回答。", d: 2, core: "询问身体/情绪用 How are you?，回答 I'm fine, thank you. / Very well, thanks. 反问 And you?", formula: "How are you? — I'm fine, thank you. And you?", mistakes: ["把 How are you? 当成「你是谁」。"], tips: "问「好不好」不是问「是谁」。" },
    { name: "情绪表达 happy / sad / tired", desc: "会用英语表达基本情绪。", d: 2, core: "happy 开心、sad 难过、tired 累、hungry 饿。表达：I'm happy. / I'm tired.", formula: "I'm happy. / I'm tired.", mistakes: ["漏掉 be 动词：I happy（×）。"], tips: "情绪前要有 am/is/are。" },
  ], [
    ch("询问身体与情绪 How are you?", 2, "— How are you? — ___", ["I'm fine, thank you.", "I'm nine.", "My name is Tom.", "Yes, I am."], "I'm fine, thank you.", "问好坏答 I'm fine。"),
    ch("情绪表达 happy / sad / tired", 1, "「我很开心」的英文是（　）", ["I'm happy.", "I'm sad.", "I'm tired.", "I'm fine."], "I'm happy.", "happy 表示开心。"),
    ch("询问身体与情绪 How are you?", 2, "回答别人的关心后，应说（　）", ["Thank you.", "Hello.", "Goodbye.", "Sorry."], "Thank you.", "对关心表示感谢。"),
    tf("情绪表达 happy / sad / tired", 1, "tired 的意思是「疲倦的」。", "对", "tired = 累的。"),
  ], [
    ch("询问身体与情绪 How are you?", 2, "见到朋友，想问他好不好，应说（　）", ["How are you?", "How old are you?", "Who are you?", "What's this?"], "How are you?", "问身体/情绪用 How are you。"),
    tf("询问身体与情绪 How are you?", 1, "I'm fine 表示「我很好」。", "对", "fine = 好的。"),
    ch("情绪表达 happy / sad / tired", 2, "「我很难过」的英文是（　）", ["I'm sad.", "I'm happy.", "I'm hungry.", "I'm fine."], "I'm sad.", "sad = 难过。"),
    ch("询问身体与情绪 How are you?", 3, "— I'm fine, thank you. And you? — ___", ["I'm fine too.", "I'm nine.", "My name is Lily.", "Goodbye."], "I'm fine too.", "反问 And you? 也要回答。"),
  ]),
  unit(3, "Module 1 Getting to know you — Are you Kitty? 你是谁", [
    { name: "一般疑问句 Are you…?", desc: "掌握 Are you…? 及其回答。", d: 2, core: "确认对方身份用 Are you…?，肯定回答 Yes, I am. 否定回答 No, I'm not.", formula: "Are you Kitty? — Yes, I am. / No, I'm not.", mistakes: ["回答写成 Yes, I'm.（×，不能缩写在句末）"], tips: "肯定简答不缩写。" },
    { name: "询问姓名 What's your name?", desc: "掌握询问与回答姓名。", d: 2, core: "询问姓名 What's your name?，回答 My name is… 或 I'm…", formula: "What's your name? — My name is Lily.", mistakes: ["回答漏掉 is：My name Lily（×）。"], tips: "name 后面要有 is。" },
  ], [
    ch("一般疑问句 Are you…?", 2, "— Are you Kitty? — ___", ["Yes, I am.", "Yes, I'm.", "Yes, you are.", "No, I am."], "Yes, I am.", "肯定简答用 Yes, I am."),
    ch("询问姓名 What's your name?", 2, "询问对方姓名应说（　）", ["What's your name?", "How are you?", "Are you Kitty?", "How old are you?"], "What's your name?", "问姓名用 What's your name。"),
    ch("询问姓名 What's your name?", 2, "「我叫莉莉。」的正确表达是（　）", ["My name is Lily.", "My name Lily.", "I name is Lily.", "My am Lily."], "My name is Lily.", "My name is + 名字。"),
    tf("一般疑问句 Are you…?", 2, "Are you…? 是一般疑问句，用 Yes / No 回答。", "对", "be 动词开头的一般疑问句。"),
  ], [
    ch("一般疑问句 Are you…?", 2, "— Are you Sam? — No, ___", ["I'm not.", "I am.", "you aren't.", "I'm."], "I'm not.", "否定简答用 No, I'm not."),
    ch("询问姓名 What's your name?", 3, "老师想知道你的名字，会问（　）", ["What's your name?", "How are you?", "Are you a pupil?", "Nice to meet you."], "What's your name?", "问姓名。"),
    tf("询问姓名 What's your name?", 2, "I'm Lily. 也可以用来回答 What's your name?", "对", "I'm… = My name is…"),
    ch("一般疑问句 Are you…?", 3, "想确认「你是 Jill 吗」，应说（　）", ["Are you Jill?", "You are Jill.", "Is you Jill?", "Are Jill you?"], "Are you Jill?", "确认身份用 Are you…?"),
  ]),
  unit(4, "Module 2 My family, my friends and me — My friends 我的朋友", [
    { name: "介绍朋友 This is my friend…", desc: "会把朋友介绍给别人。", d: 2, core: "介绍他人用 This is…（这是……）。介绍朋友：This is my friend, Tom.", formula: "This is my friend, Tom.", mistakes: ["介绍时说 He is my friend 而不先用 This is。"], tips: "当面介绍首选 This is…" },
    { name: "人称代词 he / she", desc: "会按性别选用 he / she。", d: 2, core: "男性用 he（他），女性用 she（她）；he's = he is，she's = she is。", formula: "Tom is a boy. He's my friend.", mistakes: ["男女代词混用。"], tips: "先看性别再选代词。" },
  ], [
    ch("介绍朋友 This is my friend…", 2, "把朋友汤姆介绍给别人，应说（　）", ["This is my friend, Tom.", "He is Tom friend.", "This is Tom friend.", "I am Tom."], "This is my friend, Tom.", "介绍他人用 This is…"),
    ch("人称代词 he / she", 2, "Tom 是男孩名，句子中用 ___ 代替 Tom。", ["He", "She", "It", "His"], "He", "男性用 he。"),
    ch("人称代词 he / she", 2, "Lily 是女孩名，句子中用 ___ 代替 Lily。", ["She", "He", "It", "Her"], "She", "女性用 she。"),
    tf("介绍朋友 This is my friend…", 1, "This is… 用于把某人介绍给别人。", "对", "介绍用语。"),
  ], [
    ch("介绍朋友 This is my friend…", 2, "「她是我的朋友。」的英文是（　）", ["She's my friend.", "She my friend.", "Her is my friend.", "She's my friends."], "She's my friend.", "she's = she is。"),
    tf("人称代词 he / she", 2, "he's 是 he is 的缩写。", "对", "缩写规则。"),
    ch("介绍朋友 This is my friend…", 3, "— This is my friend, Amy. — ___", ["Nice to meet you, Amy.", "Goodbye, Amy.", "How old are you?", "I'm fine."], "Nice to meet you, Amy.", "被介绍后应问好。"),
    ch("人称代词 he / she", 3, "___ is my friend. ___ name is Tom.", ["He; His", "His; He", "He; He", "She; Her"], "He; His", "主语用主格，名词前用物主代词。"),
  ]),
  unit(5, "Module 2 My family, my friends and me — My family 我的家庭", [
    { name: "家庭成员 father / mother / brother / sister", desc: "掌握家庭成员的英文表达。", d: 2, core: "father 爸爸、mother 妈妈、brother 兄弟、sister 姐妹。也可用 dad / mum（口语）。", formula: "father / mother / brother / sister", mistakes: ["brother 与 sister 混用。"], tips: "dad/mum 更口语，father/mother 更正式。" },
    { name: "介绍家人 This is my…", desc: "会向别人介绍自己的家人。", d: 2, core: "介绍家人用 This is my father / mother / brother / sister。复数 these are…", formula: "This is my father. / These are my parents.", mistakes: ["介绍多人还用 this is。"], tips: "多个用 these are。" },
  ], [
    ch("家庭成员 father / mother / brother / sister", 1, "「爸爸」的英文是（　）", ["father", "mother", "brother", "sister"], "father", "father = 爸爸。"),
    ch("家庭成员 father / mother / brother / sister", 1, "「妈妈」的英文是（　）", ["mother", "father", "sister", "brother"], "mother", "mother = 妈妈。"),
    ch("介绍家人 This is my…", 2, "「这是我爸爸。」的英文是（　）", ["This is my father.", "This is my mother.", "He is my father.", "This my father."], "This is my father.", "介绍家人用 This is my…"),
    tf("家庭成员 father / mother / brother / sister", 1, "sister 的意思是「姐妹」。", "对", "sister = 姐妹。"),
  ], [
    ch("家庭成员 father / mother / brother / sister", 2, "「兄弟」的英文是（　）", ["brother", "sister", "father", "mother"], "brother", "brother = 兄弟。"),
    ch("介绍家人 This is my…", 2, "介绍全家人应说（　）", ["This is my family.", "This is my father.", "These is my family.", "This are my family."], "This is my family.", "家庭作为一个整体用单数。"),
    tf("家庭成员 father / mother / brother / sister", 2, "parents 指的是「父母双方」。", "对", "parents = 父母。"),
    ch("介绍家人 This is my…", 3, "「这些是我的朋友。」的英文是（　）", ["These are my friends.", "This is my friends.", "These is my friend.", "This are my friends."], "These are my friends.", "复数用 These are。"),
  ]),
  unit(6, "Module 2 My family, my friends and me — Me 我自己", [
    { name: "自我介绍 I'm…", desc: "会用 I'm… 介绍姓名与身份。", d: 2, core: "I'm = I am，后接名字（I'm Tom）或身份（I'm a pupil）。", formula: "I'm Tom. I'm a pupil.", mistakes: ["I'm 后漏掉 a：I'm pupil（×）。"], tips: "职业/身份前加 a。" },
    { name: "表达年龄 I'm nine (years old)", desc: "会用英语表达年龄。", d: 2, core: "表达年龄：I'm nine. 或 I'm nine years old. 询问用 How old are you?", formula: "How old are you? — I'm nine.", mistakes: ["说成 I have nine.（×）"], tips: "年龄用 be 动词，不用 have。" },
  ], [
    ch("自我介绍 I'm…", 1, "「我是一名小学生。」的英文是（　）", ["I'm a pupil.", "I'm pupil.", "I a pupil.", "I'm an pupil."], "I'm a pupil.", "身份前加 a。"),
    ch("表达年龄 I'm nine (years old)", 2, "「我九岁。」的英文是（　）", ["I'm nine.", "I have nine.", "I'm nine year.", "My nine."], "I'm nine.", "年龄用 I'm + 数字。"),
    tf("自我介绍 I'm…", 1, "I'm 是 I am 的缩写。", "对", "缩写形式。"),
    ch("表达年龄 I'm nine (years old)", 2, "询问对方年龄应说（　）", ["How old are you?", "How are you?", "What's your name?", "Are you nine?"], "How old are you?", "How old 问年龄。"),
  ], [
    ch("自我介绍 I'm…", 2, "「他十岁。」的英文是（　）", ["He is ten.", "He are ten.", "He ten.", "He is ten year."], "He is ten.", "He is + 数字。"),
    ch("表达年龄 I'm nine (years old)", 3, "— Are you nine? — Yes, ___", ["I am", "I'm nine", "you are", "he is"], "I am", "简答用 Yes, I am."),
    tf("表达年龄 I'm nine (years old)", 2, "表达年龄用 be 动词 am / is / are。", "对", "不用 have。"),
    ch("自我介绍 I'm…", 3, "向新同学介绍自己，不合适的是（　）", ["How old are you?", "I'm Li Ming.", "I'm a pupil.", "Nice to meet you."], "How old are you?", "先介绍自己，不要先问隐私。"),
  ]),
  unit(7, "Module 3 Places and activities — In the classroom 在教室里", [
    { name: "教室词汇 classroom / desk / chair / blackboard", desc: "掌握教室物品词汇。", d: 2, core: "classroom 教室、desk 课桌、chair 椅子、blackboard 黑板。", formula: "in the classroom 在教室里", mistakes: ["desk 与 chair 混用。"], tips: "desk 桌面大，chair 是坐的。" },
    { name: "方位介词 on / in / under", desc: "会用介词表达位置。", d: 2, core: "on 在……上面、in 在……里面、under 在……下面。句型 Where is…? It's on the desk.", formula: "It's on the desk. / It's in the bag.", mistakes: ["on 与 in 混用。"], tips: "接触表面用 on，包在里面用 in。" },
  ], [
    ch("教室词汇 classroom / desk / chair / blackboard", 1, "「教室」的英文是（　）", ["classroom", "class", "room", "school"], "classroom", "classroom = 教室。"),
    ch("方位介词 on / in / under", 2, "「它在桌子上。」的英文是（　）", ["It's on the desk.", "It's in the desk.", "It's under the desk.", "It's a desk."], "It's on the desk.", "在表面用 on。"),
    ch("方位介词 on / in / under", 2, "「书包在椅子下面。」应说（　）", ["The bag is under the chair.", "The bag is on the chair.", "The bag is in the chair.", "The bag is a chair."], "The bag is under the chair.", "under = 在……下面。"),
    tf("方位介词 on / in / under", 1, "in 表示「在……里面」。", "对", "in = 在里面。"),
  ], [
    ch("教室词汇 classroom / desk / chair / blackboard", 1, "「黑板」的英文是（　）", ["blackboard", "blackboardd", "board black", "white board"], "blackboard", "blackboard = 黑板。"),
    ch("方位介词 on / in / under", 2, "「椅子」的英文是（　）", ["chair", "desk", "door", "window"], "chair", "chair = 椅子。"),
    tf("方位介词 on / in / under", 2, "Where is my pen? 是在问「我的钢笔在哪里」。", "对", "where 问地点。"),
    ch("方位介词 on / in / under", 3, "书在书包里，应说（　）", ["The book is in the bag.", "The book is on the bag.", "The book is under the bag.", "The book is a bag."], "The book is in the bag.", "在里面用 in。"),
  ]),
  unit(8, "Module 3 Places and activities — At the fruit shop 在水果店", [
    { name: "水果词汇 apple / banana / orange / pear", desc: "掌握常见水果词汇。", d: 2, core: "apple 苹果、banana 香蕉、orange 橙子、pear 梨。", formula: "an apple / a banana / an orange / a pear", mistakes: ["an apple 写成 a apple。"], tips: "元音音素前用 an。" },
    { name: "表达喜好 I like…", desc: "会用英语表达喜欢的水果。", d: 2, core: "表达喜好 I like apples.（喜欢苹果这类，用复数）；单指一个用 I'd like an apple.", formula: "I like apples. / I'd like an apple.", mistakes: ["I like apple.（泛指要复数）"], tips: "泛指一类用复数。" },
  ], [
    ch("水果词汇 apple / banana / orange / pear", 1, "「苹果」的英文是（　）", ["apple", "banana", "orange", "pear"], "apple", "apple = 苹果。"),
    ch("水果词汇 apple / banana / orange / pear", 1, "「香蕉」的英文是（　）", ["banana", "apple", "orange", "pear"], "banana", "banana = 香蕉。"),
    ch("表达喜好 I like…", 2, "「我喜欢苹果。」的英文是（　）", ["I like apples.", "I like apple.", "I likes apples.", "I'm like apples."], "I like apples.", "泛指用复数。"),
    tf("水果词汇 apple / banana / orange / pear", 1, "orange 的意思是「橙子」。", "对", "orange = 橙子。"),
  ], [
    ch("水果词汇 apple / banana / orange / pear", 2, "「梨」的英文是（　）", ["pear", "apple", "banana", "orange"], "pear", "pear = 梨。"),
    ch("表达喜好 I like…", 2, "「我想要一个苹果。」的英文是（　）", ["I'd like an apple.", "I like an apple.", "I'm like apple.", "I likes apple."], "I'd like an apple.", "I'd like = I would like 想要。"),
    tf("水果词汇 apple / banana / orange / pear", 2, "fruit 的意思是「水果」。", "对", "fruit = 水果。"),
    ch("表达喜好 I like…", 3, "— Do you like bananas? — ___", ["Yes, I do.", "Yes, I like.", "Yes, I am.", "Yes, I can."], "Yes, I do.", "do 问 do 答。"),
  ]),
  unit(9, "Module 3 Places and activities — In my room 在我的房间", [
    { name: "房间物品 bed / table / lamp / toy", desc: "掌握房间物品词汇。", d: 2, core: "bed 床、table 桌子、lamp 台灯、toy 玩具。", formula: "in my room 在我的房间", mistakes: ["lamp 与 light 混淆。"], tips: "lamp 指灯具本身。" },
    { name: "询问位置 Where's my…?", desc: "会用 Where's…? 询问位置。", d: 2, core: "询问单数物品位置用 Where's my…?（Where is 的缩写），回答 It's…", formula: "Where's my bag? — It's on the bed.", mistakes: ["Where's 后面接复数物品。"], tips: "复数用 Where are…?" },
  ], [
    ch("房间物品 bed / table / lamp / toy", 1, "「床」的英文是（　）", ["bed", "bad", "bid", "bud"], "bed", "bed = 床。"),
    ch("房间物品 bed / table / lamp / toy", 1, "「台灯」的英文是（　）", ["lamp", "lampy", "light", "lantern"], "lamp", "lamp = 台灯。"),
    ch("询问位置 Where's my…?", 2, "「我的书包在哪里？」的英文是（　）", ["Where's my bag?", "Where's my bags?", "What's my bag?", "Where are my bag?"], "Where's my bag?", "单数用 Where's。"),
    tf("房间物品 bed / table / lamp / toy", 1, "room 的意思是「房间」。", "对", "room = 房间。"),
  ], [
    ch("房间物品 bed / table / lamp / toy", 2, "「玩具」的英文是（　）", ["toy", "boy", "toyy", "joy"], "toy", "toy = 玩具。"),
    ch("询问位置 Where's my…?", 2, "— Where's my cap? — ___", ["It's on the bed.", "It's on the beds.", "Yes, it is.", "I'm fine."], "It's on the bed.", "回答位置用 It's…"),
    tf("询问位置 Where's my…?", 2, "询问多个物品的位置要用 Where are…?", "对", "复数配 are。"),
    ch("询问位置 Where's my…?", 3, "想知道玩具在哪里，应问（　）", ["Where's my toy?", "What's my toy?", "Who's my toy?", "How's my toy?"], "Where's my toy?", "where 问地点。"),
  ]),
  unit(10, "Module 4 The world around us — Numbers 数字", [
    { name: "数字 1-12 与 eleven / twelve", desc: "掌握 1-12 的英文表达。", d: 2, core: "one 到 ten 之后是 eleven（11）、twelve（12）。", formula: "eleven / twelve", mistakes: ["eleven 写成 elevan。"], tips: "11、12 是特殊变化，要单独记。" },
    { name: "询问数量 How many…?", desc: "会用 How many 询问数量。", d: 2, core: "询问可数物品数量用 How many…?，回答直接给数字：Three.", formula: "How many apples? — Three.", mistakes: ["How many 后接不可数名词。"], tips: "many 后接可数名词复数。" },
  ], [
    ch("数字 1-12 与 eleven / twelve", 1, "11 的英文是（　）", ["eleven", "twelve", "ten", "twenty"], "eleven", "11 = eleven。"),
    ch("数字 1-12 与 eleven / twelve", 1, "12 的英文是（　）", ["twelve", "eleven", "twenty", "thirteen"], "twelve", "12 = twelve。"),
    ch("询问数量 How many…?", 2, "— How many apples? — ___", ["Three.", "Fine.", "Yes.", "It's red."], "Three.", "How many 问数量答数字。"),
    tf("数字 1-12 与 eleven / twelve", 1, "ten 表示数字 10。", "对", "10 = ten。"),
  ], [
    ch("数字 1-12 与 eleven / twelve", 2, "one, two, three, four, ___, six，横线上应填（　）", ["five", "seven", "eight", "nine"], "five", "顺序 4 后面是 5。"),
    ch("询问数量 How many…?", 2, "询问班里有多少同学，应问（　）", ["How many students?", "How much students?", "How old students?", "What many students?"], "How many students?", "可数名词用 how many。"),
    tf("数字 1-12 与 eleven / twelve", 2, "eleven 比 ten 大。", "对", "11 > 10。"),
    ch("数字 1-12 与 eleven / twelve", 3, "ten, eleven, ___, thirteen，横线上应填（　）", ["twelve", "fourteen", "nine", "fifteen"], "twelve", "12 在 11 与 13 之间。"),
  ]),
  unit(11, "Module 4 The world around us — Small animals 小动物", [
    { name: "动物词汇 cat / dog / bird / rabbit / fish", desc: "掌握常见小动物词汇。", d: 2, core: "cat 猫、dog 狗、bird 鸟、rabbit 兔子、fish 鱼。", formula: "a cat / a dog / a bird / a rabbit / a fish", mistakes: ["rabbit 写成 rabit。"], tips: "rabbit 双写 b。" },
    { name: "表达拥有 I have a…", desc: "会用 I have… 表达拥有。", d: 2, core: "表达拥有用 I have a / an…；复数 I have two…", formula: "I have a bird. / I have two rabbits.", mistakes: ["I have a birds.（×）"], tips: "数量大于 1 名词用复数。" },
  ], [
    ch("动物词汇 cat / dog / bird / rabbit / fish", 1, "「猫」的英文是（　）", ["cat", "caty", "kat", "cit"], "cat", "cat = 猫。"),
    ch("动物词汇 cat / dog / bird / rabbit / fish", 1, "「狗」的英文是（　）", ["dog", "dig", "dug", "doge"], "dog", "dog = 狗。"),
    ch("表达拥有 I have a…", 2, "「我有一只小鸟。」的英文是（　）", ["I have a bird.", "I have bird.", "I has a bird.", "I have a birds."], "I have a bird.", "单数前加 a。"),
    tf("动物词汇 cat / dog / bird / rabbit / fish", 1, "rabbit 的意思是「兔子」。", "对", "rabbit = 兔子。"),
  ], [
    ch("动物词汇 cat / dog / bird / rabbit / fish", 2, "「鱼」的英文是（　）", ["fish", "fishe", "feesh", "fishs"], "fish", "fish = 鱼。"),
    ch("表达拥有 I have a…", 2, "「我有两只兔子。」的英文是（　）", ["I have two rabbits.", "I have two rabbit.", "I has two rabbits.", "I have a two rabbits."], "I have two rabbits.", "复数加 -s。"),
    tf("动物词汇 cat / dog / bird / rabbit / fish", 2, "animal 的意思是「动物」。", "对", "animal = 动物。"),
    ch("表达拥有 I have a…", 3, "— What do you have? — ___", ["I have a dog.", "I'm a dog.", "Yes, I do.", "I like dogs."], "I have a dog.", "问拥有答 I have…"),
  ]),
  unit(12, "Module 4 The world around us — The four seasons 四季", [
    { name: "季节 spring / summer / autumn / winter", desc: "掌握四季的英文表达。", d: 2, core: "spring 春、summer 夏、autumn 秋、winter 冬。一年有四个季节。", formula: "spring / summer / autumn / winter", mistakes: ["autumn 与 fall 混淆（fall 是美式）。"], tips: "autumn 英式，fall 美式，都对。" },
    { name: "表达最喜欢 I like… best", desc: "会用 best 表达「最」。", d: 2, core: "表达最喜欢用 I like… best.；询问 Which season do you like best?", formula: "I like autumn best.", mistakes: ["I best like autumn.（×）"], tips: "best 放在句末。" },
  ], [
    ch("季节 spring / summer / autumn / winter", 1, "「春天」的英文是（　）", ["spring", "summer", "autumn", "winter"], "spring", "spring = 春天。"),
    ch("季节 spring / summer / autumn / winter", 1, "「夏天」的英文是（　）", ["summer", "spring", "autumn", "winter"], "summer", "summer = 夏天。"),
    ch("表达最喜欢 I like… best", 2, "「我最喜欢秋天。」的英文是（　）", ["I like autumn best.", "I best like autumn.", "I like best autumn.", "I'm like autumn best."], "I like autumn best.", "best 放句末。"),
    tf("季节 spring / summer / autumn / winter", 1, "winter 的意思是「冬天」。", "对", "winter = 冬天。"),
  ], [
    ch("季节 spring / summer / autumn / winter", 2, "「秋天」的英文是（　）", ["autumn", "spring", "summer", "winter"], "autumn", "autumn = 秋天。"),
    ch("季节 spring / summer / autumn / winter", 2, "一年有（　）个季节", ["四", "三", "五", "六"], "四", "春夏秋冬共四季。"),
    tf("季节 spring / summer / autumn / winter", 2, "夏天通常很热。", "对", "夏季高温。"),
    ch("表达最喜欢 I like… best", 3, "— Which season do you like best? — ___", ["I like summer best.", "I like summer good.", "I'm summer.", "Yes, I do."], "I like summer best.", "问最喜欢，答 like… best。"),
  ]),
]);

// —— 外研社版（一年级起点）英语三年级上册：Module 1-10 ——
writeBook(E, "外研社版 · 英语（一年级起点）三年级上册", "三年级上册", [
  unit(1, "Module 1 Food and table manners 饮食与餐具", [
    { name: "食物与餐具词汇", desc: "掌握 rice / noodles / hamburger / chips 与 chopsticks / knife / fork。", d: 3, core: "rice 米饭、noodles 面条、hamburger 汉堡、chips 炸薯条；chopsticks 筷子、knife 刀、fork 叉。英国人常用一副刀叉 a knife and fork。", formula: "We use a knife and fork.", mistakes: ["chopsticks 当单数（它是复数）。"], tips: "筷子总是成对，用复数。" },
    { name: "现在进行时 be + doing", desc: "掌握现在进行时的基本用法。", d: 3, core: "表示此时此刻正在进行的动作用 be + 动词 -ing。问句 What are you eating? 答 I'm eating…", formula: "What are you eating? — I'm eating hamburgers and chips.", mistakes: ["漏掉 be 动词：I eating（×）。"], tips: "be + doing 缺一不可。" },
  ], [
    ch("食物与餐具词汇", 3, "「米饭」的英文是（　）", ["rice", "ice", "rise", "race"], "rice", "rice = 米饭。"),
    ch("食物与餐具词汇", 3, "「筷子」的英文是（　）", ["chopsticks", "chopstick", "knife", "fork"], "chopsticks", "筷子常用复数。"),
    ch("现在进行时 be + doing", 3, "— What are you eating? — ___", ["I'm eating hamburgers and chips.", "I eat hamburgers.", "I'm eat hamburgers.", "Yes, I am."], "I'm eating hamburgers and chips.", "进行时 be + doing。"),
    tf("食物与餐具词汇", 3, "a knife and fork 的意思是「一副刀叉」。", "对", "刀叉合称。"),
  ], [
    ch("食物与餐具词汇", 3, "「汉堡包」的英文是（　）", ["hamburger", "humberger", "hamberger", "hamburg"], "hamburger", "hamburger = 汉堡包。"),
    ch("现在进行时 be + doing", 3, "Look! The ducks ___ in the rain.", ["are playing", "play", "plays", "played"], "are playing", "Look! 提示此刻正在发生。"),
    tf("食物与餐具词汇", 3, "英国人吃饭常用刀叉。", "对", "knife and fork。"),
    ch("现在进行时 be + doing", 4, "表示「我正在吃苹果」，应说（　）", ["I'm eating an apple.", "I eat an apple.", "I'm eat an apple.", "I eating an apple."], "I'm eating an apple.", "be + eating。"),
  ]),
  unit(2, "Module 2 Making a cake and watching TV 做蛋糕与看电视", [
    { name: "家务词汇 make / clean / wash", desc: "掌握常见家务动词。", d: 3, core: "make a cake 做蛋糕、clean the room 打扫房间、wash clothes 洗衣服。", formula: "We're making a cake.", mistakes: ["make 与 doing 混用。"], tips: "做蛋糕用 make，不用 cook。" },
    { name: "现在进行时的疑问句", desc: "掌握 What are you doing? 问答。", d: 3, core: "问正在做什么：What are you doing? 答 I'm… / We're…；提醒安静 Please be quiet.", formula: "What are you doing? — We're making a cake.", mistakes: ["回答时态不一致。"], tips: "问句进行时，答句也要进行时。" },
  ], [
    ch("家务词汇 make / clean / wash", 3, "「做蛋糕」的英文是（　）", ["make a cake", "do a cake", "making cake", "make cake"], "make a cake", "做蛋糕用 make。"),
    ch("现在进行时的疑问句", 3, "— What are you doing? — ___", ["We're making a cake.", "We make a cake.", "We're make a cake.", "Yes, we are."], "We're making a cake.", "be + doing。"),
    ch("家务词汇 make / clean / wash", 3, "「请保持安静」的英文是（　）", ["Please be quiet.", "Please be quite.", "Please is quiet.", "Quiet please be."], "Please be quiet.", "quiet 是安静的。"),
    tf("现在进行时的疑问句", 3, "现在进行时的结构是 be + 动词 -ing。", "对", "be + doing。"),
  ], [
    ch("家务词汇 make / clean / wash", 3, "「打扫房间」的英文是（　）", ["clean the room", "clean room", "cleaning the room", "make the room"], "clean the room", "clean 打扫。"),
    ch("现在进行时的疑问句", 4, "妈妈在看书，应说（　）", ["Mum is reading.", "Mum reads.", "Mum is read.", "Mum are reading."], "Mum is reading.", "第三人称单数用 is。"),
    tf("家务词汇 make / clean / wash", 3, "wash 的意思是「洗」。", "对", "wash = 洗。"),
    ch("现在进行时的疑问句", 4, "问别人正在做什么，应说（　）", ["What are you doing?", "What do you do?", "What are you do?", "How are you doing?"], "What are you doing?", "进行时特殊疑问句。"),
  ]),
  unit(3, "Module 3 These ducks are very naughty 淘气的鸭子", [
    { name: "指示代词 this / that / these / those", desc: "掌握四个指示代词。", d: 3, core: "this 这个（近）、that 那个（远）、these 这些（近，复数）、those 那些（远，复数）。", formula: "This is a duck. / These are ducks.", mistakes: ["these 当成单数。"], tips: "单近 this，单远 that；复近 these，复远 those。" },
    { name: "动物词汇 duck / naughty", desc: "掌握 duck 与描述动物的形容词。", d: 3, core: "duck 鸭子（复 ducks）、naughty 淘气的、cute 可爱的、lovely 可爱的。", formula: "These ducks are very naughty!", mistakes: ["duck 复数写成 duckes。"], tips: "一般名词直接加 -s。" },
  ], [
    ch("指示代词 this / that / these / those", 3, "指近处的多个物体，用（　）", ["these", "this", "that", "those"], "these", "复近用 these。"),
    ch("指示代词 this / that / these / those", 3, "指远处的单个物体，用（　）", ["that", "this", "these", "those"], "that", "单远用 that。"),
    ch("动物词汇 duck / naughty", 3, "「淘气的」的英文是（　）", ["naughty", "naughtyy", "nauti", "naugthy"], "naughty", "naughty = 淘气的。"),
    tf("指示代词 this / that / these / those", 3, "these 是复数，后面接复数名词。", "对", "these + 复数。"),
  ], [
    ch("指示代词 this / that / these / those", 4, "「那些」的英文是（　）", ["those", "these", "this", "that"], "those", "复远用 those。"),
    ch("动物词汇 duck / naughty", 3, "「鸭子」的复数是（　）", ["ducks", "duckes", "duck", "duckies"], "ducks", "一般加 -s。"),
    tf("指示代词 this / that / these / those", 3, "this 指近处的单个事物。", "对", "单近 this。"),
    ch("动物词汇 duck / naughty", 4, "— What are those? — ___", ["They are flowers.", "They is flowers.", "It is flowers.", "These are flower."], "They are flowers.", "复数用 they are。"),
  ]),
  unit(4, "Module 4 I can jump 我能行", [
    { name: "情态动词 can / can't", desc: "掌握 can 表示能力。", d: 3, core: "can 表示「能、会」，后接动词原形；否定 can't = cannot。问句 Can you…? 答 Yes, I can. / No, I can't.", formula: "Can you run fast? — Yes, I can.", mistakes: ["can 后接 to do 或三单形式。"], tips: "can 后永远用原形。" },
    { name: "动作词汇 jump / run / swim / fly", desc: "掌握常见动作词。", d: 3, core: "jump 跳、run 跑、swim 游泳、fly 飞；jump far 跳得远、run fast 跑得快。", formula: "I can jump far. / It can fly.", mistakes: ["far 与 fast 混用。"], tips: "far 管距离，fast 管速度。" },
  ], [
    ch("情态动词 can / can't", 3, "— Can you run fast? — ___", ["Yes, I can.", "Yes, I do.", "Yes, I am.", "Yes, I can't."], "Yes, I can.", "can 问 can 答。"),
    ch("情态动词 can / can't", 3, "「我不会跳远。」的英文是（　）", ["I can't jump far.", "I can jump far.", "I can't to jump far.", "I don't can jump far."], "I can't jump far.", "否定 can't + 原形。"),
    ch("动作词汇 jump / run / swim / fly", 3, "「它会飞。」的英文是（　）", ["It can fly.", "It can flies.", "It can to fly.", "It can't fly."], "It can fly.", "can + 原形。"),
    tf("情态动词 can / can't", 3, "can 表示能力，意思是「能、会」。", "对", "表能力。"),
  ], [
    ch("动作词汇 jump / run / swim / fly", 3, "「胜利者」的英文是（　）", ["winner", "win", "winning", "winer"], "winner", "win + ner。"),
    tf("情态动词 can / can't", 3, "can't 是 cannot 的缩写。", "对", "can't = cannot。"),
    ch("情态动词 can / can't", 4, "小鸟不会飞，应说（　）", ["The bird can't fly.", "The bird can fly.", "The bird can't flies.", "The bird don't fly."], "The bird can't fly.", "否定 + 原形。"),
    ch("动作词汇 jump / run / swim / fly", 4, "「我游得很好」的英文是（　）", ["I can swim well.", "I can swim good.", "I can swims well.", "I can to swim well."], "I can swim well.", "副词 well 修饰动词。"),
  ]),
  unit(5, "Module 5 Can I have an ice cream? 请求与许可", [
    { name: "请求用语 Can I…?", desc: "掌握礼貌请求的表达。", d: 3, core: "请求许可用 Can I…?，肯定 Yes, you can. / Yes, here you are. 否定 No, you can't. But you can have a cake.", formula: "Can I have an ice cream? — Yes, here you are.", mistakes: ["请求时用 Give me…（不礼貌）。"], tips: "礼貌请求带 please 更好。" },
    { name: "购物与场所词汇", desc: "掌握 shop / ice cream / library。", d: 3, core: "shop 商店、ice cream 冰淇淋、library 图书馆；Don't worry. 别担心。", formula: "go to the shop 去商店", mistakes: ["ice cream 写成 icecream。"], tips: "ice cream 分两词写。" },
  ], [
    ch("请求用语 Can I…?", 3, "「我可以吃个冰淇淋吗？」的英文是（　）", ["Can I have an ice cream?", "Can I has an ice cream?", "Can I have a ice cream?", "I can have an ice cream?"], "Can I have an ice cream?", "元音音素前用 an。"),
    ch("请求用语 Can I…?", 3, "肯定回答别人的请求，应说（　）", ["Yes, you can.", "Yes, I can.", "Yes, you do.", "Yes, please do."], "Yes, you can.", "问 you 答 you。"),
    ch("购物与场所词汇", 3, "「商店」的英文是（　）", ["shop", "ship", "sharp", "sheep"], "shop", "shop = 商店。"),
    tf("请求用语 Can I…?", 3, "Can I come in? 是在请求许可。", "对", "请求进门。"),
  ], [
    ch("购物与场所词汇", 3, "「图书馆」的英文是（　）", ["library", "libary", "librery", "libbary"], "library", "library = 图书馆。"),
    ch("请求用语 Can I…?", 3, "「给你。」的英文是（　）", ["Here you are.", "Here are you.", "You are here.", "Here it is you."], "Here you are.", "固定表达。"),
    tf("购物与场所词汇", 3, "Don't worry 的意思是「别担心」。", "对", "安慰用语。"),
    ch("请求用语 Can I…?", 4, "— Can I come in? — ___", ["Yes, please.", "Yes, I can.", "No, I can't.", "Yes, you are."], "Yes, please.", "请进用 Yes, please。"),
  ]),
  unit(6, "Module 6 I've got new shorts and new shoes 衣物与拥有", [
    { name: "have got 表示拥有", desc: "掌握 have got 的用法。", d: 3, core: "have got = have，表示「有」。第三人称用 has got：He's got… / She's got…", formula: "I've got new shoes. / He's got a new shirt.", mistakes: ["第三人称还用 have got。"], tips: "he/she 配 has got。" },
    { name: "衣物词汇 shorts / shoes / shirt / trousers", desc: "掌握常见衣物词汇。", d: 3, core: "shorts 短裤、shoes 鞋、shirt 衬衫、trousers 裤子。这些词常用复数（成对/两条裤腿）。", formula: "new shorts and new shoes", mistakes: ["trousers 当单数。"], tips: "裤子短裤成对，常用复数。" },
  ], [
    ch("have got 表示拥有", 3, "「我有新鞋。」的英文是（　）", ["I've got new shoes.", "I've get new shoes.", "I has got new shoes.", "I've got new shoe."], "I've got new shoes.", "I've got = I have got。"),
    ch("衣物词汇 shorts / shoes / shirt / trousers", 3, "「短裤」的英文是（　）", ["shorts", "short", "shirts", "shortes"], "shorts", "常用复数。"),
    ch("衣物词汇 shorts / shoes / shirt / trousers", 3, "「衬衫」的英文是（　）", ["shirt", "shorts", "skirt", "short"], "shirt", "shirt = 衬衫。"),
    tf("have got 表示拥有", 3, "have got 表示「拥有」。", "对", "= have。"),
  ], [
    ch("have got 表示拥有", 3, "「他有一件新衬衫。」的英文是（　）", ["He's got a new shirt.", "He have got a new shirt.", "He's get a new shirt.", "He's got new shirt."], "He's got a new shirt.", "三单用 has got。"),
    ch("衣物词汇 shorts / shoes / shirt / trousers", 4, "「裤子」的英文是（　）", ["trousers", "trouser", "trowsers", "troussers"], "trousers", "常用复数。"),
    tf("衣物词汇 shorts / shoes / shirt / trousers", 3, "shorts 通常以复数形式出现。", "对", "两个裤腿。"),
    ch("have got 表示拥有", 4, "— Has she got a new bag? — ___", ["Yes, she has.", "Yes, she have.", "Yes, she is.", "No, she hasn't got."], "Yes, she has.", "has 问 has 答。"),
  ]),
  unit(7, "Module 7 Have you got a headache? 健康", [
    { name: "疾病词汇 headache / stomach ache / cold / cough", desc: "掌握常见病痛表达。", d: 3, core: "headache 头痛、stomach ache 肚子痛、cold 感冒、cough 咳嗽；have got a cold 感冒了。", formula: "Have you got a headache?", mistakes: ["头痛说成 head ache 分开。"], tips: "headache 合起来写。" },
    { name: "Have you got…? 问答", desc: "掌握 have got 疑问句。", d: 3, core: "have got 变疑问句把 have/has 提前：Have you got…? Has she got…? 否定 No, I haven't. / No, she hasn't.", formula: "Have you got a test today? — Yes, I have.", mistakes: ["回答写成 Yes, I've.（×）"], tips: "简答不能缩写。" },
  ], [
    ch("疾病词汇 headache / stomach ache / cold / cough", 3, "「你头痛吗？」的英文是（　）", ["Have you got a headache?", "Have you got a head ache?", "Do you have headache?", "Are you headache?"], "Have you got a headache?", "headache 合写。"),
    ch("Have you got…? 问答", 3, "否定回答 Have you got…?，应说（　）", ["No, I haven't.", "No, I don't.", "No, I'm not.", "No, I have."], "No, I haven't.", "have 问 haven't 答。"),
    ch("疾病词汇 headache / stomach ache / cold / cough", 3, "「感冒」的英文是（　）", ["a cold", "a cool", "a cough", "a feverr"], "a cold", "have got a cold 感冒。"),
    tf("疾病词汇 headache / stomach ache / cold / cough", 3, "cough 的意思是「咳嗽」。", "对", "cough = 咳嗽。"),
  ], [
    ch("Have you got…? 问答", 3, "— Has she got a cold? — ___", ["Yes, she has.", "Yes, she have.", "Yes, she is.", "No, she hasn't got."], "Yes, she has.", "has 问 has 答。"),
    ch("疾病词汇 headache / stomach ache / cold / cough", 4, "「考试」的英文是（　）", ["test", "text", "tast", "tests"], "test", "test = 考试。"),
    tf("Have you got…? 问答", 4, "have got 的疑问句把 have / has 提到句首。", "对", "提前构成疑问。"),
    ch("疾病词汇 headache / stomach ache / cold / cough", 4, "你肚子痛，应说（　）", ["I've got a stomach ache.", "I've got a head ache.", "I've got a cold.", "I'm stomach ache."], "I've got a stomach ache.", "肚子痛 stomach ache。"),
  ]),
  unit(8, "Module 8 This is Sam's book 物品归属", [
    { name: "名词所有格 's", desc: "掌握 's 表示所属。", d: 3, core: "人名后加 's 表示「……的」：Sam's book 萨姆的书、my grandma's umbrella 我奶奶的雨伞。", formula: "Sam's book / grandma's umbrella", mistakes: ["写成 the book of Sam 生硬。"], tips: "人所有用 's 最自然。" },
    { name: "物主代词 my / your / his / her", desc: "掌握形容词性物主代词。", d: 3, core: "my 我的、your 你的、his 他的、her 她的，后面都要接名词。", formula: "This is my book. / This is his pen.", mistakes: ["物主代词后不接名词。"], tips: "物主代词 + 名词，缺一不可。" },
  ], [
    ch("名词所有格 's", 3, "「这是萨姆的书。」的英文是（　）", ["This is Sam's book.", "This is Sam book.", "This is Sams' book.", "This is book Sam."], "This is Sam's book.", "人名 + 's。"),
    ch("物主代词 my / your / his / her", 3, "「这是我的书。」的英文是（　）", ["This is my book.", "This is I book.", "This is me book.", "This is mine book."], "This is my book.", "形容词性物主代词 + 名词。"),
    ch("名词所有格 's", 3, "「我奶奶的雨伞」的英文是（　）", ["my grandma's umbrella", "my grandma umbrella", "my grandmas' umbrella", "my grandma's umbrellas"], "my grandma's umbrella", "奶奶 + 's。"),
    tf("名词所有格 's", 3, "Sam's 表示「萨姆的」。", "对", "'s 表所属。"),
  ], [
    ch("物主代词 my / your / his / her", 3, "「他的书包」的英文是（　）", ["his bag", "he bag", "him bag", "her bag"], "his bag", "his = 他的。"),
    tf("名词所有格 's", 4, "Lingling's toys 的意思是「玲玲的玩具」。", "对", "'s 表所属。"),
    ch("物主代词 my / your / his / her", 4, "「她的钢笔」的英文是（　）", ["her pen", "she pen", "hers pen", "his pen"], "her pen", "her = 她的。"),
    ch("名词所有格 's", 4, "— Is this your grandma's umbrella? — ___", ["Yes, it is.", "Yes, it's.", "Yes, she is.", "No, it is."], "Yes, it is.", "简答不缩写。"),
  ]),
  unit(9, "Module 9 I'm going to do the long jump 打算与志向", [
    { name: "be going to 表将来", desc: "掌握 be going to 结构。", d: 3, core: "be going to + 动词原形，表示打算/将要做的事。主语决定 be：I am going to… / He is going to…", formula: "I'm going to do the long jump.", mistakes: ["going to 后接三单或过去式。"], tips: "to 后面永远用原形。" },
    { name: "运动与职业词汇", desc: "掌握 long jump / high jump / race / driver。", d: 3, core: "long jump 跳远、high jump 跳高、race 赛跑、driver 司机、sports day 运动会。", formula: "do the long jump 参加跳远", mistakes: ["long jump 漏掉 the。"], tips: "do the long jump 要加 the。" },
  ], [
    ch("be going to 表将来", 3, "「我打算参加跳远。」的英文是（　）", ["I'm going to do the long jump.", "I going to do the long jump.", "I'm going to does the long jump.", "I'm go to do the long jump."], "I'm going to do the long jump.", "be going to + 原形。"),
    ch("be going to 表将来", 3, "be going to 中的 to 后面接（　）", ["动词原形", "动词三单", "动词过去式", "动词 -ing"], "动词原形", "to 后接原形。"),
    ch("运动与职业词汇", 3, "「赛跑」的英文是（　）", ["race", "rice", "raise", "rase"], "race", "race = 赛跑。"),
    tf("be going to 表将来", 3, "be going to 表示「打算、将要」。", "对", "表将来计划。"),
  ], [
    ch("运动与职业词汇", 3, "「跳高」的英文是（　）", ["high jump", "tall jump", "high jumps", "jump high"], "high jump", "high jump 跳高。"),
    ch("be going to 表将来", 4, "「我打算成为一名司机。」的英文是（　）", ["I'm going to be a driver.", "I going to be a driver.", "I'm going to a driver.", "I'm go to be a driver."], "I'm going to be a driver.", "be going to be 将成为。"),
    tf("be going to 表将来", 4, "He is going to visit his uncle. 表示他打算去看叔叔。", "对", "表打算。"),
    ch("运动与职业词汇", 4, "「运动会」的英文是（　）", ["sports day", "sport day", "sports days", "sport's day"], "sports day", "固定表达。"),
  ]),
  unit(10, "Module 10 Are you going to Hong Kong? 旅行计划", [
    { name: "be going to 疑问句", desc: "掌握 be going to 的一般疑问句。", d: 3, core: "把 be 提到句首：Are you going to…? 答 Yes, I am. / No, I'm not.", formula: "Are you going to Hong Kong? — Yes, I am.", mistakes: ["Do you going to…（×）"], tips: "有 be 就不再用 do。" },
    { name: "旅行词汇 travel / see / visit", desc: "掌握旅行相关词汇。", d: 3, core: "travel 旅行、see 看、visit 参观；What are you going to see? 你打算去看什么？", formula: "What are you going to see?", mistakes: ["going to see 写成 going see。"], tips: "to 不能丢。" },
  ], [
    ch("be going to 疑问句", 3, "「你要去香港吗？」的英文是（　）", ["Are you going to Hong Kong?", "Do you going to Hong Kong?", "You are going to Hong Kong?", "Are you go to Hong Kong?"], "Are you going to Hong Kong?", "be 提前。"),
    ch("be going to 疑问句", 3, "肯定回答 Are you going to…?，应说（　）", ["Yes, I am.", "Yes, I do.", "Yes, you are.", "Yes, I'm."], "Yes, I am.", "be 问 be 答。"),
    ch("旅行词汇 travel / see / visit", 3, "「旅行」的英文是（　）", ["travel", "travell", "traval", "traveling"], "travel", "travel = 旅行。"),
    tf("be going to 疑问句", 3, "be going to 变疑问句时把 be 动词提到句首。", "对", "be 前置。"),
  ], [
    ch("旅行词汇 travel / see / visit", 3, "「香港」的英文是（　）", ["Hong Kong", "Hongkong", "Hong Kongg", "Hong-Kong"], "Hong Kong", "分两词，都大写。"),
    ch("be going to 疑问句", 4, "「你打算去看什么？」的英文是（　）", ["What are you going to see?", "What you are going to see?", "What are you going to saw?", "What do you going to see?"], "What are you going to see?", "特殊疑问词 + be + 主语 + going to。"),
    tf("旅行词汇 travel / see / visit", 4, "visit 的意思是「参观、拜访」。", "对", "visit = 参观。"),
    ch("be going to 疑问句", 4, "— Are you going to see the Great Wall? — ___", ["Yes, I am.", "Yes, I do.", "Yes, you are.", "Yes, we am."], "Yes, I am.", "主语 I 配 am。"),
  ]),
]);
// ════════════════════════════════════════════════════════════════════
// 二、初中英语（默认版本 = 人教版；此处为非默认版本）
// ════════════════════════════════════════════════════════════════════

// —— 沪教版（2024 沪教牛津版）英语七年级上册：Module 1-4 / Unit 1-8 ——
writeBook(E, "沪教版 · 英语七年级上册", "七年级上册", [
  unit(1, "Module 1 My life — Making friends 交朋友", [
    { name: "交朋友表达", desc: "掌握交朋友相关句型。", d: 3, core: "make friends 交朋友、be friendly to… 对……友好。见面问候 Nice to meet you. 回答 Nice to meet you, too.", formula: "make friends / be friendly to others", mistakes: ["friend 与 friendly 混用。"], tips: "friend 是名词，friendly 是形容词。" },
    { name: "自我介绍与来源", desc: "会介绍姓名、年龄与来自哪里。", d: 3, core: "I'm from China. 我来自中国；Where are you from? 你来自哪里？", formula: "Where are you from? — I'm from China.", mistakes: ["from 后面接错。"], tips: "be from = 来自。" },
  ], [
    ch("交朋友表达", 3, "「交朋友」的英文是（　）", ["make friends", "do friends", "make friend", "have friends"], "make friends", "交朋友用 make friends。"),
    ch("自我介绍与来源", 3, "— Nice to meet you. — ___", ["Nice to meet you, too.", "How are you?", "I'm fine.", "Goodbye."], "Nice to meet you, too.", "回应加 too。"),
    ch("自我介绍与来源", 3, "「我来自中国。」的英文是（　）", ["I'm from China.", "I come China.", "I'm in China.", "I from China."], "I'm from China.", "be from 来自。"),
    tf("交朋友表达", 3, "friendly 的意思是「友好的」。", "对", "friendly 形容词。"),
  ], [
    ch("交朋友表达", 3, "想认识新同学，应主动说（　）", ["Hello! I'm Li Ming. Nice to meet you.", "How old are you?", "Where do you live?", "What's your name?"], "Hello! I'm Li Ming. Nice to meet you.", "主动问候并自我介绍。"),
    ch("自我介绍与来源", 4, "「你来自哪里？」的英文是（　）", ["Where are you from?", "Where do you come?", "Where are you?", "What are you from?"], "Where are you from?", "be from 疑问式。"),
    tf("交朋友表达", 4, "be friendly to others 表示「对他人友好」。", "对", "友好相处。"),
    ch("自我介绍与来源", 4, "「我们是好朋友。」的英文是（　）", ["We are good friends.", "We are good friend.", "We is good friends.", "We are goods friends."], "We are good friends.", "复数用 are + friends。"),
  ]),
  unit(2, "Module 1 My life — Daily life 日常生活", [
    { name: "日常动词短语", desc: "掌握 get up / have breakfast / go to school。", d: 3, core: "get up 起床、have breakfast 吃早饭、go to school 去上学、do homework 做作业、go to bed 上床睡觉。", formula: "I get up at six every day.", mistakes: ["have breakfast 说成 eat breakfast 虽对但教材用 have。"], tips: "三餐动词用 have。" },
    { name: "一般现在时第三人称单数", desc: "掌握三单形式。", d: 3, core: "主语是 he/she/it 时动词加 -s/-es：go→goes、watch→watches、have→has。", formula: "He goes to school by bus.", mistakes: ["三单忘记变化。"], tips: "看主语是不是他/她/它。" },
  ], [
    ch("日常动词短语", 3, "「我每天六点起床。」的英文是（　）", ["I get up at six.", "I gets up at six.", "I get up in six.", "I getting up at six."], "I get up at six.", "第一人称用原形。"),
    ch("一般现在时第三人称单数", 3, "He ___ to school by bus every day.", ["goes", "go", "going", "went"], "goes", "三单加 -es。"),
    ch("日常动词短语", 3, "「上床睡觉」的英文是（　）", ["go to bed", "go to school", "get up", "go home"], "go to bed", "go to bed 睡觉。"),
    tf("日常动词短语", 3, "have breakfast 的意思是「吃早饭」。", "对", "三餐用 have。"),
  ], [
    ch("一般现在时第三人称单数", 3, "She ___ TV in the evening.", ["watches", "watch", "watchs", "watching"], "watches", "ch 结尾加 -es。"),
    ch("一般现在时第三人称单数", 4, "My mother ___ breakfast every morning.", ["has", "have", "haves", "having"], "has", "have 的三单是 has。"),
    tf("一般现在时第三人称单数", 3, "every day 常与一般现在时连用。", "对", "表习惯。"),
    ch("日常动词短语", 4, "「做作业」的英文是（　）", ["do homework", "make homework", "do homeworks", "does homework"], "do homework", "固定搭配。"),
  ]),
  unit(3, "Module 2 The natural world — The earth 我们的地球", [
    { name: "环保词汇 protect / pollute / recycle", desc: "掌握环保核心词汇。", d: 3, core: "protect 保护、pollute 污染、recycle 回收利用、environment 环境。", formula: "protect the earth / protect the environment", mistakes: ["protect 与 prevent 混淆。"], tips: "protect 保护，prevent 阻止。" },
    { name: "情态动词 should / must", desc: "掌握 should 与 must。", d: 3, core: "should 应该（建议）、must 必须（强制）；否定 shouldn't 不应该。后接动词原形。", formula: "We should protect the environment.", mistakes: ["should 后接 to do。"], tips: "情态动词后接原形。" },
  ], [
    ch("环保词汇 protect / pollute / recycle", 3, "「保护地球」的英文是（　）", ["protect the earth", "protect earth", "pollute the earth", "recycle the earth"], "protect the earth", "protect 保护。"),
    ch("环保词汇 protect / pollute / recycle", 3, "「污染」的英文是（　）", ["pollute", "pollutionn", "polute", "polluter"], "pollute", "pollute 污染。"),
    ch("情态动词 should / must", 3, "「我们应该保护环境。」的英文是（　）", ["We should protect the environment.", "We should protects the environment.", "We should to protect the environment.", "We should protecting the environment."], "We should protect the environment.", "should + 原形。"),
    tf("环保词汇 protect / pollute / recycle", 3, "recycle 的意思是「回收利用」。", "对", "recycle 回收。"),
  ], [
    ch("环保词汇 protect / pollute / recycle", 3, "「环境」的英文是（　）", ["environment", "envirnment", "environmant", "enviroment"], "environment", "environment 环境。"),
    ch("情态动词 should / must", 4, "「我们不应该污染环境。」的英文是（　）", ["We shouldn't pollute the environment.", "We shouldn't pollutes the environment.", "We shouldn't to pollute the environment.", "We don't should pollute the environment."], "We shouldn't pollute the environment.", "shouldn't + 原形。"),
    tf("情态动词 should / must", 3, "should 表示「应该」。", "对", "表建议。"),
    ch("环保词汇 protect / pollute / recycle", 4, "为了环保，饮料瓶可以（　）", ["recycle", "pollute", "waste", "litter"], "recycle", "回收利用。"),
  ]),
  unit(4, "Module 2 The natural world — Seasons 季节", [
    { name: "季节与天气词汇", desc: "掌握四季与天气。", d: 3, core: "spring 春、summer 夏、autumn 秋、winter 冬；sunny 晴、rainy 雨、snowy 雪、windy 风、cloudy 多云。", formula: "It's hot in summer. / It's cold in winter.", mistakes: ["季节前用 in 却写成 on。"], tips: "季节前用 in。" },
    { name: "描述天气句型", desc: "会用 It's… 描述天气。", d: 3, core: "描述天气用 It's + 形容词：It's sunny today. 询问 What's the weather like today?", formula: "What's the weather like? — It's sunny.", mistakes: ["回答用 I am sunny。（×）"], tips: "天气用 it 不用 I。" },
  ], [
    ch("季节与天气词汇", 3, "「春天」的英文是（　）", ["spring", "summer", "autumn", "winter"], "spring", "spring 春。"),
    ch("季节与天气词汇", 3, "「晴天」的英文是（　）", ["sunny", "rainy", "snowy", "windy"], "sunny", "sunny 晴朗的。"),
    ch("描述天气句型", 3, "「夏天很热。」的英文是（　）", ["It's hot in summer.", "I'm hot in summer.", "It hot in summer.", "It's hot on summer."], "It's hot in summer.", "季节前用 in。"),
    tf("季节与天气词汇", 3, "winter 的意思是「冬天」。", "对", "winter 冬。"),
  ], [
    ch("季节与天气词汇", 4, "「多风的」的英文是（　）", ["windy", "rainy", "cloudy", "sunny"], "windy", "windy 有风的。"),
    ch("描述天气句型", 3, "询问今天天气，应问（　）", ["What's the weather like today?", "How is the weather be?", "What is the weather?", "How are you today?"], "What's the weather like today?", "固定句型。"),
    tf("季节与天气词汇", 4, "一年有四个季节。", "对", "春夏秋冬。"),
    ch("描述天气句型", 4, "「冬天下雪。」的英文是（　）", ["It snows in winter.", "It's snow in winter.", "It snow in winter.", "It's snowing in winter."], "It snows in winter.", "客观事实用一般现在时。"),
  ]),
  unit(5, "Module 3 Travels — Visiting the moon 探月", [
    { name: "太空词汇 moon / space / rocket / astronaut", desc: "掌握太空探索词汇。", d: 3, core: "moon 月亮、space 太空、rocket 火箭、astronaut 宇航员、spaceship 宇宙飞船。", formula: "land on the moon 登上月球", mistakes: ["spacecraft 与 spaceship 混淆。"], tips: "spaceship 更常用。" },
    { name: "there be 与将来计划", desc: "会用 there be 描述存在。", d: 3, core: "there be 表示「有」：There is…（单数）/ There are…（复数）；计划用 be going to。", formula: "There is no air on the moon.", mistakes: ["There is 后接复数名词。"], tips: "就近原则。" },
  ], [
    ch("太空词汇 moon / space / rocket / astronaut", 3, "「宇航员」的英文是（　）", ["astronaut", "astronout", "astronaunt", "astranaut"], "astronaut", "astronaut 宇航员。"),
    ch("太空词汇 moon / space / rocket / astronaut", 3, "「火箭」的英文是（　）", ["rocket", "rockket", "roket", "rockets"], "rocket", "rocket 火箭。"),
    ch("there be 与将来计划", 3, "「太空」的英文是（　）", ["space", "spaces", "spase", "spaace"], "space", "space 太空。"),
    tf("太空词汇 moon / space / rocket / astronaut", 3, "moon 的意思是「月亮」。", "对", "moon 月亮。"),
  ], [
    ch("太空词汇 moon / space / rocket / astronaut", 4, "「宇宙飞船」的英文是（　）", ["spaceship", "spaceshep", "space ship", "spaceshipp"], "spaceship", "spaceship 宇宙飞船。"),
    ch("there be 与将来计划", 3, "There ___ some water on the moon.", ["is", "are", "be", "am"], "is", "water 不可数用 is。"),
    tf("there be 与将来计划", 4, "人类已经登上过月球。", "对", "1969 年阿波罗登月。"),
    ch("太空词汇 moon / space / rocket / astronaut", 4, "「登上月球」的英文是（　）", ["land on the moon", "land in the moon", "land the moon", "land on moon"], "land on the moon", "on the moon。"),
  ]),
  unit(6, "Module 3 Travels — Travelling around Asia 环亚旅行", [
    { name: "旅行词汇 travel / ticket / hotel / visit", desc: "掌握旅行相关词汇。", d: 3, core: "travel 旅行、ticket 票、hotel 酒店、visit 参观、trip 短途旅行。", formula: "book tickets 订票 / visit the Great Wall 参观长城", mistakes: ["travel 与 trip 混用。"], tips: "travel 泛指旅行，trip 指具体一趟。" },
    { name: "一般将来时 be going to", desc: "掌握 be going to 表计划。", d: 3, core: "be going to + 原形表示计划做某事；疑问句把 be 提前。", formula: "I'm going to Beijing next week.", mistakes: ["going to 后接过去式。"], tips: "to 后接原形。" },
  ], [
    ch("旅行词汇 travel / ticket / hotel / visit", 3, "「我打算去北京。」的英文是（　）", ["I'm going to Beijing.", "I going to Beijing.", "I'm go to Beijing.", "I'm going to go to Beijing."], "I'm going to Beijing.", "be going to + 地点。"),
    ch("旅行词汇 travel / ticket / hotel / visit", 3, "「酒店」的英文是（　）", ["hotel", "hostel", "hotell", "hotals"], "hotel", "hotel 酒店。"),
    ch("旅行词汇 travel / ticket / hotel / visit", 3, "「订票」的英文是（　）", ["book tickets", "buy ticket", "book ticket", "take tickets"], "book tickets", "book 预订。"),
    tf("一般将来时 be going to", 3, "be going to 表示将来的计划。", "对", "表计划。"),
  ], [
    ch("旅行词汇 travel / ticket / hotel / visit", 3, "「火车票」的英文是（　）", ["train ticket", "train tickets", "train's ticket", "ticket train"], "train ticket", "名词修饰名词。"),
    ch("旅行词汇 travel / ticket / hotel / visit", 4, "「参观长城」的英文是（　）", ["visit the Great Wall", "visit Great Wall", "look the Great Wall", "visit a Great Wall"], "visit the Great Wall", "the Great Wall。"),
    tf("旅行词汇 travel / ticket / hotel / visit", 3, "travel 的意思是「旅行」。", "对", "travel 旅行。"),
    ch("一般将来时 be going to", 4, "「你打算去哪里度假？」的英文是（　）", ["Where are you going for the holiday?", "Where you are going for the holiday?", "Where are you go for the holiday?", "Where do you going for the holiday?"], "Where are you going for the holiday?", "特殊疑问句 be 提前。"),
  ]),
  unit(7, "Module 4 Fun time — School clubs 学校社团", [
    { name: "社团词汇 club / join / art / music", desc: "掌握社团相关词汇。", d: 3, core: "club 社团、join 加入、art club 美术社、music club 音乐社、basketball club 篮球社。", formula: "join the music club 加入音乐社", mistakes: ["join 与 join in 混淆。"], tips: "加入组织用 join。" },
    { name: "would like to 表达意愿", desc: "掌握 would like 的用法。", d: 3, core: "would like to + 原形表示「想要」；缩写 I'd like to…", formula: "I'd like to join the art club.", mistakes: ["would like 后接三单。"], tips: "to 后接原形。" },
  ], [
    ch("社团词汇 club / join / art / music", 3, "「加入」的英文是（　）", ["join", "join in", "take part", "attend"], "join", "加入组织用 join。"),
    ch("社团词汇 club / join / art / music", 3, "「美术社」的英文是（　）", ["art club", "art clubs", "arts club", "art's club"], "art club", "art club。"),
    ch("would like to 表达意愿", 3, "「我想加入音乐社。」的英文是（　）", ["I'd like to join the music club.", "I'd like join the music club.", "I'd like to joining the music club.", "I like to join the music club."], "I'd like to join the music club.", "would like to + 原形。"),
    tf("社团词汇 club / join / art / music", 3, "club 的意思是「社团、俱乐部」。", "对", "club 社团。"),
  ], [
    ch("社团词汇 club / join / art / music", 4, "「篮球社」的英文是（　）", ["basketball club", "basketball clubs", "basket ball club", "basketball's club"], "basketball club", "合写 basketball。"),
    ch("would like to 表达意愿", 4, "「你想加入什么社团？」的英文是（　）", ["What club would you like to join?", "What club you would like to join?", "What club would you like joining?", "What club do you like join?"], "What club would you like to join?", "would like to + 原形。"),
    tf("would like to 表达意愿", 3, "would like 表示「想要」。", "对", "表意愿。"),
    ch("社团词汇 club / join / art / music", 4, "社团活动一般在（　）进行", ["after school", "in the morning", "at night", "in bed"], "after school", "课后活动。"),
  ]),
  unit(8, "Module 4 Fun time — Collecting things 收藏", [
    { name: "收藏词汇 collect / stamp / coin", desc: "掌握收藏相关词汇。", d: 3, core: "collect 收集、stamp 邮票、coin 硬币、collection 收藏品。", formula: "collect stamps 集邮", mistakes: ["collect 写成 colect。"], tips: "双写 l？不，collect 一个 l，注意拼写 c-o-l-l-e-c-t。" },
    { name: "爱好表达 hobby", desc: "会谈论个人爱好。", d: 3, core: "hobby 爱好；My hobby is collecting stamps. 询问 What's your hobby?", formula: "What's your hobby? — My hobby is reading.", mistakes: ["hobby 复数变 y 为 i 加 -es。"], tips: "hobby → hobbies。" },
  ], [
    ch("收藏词汇 collect / stamp / coin", 3, "「集邮」的英文是（　）", ["collect stamps", "collect stamp", "collecting stamps", "collects stamps"], "collect stamps", "collect + 复数。"),
    ch("收藏词汇 collect / stamp / coin", 3, "「硬币」的英文是（　）", ["coin", "coins", "coint", "coyn"], "coin", "coin 硬币。"),
    ch("收藏词汇 collect / stamp / coin", 3, "「邮票」的英文是（　）", ["stamp", "stamps", "stampe", "stemp"], "stamp", "stamp 邮票。"),
    tf("收藏词汇 collect / stamp / coin", 3, "collect 的意思是「收集」。", "对", "collect 收集。"),
  ], [
    ch("收藏词汇 collect / stamp / coin", 4, "「我的收藏」的英文是（　）", ["my collection", "my collect", "my collections", "my collecting"], "my collection", "collection 名词。"),
    ch("爱好表达 hobby", 3, "「爱好」的英文是（　）", ["hobby", "hobbys", "habby", "hobbie"], "hobby", "hobby 爱好。"),
    tf("爱好表达 hobby", 4, "hobby 的复数是 hobbies。", "对", "变 y 为 i 加 -es。"),
    ch("爱好表达 hobby", 4, "「你收藏什么？」的英文是（　）", ["What do you collect?", "What are you collect?", "What do you collecting?", "What you collect?"], "What do you collect?", "实义动词用 do 提问。"),
  ]),
]);

// —— 外研版 英语七年级上册：Module 1-10 ——
writeBook(E, "外研版 · 英语七年级上册", "七年级上册", [
  unit(1, "Module 1 My classmates 我的同学", [
    { name: "be 动词 am / is / are", desc: "掌握 be 动词的变化。", d: 3, core: "I 用 am，he/she/it 用 is，you/we/they 用 are。缩写 I'm / he's / they're。", formula: "I am… / He is… / They are…", mistakes: ["I 搭配 is/are。"], tips: "I 配 am 永远不变。" },
    { name: "介绍姓名与年龄", desc: "会介绍自己与同学。", d: 3, core: "介绍姓名 I'm… / My name is…；年龄 I'm thirteen (years old)。", formula: "I'm Wang Lingling and I'm thirteen years old.", mistakes: ["thirteen 拼写错误。"], tips: "thirteen 不是 threeteen。" },
  ], [
    ch("be 动词 am / is / are", 3, "I ___ Wang Lingling.", ["am", "is", "are", "be"], "am", "I 配 am。"),
    ch("be 动词 am / is / are", 3, "He ___ thirteen.", ["is", "am", "are", "be"], "is", "三单用 is。"),
    ch("介绍姓名与年龄", 3, "「你叫什么名字？」的英文是（　）", ["What's your name?", "How are you?", "What are you name?", "Who are you?"], "What's your name?", "问姓名。"),
    tf("be 动词 am / is / are", 3, "be 动词的人称形式会变化。", "对", "am/is/are。"),
  ], [
    ch("be 动词 am / is / are", 3, "They ___ my classmates.", ["are", "is", "am", "be"], "are", "复数用 are。"),
    ch("介绍姓名与年龄", 3, "「我十三岁。」的英文是（　）", ["I'm thirteen.", "I'm threeteen.", "I thirteen.", "I have thirteen."], "I'm thirteen.", "thirteen = 13。"),
    tf("be 动词 am / is / are", 3, "am 只能与 I 连用。", "对", "I am。"),
    ch("介绍姓名与年龄", 4, "「很高兴见到你。」的英文是（　）", ["Nice to meet you.", "Nice meet you.", "Nice to meet your.", "Nice meeting you too."], "Nice to meet you.", "固定表达。"),
  ]),
  unit(2, "Module 2 My family 我的家庭", [
    { name: "指示代词 this / these", desc: "掌握近指代词。", d: 3, core: "this 这个（单数近指）、these 这些（复数近指）；that/those 表远指。", formula: "This is my mother. / These are my parents.", mistakes: ["this 后接复数。"], tips: "单近 this，复近 these。" },
    { name: "家庭称谓 parents / family", desc: "掌握家庭相关词。", d: 3, core: "parents 父母（两人）、family 家庭；there are…people in my family。", formula: "There are three people in my family.", mistakes: ["parents 当单数。"], tips: "parents 本身是复数。" },
  ], [
    ch("指示代词 this / these", 3, "「这是我妈妈。」的英文是（　）", ["This is my mother.", "These is my mother.", "This are my mother.", "This my mother."], "This is my mother.", "单数用 this is。"),
    ch("指示代词 this / these", 3, "指近处的多个物体，用（　）", ["these", "this", "that", "those"], "these", "复近 these。"),
    ch("家庭称谓 parents / family", 3, "「我的父母」的英文是（　）", ["my parents", "my parent", "my parentes", "my parenting"], "my parents", "parents 复数。"),
    tf("指示代词 this / these", 3, "this 指近处的单个事物。", "对", "单近 this。"),
  ], [
    ch("家庭称谓 parents / family", 3, "「我家有三口人。」的英文是（　）", ["There are three people in my family.", "There is three people in my family.", "There are three people in my familyy.", "It has three people in my family."], "There are three people in my family.", "复数用 there are。"),
    ch("指示代词 this / these", 4, "「那些」的英文是（　）", ["those", "these", "this", "that"], "those", "复远 those。"),
    tf("家庭称谓 parents / family", 4, "family 的意思是「家庭」。", "对", "family 家庭。"),
    ch("指示代词 this / these", 4, "介绍多个家人应说（　）", ["These are my parents.", "This is my parents.", "These is my parent.", "This are my parents."], "These are my parents.", "复数 these are。"),
  ]),
  unit(3, "Module 3 My school 我的学校", [
    { name: "there be 句型", desc: "掌握 there be 表存在。", d: 3, core: "there is + 单数/不可数，there are + 复数；否定 there isn't / aren't。", formula: "There are thirty students in our class.", mistakes: ["there is 后接复数名词。"], tips: "看后面的名词定单复数。" },
    { name: "方位介词 next to / behind / on the left of", desc: "掌握地点方位表达。", d: 3, core: "next to 在……旁边、behind 在……后面、on the left of 在……左边、in front of 在……前面。", formula: "The library is on the left of the playground.", mistakes: ["on the left 漏掉 of。"], tips: "left/right 后接 of 再接对象。" },
  ], [
    ch("there be 句型", 3, "「我们班有 30 名学生。」的英文是（　）", ["There are thirty students in our class.", "There is thirty students in our class.", "There are thirty student in our class.", "There have thirty students in our class."], "There are thirty students in our class.", "复数用 there are。"),
    ch("方位介词 next to / behind / on the left of", 3, "「图书馆在操场左边。」的英文是（　）", ["The library is on the left of the playground.", "The library is in the left of the playground.", "The library is on the left playground.", "The library is at the left of playground."], "The library is on the left of the playground.", "on the left of。"),
    ch("方位介词 next to / behind / on the left of", 3, "「在……旁边」的英文是（　）", ["next to", "next in", "near to", "close in"], "next to", "next to 紧挨。"),
    tf("there be 句型", 3, "there be 句型表示「某处有某物」。", "对", "表存在。"),
  ], [
    ch("there be 句型", 3, "There ___ a book on the desk.", ["is", "are", "be", "am"], "is", "单数用 is。"),
    ch("方位介词 next to / behind / on the left of", 4, "「在……后面」的英文是（　）", ["behind", "before", "below", "besides"], "behind", "behind 后面。"),
    tf("there be 句型", 4, "there be 遵循就近原则。", "对", "最近名词定单复。"),
    ch("方位介词 next to / behind / on the left of", 4, "「在……前面」的英文是（　）", ["in front of", "in the front", "front of", "before of"], "in front of", "in front of 外部前方。"),
  ]),
  unit(4, "Module 4 Healthy food 健康饮食", [
    { name: "have got 表示拥有", desc: "掌握 have got 的用法。", d: 3, core: "have got = have，表示「有」。第三人称用 has got：He's got… / She's got…；否定 haven't got。", formula: "We've got lots of apples.", mistakes: ["第三人称误用 have got。"], tips: "he/she 配 has got。" },
    { name: "some / any 的用法", desc: "掌握 some 与 any。", d: 3, core: "some 多用于肯定句，any 多用于否定句与疑问句；修饰可数/不可数均可。", formula: "We've got lots of apples. / Have you got any milk?", mistakes: ["疑问句中用 some。"], tips: "疑问否定优先 any。" },
  ], [
    ch("have got 表示拥有", 3, "「我们有很多苹果。」的英文是（　）", ["We've got lots of apples.", "We've get lots of apples.", "We has got lots of apples.", "We've got lot of apples."], "We've got lots of apples.", "lots of 许多。"),
    ch("some / any 的用法", 3, "否定句和疑问句中常用（　）", ["any", "some", "many", "much"], "any", "疑问否定用 any。"),
    ch("食物与健康词汇", 3, "「健康的」的英文是（　）", ["healthy", "health", "healthyy", "healty"], "healthy", "healthy 形容词。"),
    tf("have got 表示拥有", 3, "have got 与 have 意思相同。", "对", "= have。"),
  ], [
    ch("some / any 的用法", 4, "— Has she got ___ pen? — Yes, she has.", ["a", "any", "some", "the"], "a", "疑问表单数用 a。"),
    ch("食物与健康词汇", 4, "「不健康食品」的英文是（　）", ["unhealthy food", "healthy food", "health food", "unhealth food"], "unhealthy food", "un- 表否定。"),
    tf("some / any 的用法", 3, "some 常用于肯定句。", "对", "肯定用 some。"),
    ch("have got 表示拥有", 4, "— Have you got any milk? — ___", ["Yes, we have.", "Yes, we've.", "Yes, we are.", "No, we haven't got."], "Yes, we have.", "have 问 have 答。"),
  ]),
  unit(5, "Module 5 My school day 我的学校生活", [
    { name: "一般现在时表习惯", desc: "掌握一般现在时用法。", d: 3, core: "表示经常性、习惯性动作用一般现在时，常与 always/usually/often/sometimes/never 连用。", formula: "We start work at nine o'clock.", mistakes: ["三单主语动词不变。"], tips: "he/she/it 动词加 -s/-es。" },
    { name: "学校科目与时间", desc: "掌握科目与星期表达。", d: 3, core: "maths 数学、history 历史、science 科学；Wednesday 星期三。", formula: "I love history. / on Wednesday", mistakes: ["星期首字母不大写。"], tips: "星期一律大写。" },
  ], [
    ch("一般现在时表习惯", 3, "「我喜欢历史。」的英文是（　）", ["I love history.", "I loves history.", "I loving history.", "I loved history."], "I love history.", "第一人称原形。"),
    ch("一般现在时表习惯", 3, "「我们九点开始上课。」的英文是（　）", ["We start work at nine o'clock.", "We starts work at nine o'clock.", "We starting work at nine o'clock.", "We start work in nine o'clock."], "We start work at nine o'clock.", "时刻前用 at。"),
    ch("学校科目与时间", 3, "「星期三」的英文是（　）", ["Wednesday", "Wendsday", "wednesday", "Wenesday"], "Wednesday", "W-e-d 开头。"),
    tf("一般现在时表习惯", 3, "usually 常与一般现在时连用。", "对", "表频率。"),
  ], [
    ch("一般现在时表习惯", 4, "He ___ English very much.", ["likes", "like", "liking", "is like"], "likes", "三单加 -s。"),
    ch("学校科目与时间", 4, "「数学」的英文是（　）", ["maths", "mathes", "math", "math's"], "maths", "英式 maths。"),
    tf("一般现在时表习惯", 4, "一般现在时可表示习惯性动作。", "对", "表习惯。"),
    ch("一般现在时表习惯", 4, "「他从不迟到。」的英文是（　）", ["He is never late.", "He never is late.", "He never late.", "He is ever late."], "He is never late.", "never 放 be 后。"),
  ]),
  unit(6, "Module 6 A trip to the zoo 动物园之旅", [
    { name: "一般现在时三单疑问句", desc: "掌握 Does…? 疑问句。", d: 3, core: "三单疑问句用 Does 开头，动词回原形；答语 Yes, it does. / No, it doesn't.", formula: "Does it eat meat? — Yes, it does.", mistakes: ["Does 后动词仍用三单。"], tips: "does 后永远原形。" },
    { name: "动物与产地", desc: "掌握动物词汇及产地表达。", d: 3, core: "elephant 大象、tiger 老虎、panda 熊猫、monkey 猴子；come from / live in 表产地。", formula: "The tiger lives in Asia. / Pandas come from China.", mistakes: ["live in 写成 live on。"], tips: "住在大地方用 in。" },
  ], [
    ch("一般现在时三单疑问句", 3, "— ___ it eat meat? — Yes, it does.", ["Does", "Do", "Is", "Has"], "Does", "三单用 does。"),
    ch("动物与产地", 3, "「老虎生活在亚洲。」的英文是（　）", ["The tiger lives in Asia.", "The tiger live in Asia.", "The tiger lives in Asiaa.", "The tiger is live in Asia."], "The tiger lives in Asia.", "三单加 -s。"),
    ch("一般现在时三单疑问句", 3, "does 后面动词用（　）", ["原形", "三单", "过去式", "-ing"], "原形", "does 后原形。"),
    tf("一般现在时三单疑问句", 3, "does 用于第三人称单数。", "对", "he/she/it。"),
  ], [
    ch("动物与产地", 4, "「熊猫来自中国。」的英文是（　）", ["Pandas come from China.", "Pandas comes from China.", "Pandas come from Chinaa.", "Panda come from China."], "Pandas come from China.", "复数用原形。"),
    ch("动物与产地", 4, "「大象」的英文是（　）", ["elephant", "elephent", "elefant", "elephants"], "elephant", "elephant 大象。"),
    tf("一般现在时三单疑问句", 4, "Does he like music? 是正确的一般疑问句。", "对", "does 提前。"),
    ch("动物与产地", 4, "「猴子」的英文是（　）", ["monkey", "monky", "monkeyy", "donkey"], "monkey", "monkey 猴子。"),
  ]),
  unit(7, "Module 7 Computers 电脑", [
    { name: "电脑词汇 computer / keyboard / mouse / screen", desc: "掌握电脑部件词汇。", d: 3, core: "computer 电脑、keyboard 键盘、mouse 鼠标、screen 屏幕、printer 打印机。", formula: "on the computer 在电脑上", mistakes: ["keyboard 写成 keybord。"], tips: "keyboard 结尾 -oard。" },
    { name: "指令表达 Turn on / Save", desc: "掌握常用操作指令。", d: 3, core: "Turn on the computer. 打开电脑。Save the file. 保存文件。Click the mouse. 点击鼠标。", formula: "Turn on / Turn off / Save", mistakes: ["指令动词用 -ing 开头。"], tips: "指令用动词原形开头。" },
  ], [
    ch("电脑词汇 computer / keyboard / mouse / screen", 3, "「键盘」的英文是（　）", ["keyboard", "keybord", "key bord", "keyboardd"], "keyboard", "keyboard 键盘。"),
    ch("电脑词汇 computer / keyboard / mouse / screen", 3, "「鼠标」的英文是（　）", ["mouse", "mice", "mous", "mousse"], "mouse", "mouse 鼠标。"),
    ch("指令表达 Turn on / Save", 3, "「打开电脑。」的英文是（　）", ["Turn on the computer.", "Turning on the computer.", "Turn on computer.", "Open the computer."], "Turn on the computer.", "turn on 打开电器。"),
    tf("电脑词汇 computer / keyboard / mouse / screen", 3, "screen 的意思是「屏幕」。", "对", "screen 屏幕。"),
  ], [
    ch("指令表达 Turn on / Save", 3, "「保存文件。」的英文是（　）", ["Save the file.", "Saving the file.", "Save file.", "Keep the file."], "Save the file.", "save 保存。"),
    ch("电脑词汇 computer / keyboard / mouse / screen", 4, "「打印机」的英文是（　）", ["printer", "printter", "priter", "print"], "printer", "printer 打印机。"),
    tf("指令表达 Turn on / Save", 4, "Turn off 的意思是「关闭（电器）」。", "对", "turn off 关。"),
    ch("指令表达 Turn on / Save", 4, "在电脑上写作业，应说（　）", ["write my homework on the computer", "write my homework in the computer", "write my homework at computer", "write my homework by the computer"], "write my homework on the computer", "on the computer。"),
  ]),
  unit(8, "Module 8 Choosing presents 挑选礼物", [
    { name: "礼物词汇 present / gift / birthday", desc: "掌握礼物相关词汇。", d: 3, core: "present 礼物、gift 礼物、birthday 生日；give sb. sth. 给某人某物。", formula: "buy a present 买礼物 / Happy birthday! 生日快乐", mistakes: ["present 与 parent 混淆。"], tips: "present 有「礼物」义。" },
    { name: "购物句型 How much…?", desc: "掌握询问价格。", d: 3, core: "询问价格 How much is it? / How much are they?；想买 I want to buy… / I'd like to buy…", formula: "How much is it? — It's 20 yuan.", mistakes: ["how much 后接可数复数物品。"], tips: "问价统一 how much。" },
  ], [
    ch("礼物词汇 present / gift / birthday", 3, "「礼物」的英文是（　）", ["present", "parent", "presence", "pleasant"], "present", "present 礼物。"),
    ch("礼物词汇 present / gift / birthday", 3, "「生日」的英文是（　）", ["birthday", "birth day", "birhtday", "birthdey"], "birthday", "birthday 生日。"),
    ch("购物句型 How much…?", 3, "询问价格应问（　）", ["How much is it?", "How many is it?", "How much it is?", "What much is it?"], "How much is it?", "how much 问价。"),
    tf("礼物词汇 present / gift / birthday", 3, "give 的意思是「给」。", "对", "give 给。"),
  ], [
    ch("购物句型 How much…?", 4, "「我想买一个礼物。」的英文是（　）", ["I want to buy a present.", "I want buy a present.", "I want to buying a present.", "I want to bought a present."], "I want to buy a present.", "want to + 原形。"),
    tf("礼物词汇 present / gift / birthday", 4, "Happy birthday! 是生日祝福。", "对", "生日快乐。"),
    ch("礼物词汇 present / gift / birthday", 4, "「给朋友的礼物」的英文是（　）", ["a present for my friend", "a present to my friend", "a present of my friend", "a present with my friend"], "a present for my friend", "for 表给谁。"),
    ch("购物句型 How much…?", 4, "「它们 50 元。」的英文是（　）", ["They're 50 yuan.", "They 50 yuan.", "It's 50 yuan.", "They are 50 yuans."], "They're 50 yuan.", "复数主语 they。"),
  ]),
  unit(9, "Module 9 People and places 人与地方", [
    { name: "描述地方的形容词", desc: "掌握 big / small / beautiful / crowded。", d: 3, core: "big 大的、small 小的、beautiful 美丽的、crowded 拥挤的、quiet 安静的、modern 现代的。", formula: "Beijing is a big city.", mistakes: ["crowded 拼写错误。"], tips: "crowd + ed。" },
    { name: "描述人物", desc: "会简单描述人物外貌性格。", d: 3, core: "tall 高的、short 矮的/短的、friendly 友好的、famous 著名的、kind 善良的。", formula: "She is tall and friendly.", mistakes: ["tall 与 short 混用。"], tips: "tall 反 short。" },
  ], [
    ch("描述地方的形容词", 3, "「美丽的」的英文是（　）", ["beautiful", "beauty", "beautifull", "beatiful"], "beautiful", "beautiful 美丽。"),
    ch("描述地方的形容词", 3, "「拥挤的」的英文是（　）", ["crowded", "crowd", "crowing", "crowdedd"], "crowded", "crowded 拥挤。"),
    ch("描述人物", 3, "「友好的」的英文是（　）", ["friendly", "friend", "friends", "friendlly"], "friendly", "friendly 友好。"),
    tf("描述地方的形容词", 3, "big 的意思是「大的」。", "对", "big 大。"),
  ], [
    ch("描述地方的形容词", 4, "「现代化的」的英文是（　）", ["modern", "moden", "morden", "modernn"], "modern", "modern 现代。"),
    ch("描述人物", 4, "「著名的」的英文是（　）", ["famous", "famus", "fameus", "famouse"], "famous", "famous 著名。"),
    tf("描述地方的形容词", 4, "quiet 的意思是「安静的」。", "对", "quiet 安静。"),
    ch("描述人物", 4, "「他又高又友好。」的英文是（　）", ["He is tall and friendly.", "He is tall and friend.", "He tall and friendly.", "He is high and friendly."], "He is tall and friendly.", "形容词并列。"),
  ]),
  unit(10, "Module 10 Spring Festival 春节", [
    { name: "春节词汇", desc: "掌握春节相关词汇。", d: 3, core: "Spring Festival 春节、dumpling 饺子、red packet 红包、fireworks 烟花、lantern 灯笼。", formula: "the Spring Festival 春节", mistakes: ["Spring Festival 漏掉 the。"], tips: "传统节日前加 the。" },
    { name: "节日活动表达", desc: "会描述节日活动。", d: 3, core: "set off fireworks 放烟花、have a big dinner 吃年夜饭、visit relatives 走亲戚；be going to 表计划。", formula: "We're going to watch fireworks.", mistakes: ["set off 写成 set up。"], tips: "燃放烟花用 set off。" },
  ], [
    ch("春节词汇", 3, "「春节」的英文是（　）", ["the Spring Festival", "Spring Festival", "the Spring Festivals", "Spring festival"], "the Spring Festival", "加 the，大写。"),
    ch("春节词汇", 3, "「饺子」的英文是（　）", ["dumplings", "dumpling", "dumpings", "dumplins"], "dumplings", "常用复数。"),
    ch("节日活动表达", 3, "「放烟花」的英文是（　）", ["set off fireworks", "set up fireworks", "set off firework", "put off fireworks"], "set off fireworks", "set off 燃放。"),
    tf("春节词汇", 3, "red packet 的意思是「红包」。", "对", "red packet 红包。"),
  ], [
    ch("春节词汇", 4, "「灯笼」的英文是（　）", ["lantern", "lantarn", "lanternn", "lentern"], "lantern", "lantern 灯笼。"),
    ch("节日活动表达", 4, "「年夜饭」的英文是（　）", ["New Year's dinner", "New Year dinner", "the New Year's dinners", "New Years' dinner"], "New Year's dinner", "固定表达。"),
    tf("节日活动表达", 4, "春节是中国重要的传统节日。", "对", "传统节日。"),
    ch("节日活动表达", 4, "「我们打算看烟花。」的英文是（　）", ["We're going to watch fireworks.", "We going to watch fireworks.", "We're going to watch firework.", "We're going to watching fireworks."], "We're going to watch fireworks.", "be going to + 原形。"),
  ]),
]);

// —— 译林版（牛津译林）英语七年级上册：Unit 1-8 ——
writeBook(E, "译林版 · 英语七年级上册", "七年级上册", [
  unit(1, "Unit 1 This is me! 自我介绍", [
    { name: "be 动词与自我介绍", desc: "掌握自我介绍句型。", d: 3, core: "I'm… / My name is…；Welcome to Class 1, Grade 7! 欢迎来到七年级一班。", formula: "I'm Li Ming. I'm thirteen.", mistakes: ["Grade 7 写成 Class 7。"], tips: "班级 class，年级 grade。" },
    { name: "形容词描述自己", desc: "会用形容词描述外貌性格。", d: 3, core: "tall 高的、thin 瘦的、strong 强壮的、friendly 友好的、lovely 可爱的。", formula: "I'm tall and thin.", mistakes: ["形容词前漏 be。"], tips: "形容词前要有 be。" },
  ], [
    ch("be 动词与自我介绍", 3, "「我叫李明。」的英文是（　）", ["My name is Li Ming.", "My name Li Ming.", "I name is Li Ming.", "I'm Li Ming name."], "My name is Li Ming.", "My name is + 名。"),
    ch("be 动词与自我介绍", 3, "「欢迎来到七年级一班。」的英文是（　）", ["Welcome to Class 1, Grade 7!", "Welcome Class 1, Grade 7!", "Welcome to Grade 1, Class 7!", "Welcome in Class 1, Grade 7!"], "Welcome to Class 1, Grade 7!", "welcome to + 地点。"),
    ch("形容词描述自己", 3, "「我又高又瘦。」的英文是（　）", ["I'm tall and thin.", "I tall and thin.", "I'm tall and thinn.", "I'm high and thin."], "I'm tall and thin.", "tall and thin。"),
    tf("be 动词与自我介绍", 3, "This is… 用于介绍他人。", "对", "介绍用语。"),
  ], [
    ch("形容词描述自己", 4, "「友好的」的英文是（　）", ["friendly", "friend", "friends", "friendlly"], "friendly", "friendly 友好。"),
    ch("be 动词与自我介绍", 3, "「我 13 岁。」的英文是（　）", ["I'm thirteen years old.", "I'm thirteen year old.", "I thirteen years old.", "I have thirteen years old."], "I'm thirteen years old.", "years 复数。"),
    tf("be 动词与自我介绍", 4, "介绍自己可以说 I'm… 或 My name is…", "对", "两种皆可。"),
    ch("形容词描述自己", 4, "「她很强壮。」的英文是（　）", ["She is strong.", "She strong.", "She is streng.", "She are strong."], "She is strong.", "strong 强壮。"),
  ]),
  unit(2, "Unit 2 Let's play sports! 运动", [
    { name: "运动词汇 football / basketball / swimming / running", desc: "掌握运动词汇。", d: 3, core: "football 足球、basketball 篮球、swimming 游泳、running 跑步；play football 踢足球。", formula: "play football / play basketball", mistakes: ["play the football（球类不加 the）。"], tips: "球类运动前不加 the。" },
    { name: "实义动词 like 的一般现在时", desc: "掌握 like 的用法。", d: 3, core: "like doing / like to do 表示喜欢；三单 likes。", formula: "I like playing basketball.", mistakes: ["like 后接 to 而不用原形混用。"], tips: "like doing 表爱好。" },
  ], [
    ch("运动词汇 football / basketball / swimming / running", 3, "「足球」的英文是（　）", ["football", "foot ball", "footballs", "fotball"], "football", "football 足球。"),
    ch("运动词汇 football / basketball / swimming / running", 3, "「游泳」的英文是（　）", ["swimming", "swim", "swiming", "swimmm"], "swimming", "双写 m 加 -ing。"),
    ch("实义动词 like 的一般现在时", 3, "「我喜欢打篮球。」的英文是（　）", ["I like playing basketball.", "I like play basketball.", "I likes playing basketball.", "I like to playing basketball."], "I like playing basketball.", "like doing。"),
    tf("运动词汇 football / basketball / swimming / running", 3, "play sports 的意思是「做运动」。", "对", "play sports。"),
  ], [
    ch("运动词汇 football / basketball / swimming / running", 3, "「跑步」的英文是（　）", ["running", "runing", "run", "runn"], "running", "双写 n。"),
    ch("实义动词 like 的一般现在时", 4, "「他喜欢踢足球。」的英文是（　）", ["He likes playing football.", "He like playing football.", "He likes play football.", "He liking playing football."], "He likes playing football.", "三单 likes。"),
    tf("运动词汇 football / basketball / swimming / running", 3, "favourite 的意思是「最喜欢的」。", "对", "favourite 最爱。"),
    ch("运动词汇 football / basketball / swimming / running", 4, "「我们做运动吧！」的英文是（　）", ["Let's play sports!", "Let play sports!", "Lets play sport!", "Let's playing sports!"], "Let's play sports!", "Let's + 原形。"),
  ]),
  unit(3, "Unit 3 Welcome to our school! 学校", [
    { name: "学校场所 library / playground / office", desc: "掌握学校场所词汇。", d: 3, core: "library 图书馆、playground 操场、office 办公室、classroom 教室、hall 大厅。", formula: "in the library / on the playground", mistakes: ["library 拼写错误。"], tips: "library 两个 r。" },
    { name: "人称代词主格与宾格", desc: "掌握代词两种形式。", d: 3, core: "主格 I/you/he/she/it/we/they 作主语；宾格 me/you/him/her/it/us/them 作宾语。", formula: "Please give me the book. / We like him.", mistakes: ["动词后用主格。"], tips: "动词介词后用宾格。" },
  ], [
    ch("学校场所 library / playground / office", 3, "「图书馆」的英文是（　）", ["library", "libary", "librery", "libbary"], "library", "library 图书馆。"),
    ch("学校场所 library / playground / office", 3, "「操场」的英文是（　）", ["playground", "play ground", "playgrund", "playgroud"], "playground", "合写 playground。"),
    ch("人称代词主格与宾格", 3, "「请把书给我。」的英文是（　）", ["Please give me the book.", "Please give I the book.", "Please give my the book.", "Please give mine the book."], "Please give me the book.", "动词后用宾格。"),
    tf("人称代词主格与宾格", 3, "主格代词在句中作主语。", "对", "主格作主语。"),
  ], [
    ch("学校场所 library / playground / office", 4, "「办公室」的英文是（　）", ["office", "offices", "ofice", "offce"], "office", "office 办公室。"),
    ch("人称代词主格与宾格", 4, "「我们喜欢她。」的英文是（　）", ["We like her.", "We like she.", "We likes her.", "We like hers."], "We like her.", "动词后宾格。"),
    tf("人称代词主格与宾格", 4, "him 是 he 的宾格。", "对", "主 he 宾 him。"),
    ch("学校场所 library / playground / office", 4, "「欢迎来到我们学校！」的英文是（　）", ["Welcome to our school!", "Welcome in our school!", "Welcome to ours school!", "Welcome to our schools!"], "Welcome to our school!", "welcome to。"),
  ]),
  unit(4, "Unit 4 My day 我的一天", [
    { name: "时间介词 at / on / in", desc: "掌握时间介词。", d: 3, core: "at + 时刻（at seven）、on + 某天（on Monday）、in + 月/年/季节（in July）。", formula: "at 7:00 / on Monday / in July", mistakes: ["在具体星期几用 in。"], tips: "at 时刻、on 某天、in 月年。" },
    { name: "频度副词 always / usually / often / never", desc: "掌握频度副词。", d: 3, core: "always 总是、usually 通常、often 经常、sometimes 有时、never 从不；放在实义动词前、be 动词后。", formula: "I always get up early.", mistakes: ["频度副词放在句首后面不加逗号混乱。"], tips: "be 后实前。" },
  ], [
    ch("时间介词 at / on / in", 3, "「在七点」的英文是（　）", ["at seven", "in seven", "on seven", "at the seven"], "at seven", "时刻用 at。"),
    ch("时间介词 at / on / in", 3, "「在星期一」的英文是（　）", ["on Monday", "in Monday", "at Monday", "on the Monday"], "on Monday", "星期几用 on。"),
    ch("频度副词 always / usually / often / never", 3, "「总是」的英文是（　）", ["always", "all ways", "alway", "alwayss"], "always", "always 总是。"),
    tf("时间介词 at / on / in", 3, "in 用于月份、年份和季节前。", "对", "in + 月年季。"),
  ], [
    ch("时间介词 at / on / in", 4, "「在三月」的英文是（　）", ["in March", "at March", "on March", "in the March"], "in March", "月份用 in。"),
    ch("频度副词 always / usually / often / never", 4, "「有时」的英文是（　）", ["sometimes", "some times", "sometime", "some time"], "sometimes", "sometimes 有时。"),
    tf("频度副词 always / usually / often / never", 3, "never 的意思是「从不」。", "对", "never 从不。"),
    ch("频度副词 always / usually / often / never", 4, "「我通常六点起床。」的英文是（　）", ["I usually get up at six.", "I usually gets up at six.", "Usually I get up in six.", "I get up usually at six."], "I usually get up at six.", "usually 放实义动词前。"),
  ]),
  unit(5, "Unit 5 Let's celebrate! 庆祝", [
    { name: "节日词汇 Halloween / Christmas / Spring Festival", desc: "掌握主要节日。", d: 3, core: "Halloween 万圣节、Christmas 圣诞节、Spring Festival 春节；celebrate 庆祝。", formula: "at Halloween / at Christmas", mistakes: ["节日前一律用 at 不对。"], tips: "Christmas/Halloween 用 at，Day 用 on。" },
    { name: "庆祝活动 dress up / trick or treat", desc: "掌握庆祝活动表达。", d: 3, core: "dress up 打扮、trick or treat 不给糖就捣蛋、pumpkin lantern 南瓜灯、present 礼物。", formula: "dress up as a ghost 打扮成鬼", mistakes: ["dress up 写成 dress down。"], tips: "up 表装扮，down 表穿着朴素。" },
  ], [
    ch("节日词汇 Halloween / Christmas / Spring Festival", 3, "「万圣节」的英文是（　）", ["Halloween", "Hallowean", "Hallowen", "Hallowween"], "Halloween", "Halloween 万圣节。"),
    ch("节日词汇 Halloween / Christmas / Spring Festival", 3, "「圣诞节」的英文是（　）", ["Christmas", "Christms", "Cristmas", "Christamas"], "Christmas", "Christmas 圣诞。"),
    ch("庆祝活动 dress up / trick or treat", 3, "「不给糖就捣蛋」的英文是（　）", ["trick or treat", "treat or trick", "trick and treat", "trick or treating"], "trick or treat", "固定表达。"),
    tf("节日词汇 Halloween / Christmas / Spring Festival", 3, "celebrate 的意思是「庆祝」。", "对", "celebrate 庆祝。"),
  ], [
    ch("庆祝活动 dress up / trick or treat", 4, "「打扮成」的英文是（　）", ["dress up as", "dress as up", "dress up in", "dress up"], "dress up as", "as 表扮成。"),
    ch("节日词汇 Halloween / Christmas / Spring Festival", 4, "「春节」的英文是（　）", ["the Spring Festival", "Spring Festival", "the Spring Festivals", "Spring festival"], "the Spring Festival", "加 the。"),
    tf("庆祝活动 dress up / trick or treat", 4, "pumpkin lantern 的意思是「南瓜灯」。", "对", "万圣节南瓜灯。"),
    ch("庆祝活动 dress up / trick or treat", 4, "「我们圣诞节互送礼物。」的英文是（　）", ["We give presents to each other at Christmas.", "We give presents each other in Christmas.", "We give present to each other at Christmas.", "We gives presents to each other at Christmas."], "We give presents to each other at Christmas.", "at Christmas。"),
  ]),
  unit(6, "Unit 6 Food and lifestyle 饮食与生活方式", [
    { name: "食物与健康词汇", desc: "掌握 healthy / unhealthy food。", d: 3, core: "healthy food 健康食品、unhealthy food 不健康食品、vegetables 蔬菜、fruit 水果、too much 太多。", formula: "keep healthy 保持健康", mistakes: ["vegetable 不加 s。"], tips: "泛指蔬菜用复数。" },
    { name: "生活方式表达", desc: "会谈论生活方式。", d: 3, core: "a balanced diet 均衡饮食、do exercise 做运动、stay up late 熬夜。", formula: "I want to keep healthy.", mistakes: ["too much 修饰可数名词。"], tips: "too much + 不可数。" },
  ], [
    ch("食物与健康词汇", 3, "「健康的」的英文是（　）", ["healthy", "health", "healthyy", "healty"], "healthy", "healthy 健康。"),
    ch("食物与健康词汇", 3, "「蔬菜」的英文是（　）", ["vegetables", "vegetable", "vegitables", "vegetabls"], "vegetables", "常用复数。"),
    ch("生活方式表达", 3, "「保持健康」的英文是（　）", ["keep healthy", "keep health", "keep healthily", "keeping healthy"], "keep healthy", "keep + 形容词。"),
    tf("食物与健康词汇", 3, "fast food 的意思是「快餐」。", "对", "fast food 快餐。"),
  ], [
    ch("生活方式表达", 4, "「均衡饮食」的英文是（　）", ["a balanced diet", "a balance diet", "a balanced diets", "balance diet"], "a balanced diet", "balanced 均衡的。"),
    ch("食物与健康词汇", 4, "「水果」的英文是（　）", ["fruit", "fruits", "friut", "frut"], "fruit", "泛指用 fruit。"),
    tf("生活方式表达", 4, "吃太多糖对健康不好。", "对", "健康常识。"),
    ch("生活方式表达", 4, "「我每天做运动。」的英文是（　）", ["I do exercise every day.", "I does exercise every day.", "I do exercises every day.", "I doing exercise every day."], "I do exercise every day.", "exercise 不可数。"),
  ]),
  unit(7, "Unit 7 Shopping 购物", [
    { name: "购物词汇 shop / mall / price / cheap", desc: "掌握购物词汇。", d: 3, core: "shop 商店、shopping mall 购物中心、price 价格、cheap 便宜的、expensive 昂贵的。", formula: "go shopping 去购物", mistakes: ["cheap 与 chip 混淆。"], tips: "cheap 便宜。" },
    { name: "购物句型 How much…? / try on", desc: "掌握购物交际用语。", d: 3, core: "How much is it? 多少钱；try on 试穿；I'd like to buy… 我想买……", formula: "Can I try it on? 我可以试穿吗？", mistakes: ["try on 代词要放中间：try it on。"], tips: "代词必须放中间。" },
  ], [
    ch("购物词汇 shop / mall / price / cheap", 3, "「多少钱」的英文是（　）", ["How much is it?", "How many is it?", "How much it is?", "What price is it?"], "How much is it?", "how much 问价。"),
    ch("购物词汇 shop / mall / price / cheap", 3, "「便宜的」的英文是（　）", ["cheap", "chip", "cheep", "sheap"], "cheap", "cheap 便宜。"),
    ch("购物句型 How much…? / try on", 3, "「购物中心」的英文是（　）", ["shopping mall", "shop mall", "shopping malls", "shopping maul"], "shopping mall", "shopping mall。"),
    tf("购物词汇 shop / mall / price / cheap", 3, "expensive 的意思是「昂贵的」。", "对", "expensive 贵。"),
  ], [
    ch("购物句型 How much…? / try on", 4, "「我想买这件 T 恤。」的英文是（　）", ["I'd like to buy this T-shirt.", "I'd like buy this T-shirt.", "I'd like to buying this T-shirt.", "I like to buy this T-shirt."], "I'd like to buy this T-shirt.", "would like to + 原形。"),
    ch("购物句型 How much…? / try on", 4, "「我可以试穿吗？」的英文是（　）", ["Can I try it on?", "Can I try on it?", "Can I try it?", "Can I trying it on?"], "Can I try it on?", "代词放中间。"),
    tf("购物词汇 shop / mall / price / cheap", 4, "price 的意思是「价格」。", "对", "price 价格。"),
    ch("购物词汇 shop / mall / price / cheap", 4, "「去购物」的英文是（　）", ["go shopping", "go shop", "go to shopping", "going shopping"], "go shopping", "go shopping。"),
  ]),
  unit(8, "Unit 8 Fashion 时尚", [
    { name: "服装词汇 trainers / jeans / jacket / scarf", desc: "掌握服装词汇。", d: 3, core: "trainers 运动鞋、jeans 牛仔裤、jacket 夹克、scarf 围巾；comfortable 舒适的。", formula: "a pair of jeans 一条牛仔裤", mistakes: ["jeans 当单数。"], tips: "jeans/trousers 常用复数。" },
    { name: "描述穿着 look + 形容词", desc: "掌握 look 的用法。", d: 3, core: "look + 形容词表示「看起来」；You look cool! 你看起来很酷！", formula: "You look cool in this jacket.", mistakes: ["look 后接副词。"], tips: "look 是系动词，后接形容词。" },
  ], [
    ch("服装词汇 trainers / jeans / jacket / scarf", 3, "「牛仔裤」的英文是（　）", ["jeans", "jean", "jeens", "jeanes"], "jeans", "常用复数。"),
    ch("服装词汇 trainers / jeans / jacket / scarf", 3, "「夹克」的英文是（　）", ["jacket", "jackettt", "jaket", "jacke"], "jacket", "jacket 夹克。"),
    ch("服装词汇 trainers / jeans / jacket / scarf", 3, "「运动鞋」的英文是（　）", ["trainers", "trainer", "trainners", "trains"], "trainers", "英式 trainers。"),
    tf("服装词汇 trainers / jeans / jacket / scarf", 3, "fashion 的意思是「时尚」。", "对", "fashion 时尚。"),
  ], [
    ch("服装词汇 trainers / jeans / jacket / scarf", 4, "「围巾」的英文是（　）", ["scarf", "scarff", "skarf", "scarfe"], "scarf", "scarf 围巾。"),
    ch("描述穿着 look + 形容词", 3, "「你看起来很酷！」的英文是（　）", ["You look cool!", "You looks cool!", "You are look cool!", "You look coolly!"], "You look cool!", "look + 形容词。"),
    tf("服装词汇 trainers / jeans / jacket / scarf", 4, "comfortable 的意思是「舒适的」。", "对", "comfortable 舒适。"),
    ch("描述穿着 look + 形容词", 4, "「这条围巾看起来很漂亮。」的英文是（　）", ["The scarf looks beautiful.", "The scarf look beautiful.", "The scarf looks beautifully.", "The scarf is look beautiful."], "The scarf looks beautiful.", "三单 looks。"),
  ]),
]);

// —— 人教版 高中英语 必修第一册：Unit 1-5 ——
writeBook(E, "人教版 · 英语必修第一册（高一上册）", "必修第一册", [
  unit(1, "Unit 1 Teenage Life 青少年生活", [
    { name: "高中生活词汇 freshman / club / challenge", desc: "掌握高中生活核心词汇。", d: 4, core: "freshman 新生、challenge 挑战、club 社团、course 课程；join a club 加入社团。", formula: "choose courses 选课", mistakes: ["freshman 复数 freshmen。"], tips: "freshman → freshmen（不规则）。" },
    { name: "提建议句型", desc: "掌握 advice 相关表达。", d: 4, core: "advice 建议（不可数）；give sb. advice 给某人建议；advise doing sth. 建议做某事。", formula: "give me some advice 给我一些建议", mistakes: ["advice 当可数名词：an advice。"], tips: "advice 不可数。" },
  ], [
    ch("高中生活词汇 freshman / club / challenge", 4, "「新生」的英文是（　）", ["freshman", "fresh man", "freshmen", "freshmany"], "freshman", "freshman 新生。"),
    ch("高中生活词汇 freshman / club / challenge", 4, "「挑战」的英文是（　）", ["challenge", "chalenge", "challeng", "challlenge"], "challenge", "challenge 挑战。"),
    ch("提建议句型", 4, "advice 是（　）名词", ["不可数", "可数", "既可数又不可数", "形容词"], "不可数", "advice 不可数。"),
    tf("高中生活词汇 freshman / club / challenge", 4, "join a club 的意思是「加入社团」。", "对", "join a club。"),
  ], [
    ch("高中生活词汇 freshman / club / challenge", 4, "「选课」的英文是（　）", ["choose courses", "choose course", "chose courses", "choosing courses"], "choose courses", "choose 选择。"),
    ch("提建议句型", 4, "「给我一些建议」的英文是（　）", ["give me some advice", "give me an advice", "give me advices", "give some advice to mine"], "give me some advice", "不可数用 some。"),
    tf("提建议句型", 4, "advise 是动词，advice 是名词。", "对", "词性不同。"),
    ch("高中生活词汇 freshman / club / challenge", 4, "freshman 的复数是（　）", ["freshmen", "freshmans", "freshmenes", "freshmansion"], "freshmen", "不规则复数。"),
  ]),
  unit(2, "Unit 2 Travelling Around 旅行", [
    { name: "旅行词汇 travel plan / transport", desc: "掌握旅行核心词汇。", d: 4, core: "travel plan 旅行计划、package tour 包价游、transport 交通、application 申请、passport 护照。", formula: "book air tickets 订机票", mistakes: ["transport 拼写错误。"], tips: "trans- 前缀 + port。" },
    { name: "预订与计划表达", desc: "掌握预订相关表达。", d: 4, core: "book / reserve 预订、apply for 申请；be going to 表计划。", formula: "apply for a passport 申请护照", mistakes: ["apply 后直接接护照不加 for。"], tips: "apply for + 目标。" },
  ], [
    ch("旅行词汇 travel plan / transport", 4, "「旅行计划」的英文是（　）", ["travel plan", "traveling plan", "travell plan", "travel plane"], "travel plan", "travel plan。"),
    ch("旅行词汇 travel plan / transport", 4, "「交通」的英文是（　）", ["transport", "transpot", "transporrt", "transportt"], "transport", "transport 交通。"),
    ch("预订与计划表达", 4, "「预订机票」的英文是（　）", ["book air tickets", "book air ticket", "booking air tickets", "book the air tickets"], "book air tickets", "复数不加 the。"),
    tf("旅行词汇 travel plan / transport", 4, "package tour 的意思是「包价旅游」。", "对", "package tour。"),
  ], [
    ch("预订与计划表达", 4, "「申请护照」的英文是（　）", ["apply for a passport", "apply a passport", "applying for passport", "apply for passports"], "apply for a passport", "apply for。"),
    ch("旅行词汇 travel plan / transport", 4, "「好游客」的英文是（　）", ["a good tourist", "a good tourism", "a good travel", "a good tour"], "a good tourist", "tourist 游客。"),
    tf("预订与计划表达", 4, "reserve 的意思是「预订」。", "对", "reserve 预订。"),
    ch("预订与计划表达", 4, "「我打算去西安旅行。」的英文是（　）", ["I'm going to travel to Xi'an.", "I going to travel to Xi'an.", "I'm going to travel Xi'an.", "I'm go to travel to Xi'an."], "I'm going to travel to Xi'an.", "be going to + 原形。"),
  ]),
  unit(3, "Unit 3 Sports and Fitness 运动与健康", [
    { name: "运动词汇 athlete / master / strength", desc: "掌握运动健康词汇。", d: 4, core: "athlete 运动员、master 大师/精通、strength 力量、grace 优雅、injury 损伤。", formula: "a sports legend 体育传奇", mistakes: ["athlete 发音与拼写不一致。"], tips: "athlete 两个音节。" },
    { name: "同意与不同意表达", desc: "掌握交际用语。", d: 4, core: "I agree with you. 我同意你。I disagree. 我不同意。That's a good idea. 好主意。", formula: "I agree with you.", mistakes: ["agree 后接 to。"], tips: "agree with sb." },
  ], [
    ch("运动词汇 athlete / master / strength", 4, "「运动员」的英文是（　）", ["athlete", "athelete", "athlet", "athletee"], "athlete", "athlete 运动员。"),
    ch("运动词汇 athlete / master / strength", 4, "「力量」的英文是（　）", ["strength", "strongth", "strenght", "strenth"], "strength", "strength 力量。"),
    ch("同意与不同意表达", 4, "「我同意你。」的英文是（　）", ["I agree with you.", "I agree to you.", "I agree you.", "I'm agree with you."], "I agree with you.", "agree with sb."),
    tf("运动词汇 athlete / master / strength", 4, "fitness 的意思是「健康、健身」。", "对", "fitness 健康。"),
  ], [
    ch("同意与不同意表达", 4, "「我不同意。」的英文是（　）", ["I disagree.", "I disagree with you. agree.", "I don't agree with.", "I'm not agree."], "I disagree.", "dis- 否定前缀。"),
    ch("运动词汇 athlete / master / strength", 4, "「损伤」的英文是（　）", ["injury", "injur", "injurey", "injurry"], "injury", "injury 损伤。"),
    tf("运动词汇 athlete / master / strength", 4, "sportsmanship 的意思是「体育精神」。", "对", "sportsmanship。"),
    ch("同意与不同意表达", 4, "赞同别人想法时应说（　）", ["That's a good idea.", "I don't think so.", "No way.", "Never mind."], "That's a good idea.", "赞同表达。"),
  ]),
  unit(4, "Unit 4 Natural Disasters 自然灾害", [
    { name: "灾害词汇 flood / earthquake / tsunami", desc: "掌握灾害核心词汇。", d: 4, core: "flood 洪水、earthquake 地震、tsunami 海啸、drought 干旱、disaster 灾难。", formula: "a natural disaster 自然灾害", mistakes: ["earthquake 拆成两个词。"], tips: "合写 earthquake。" },
    { name: "新闻与指令表达", desc: "掌握防灾指令。", d: 4, core: "evacuate 撤离、rescue 救援、in ruins 成废墟；指令 Give instructions。", formula: "prepare for a disaster 防灾准备", mistakes: ["evacuate 拼写错误。"], tips: "e-vac-uate。" },
  ], [
    ch("灾害词汇 flood / earthquake / tsunami", 4, "「洪水」的英文是（　）", ["flood", "flud", "floood", "floud"], "flood", "flood 洪水。"),
    ch("灾害词汇 flood / earthquake / tsunami", 4, "「地震」的英文是（　）", ["earthquake", "earth quake", "erthquake", "earthquacke"], "earthquake", "合写。"),
    ch("灾害词汇 flood / earthquake / tsunami", 4, "「灾难」的英文是（　）", ["disaster", "disater", "disastar", "disastre"], "disaster", "disaster 灾难。"),
    tf("灾害词汇 flood / earthquake / tsunami", 4, "tsunami 的意思是「海啸」。", "对", "tsunami 海啸。"),
  ], [
    ch("新闻与指令表达", 4, "「撤离」的英文是（　）", ["evacuate", "evacute", "evauate", "evacuvate"], "evacuate", "evacuate 撤离。"),
    ch("新闻与指令表达", 4, "「救援」的英文是（　）", ["rescue", "rescure", "resque", "rescoue"], "rescue", "rescue 救援。"),
    tf("新闻与指令表达", 4, "in ruins 的意思是「成为废墟」。", "对", "in ruins。"),
    ch("灾害词汇 flood / earthquake / tsunami", 4, "「干旱」的英文是（　）", ["drought", "drougt", "draught", "drowght"], "drought", "drought 干旱。"),
  ]),
  unit(5, "Unit 5 Languages Around the World 世界语言", [
    { name: "语言词汇 dialect / character", desc: "掌握语言相关词汇。", d: 4, core: "dialect 方言、character 汉字、system 系统、plural 复数、native language 母语。", formula: "Chinese characters 汉字", mistakes: ["character 拼写错误。"], tips: "char-ac-ter。" },
    { name: "英语的传播与变体", desc: "了解英语的世界地位。", d: 4, core: "English is widely used. 英语被广泛使用；accent 口音；American English 美式英语、British English 英式英语。", formula: "English is an international language.", mistakes: ["widely 写成 wide。"], tips: "修饰 used 用副词 widely。" },
  ], [
    ch("语言词汇 dialect / character", 4, "「方言」的英文是（　）", ["dialect", "dialekt", "dilect", "dialectt"], "dialect", "dialect 方言。"),
    ch("语言词汇 dialect / character", 4, "「书写系统」的英文是（　）", ["writing system", "write system", "writing systems", "writting system"], "writing system", "writing system。"),
    ch("英语的传播与变体", 4, "「口音」的英文是（　）", ["accent", "acsent", "accsent", "ascent"], "accent", "accent 口音。"),
    tf("英语的传播与变体", 4, "English is widely used. 意思接近「英语被广泛使用」。", "对", "widely used。"),
  ], [
    ch("语言词汇 dialect / character", 4, "「母语」的英文是（　）", ["native language", "nature language", "natvie language", "national language"], "native language", "native language。"),
    ch("英语的传播与变体", 4, "「复数」的英文是（　）", ["plural", "plurall", "plurl", "plaral"], "plural", "plural 复数。"),
    tf("语言词汇 dialect / character", 4, "汉字是表意文字，有悠久历史。", "对", "文化常识。"),
    ch("英语的传播与变体", 4, "「世界上有许多人说英语。」的英文是（　）", ["Many people speak English in the world.", "Many people speak English in world.", "Many people speaks English in the world.", "Much people speak English in the world."], "Many people speak English in the world.", "people 复数概念。"),
  ]),
]);
// ════════════════════════════════════════════════════════════════════
// 三、小学数学（默认版本 = 人教版；此处为非默认版本）
// ════════════════════════════════════════════════════════════════════

// —— 北师大版 数学一年级上册（一~八单元）——
writeBook(M, "北师大版 · 数学一年级上册", "一年级上册", [
  unit(1, "可爱的校园 · 生活中的数", [
    { name: "数数 1~10", desc: "会按顺序数出物体的个数。", d: 1, core: "数数要一个一个按顺序数，用数表示物体的个数；数到几，物体的个数就是几。", formula: "1, 2, 3, 4, 5, 6, 7, 8, 9, 10", mistakes: ["数数时漏数或重复数。"], tips: "数一个做一个标记。" },
    { name: "0 的认识", desc: "理解 0 的含义。", d: 1, core: "0 表示一个物体也没有，也可以表示起点；0 也是数，比 1 小。", formula: "0 表示没有", mistakes: ["认为 0 不是数。"], tips: "0 是最小的自然数。" },
  ], [
    ch("数数 1~10", 1, "数物体的个数时，要（　）", ["按顺序一个一个地数", "随便数", "两个两个数", "跳着数"], "按顺序一个一个地数", "按顺序数才不漏。"),
    ch("0 的认识", 1, "盘子里一个苹果也没有，用哪个数表示？（　）", ["0", "1", "10", "2"], "0", "0 表示没有。"),
    ca("数数 1~10", 1, "3 添上 1 是几？", 4, "3 + 1 = 4。"),
    tf("0 的认识", 1, "0 也是一个数。", "对", "0 比 1 小。"),
  ], [
    tf("数数 1~10", 1, "数数时不能重复也不能遗漏。", "对", "一一对应。"),
    ch("数数 1~10", 2, "1, 2, 3, ___，横线上应填（　）", ["4", "5", "2", "6"], "4", "3 后面是 4。"),
    ch("0 的认识", 2, "0 比 1（　）", ["小", "大", "一样大", "无法比较"], "小", "0 < 1。"),
    tf("0 的认识", 2, "直尺上的刻度从 0 开始。", "对", "0 可以表示起点。"),
  ]),
  unit(2, "比较", [
    { name: "比多少", desc: "会用一一对应比较多少。", d: 1, core: "比较多少用一一对应的方法，一个对着一个，有多出来的一方就较多；结果有「多、少、同样多」。", formula: "一一对应比较", mistakes: ["不一一对应就下结论。"], tips: "对齐了再比。" },
    { name: "比长短、比高矮", desc: "会比较长短与高矮。", d: 1, core: "比较长短要把一端对齐；比较高矮要站在同一水平面上。", formula: "一端对齐再比较", mistakes: ["没有一端对齐就比较。"], tips: "先对齐再比较。" },
  ], [
    ch("比多少", 1, "小明有 3 支笔，小红有 5 支笔，谁的笔多？（　）", ["小明", "小红", "一样多", "无法比较"], "小红", "5 > 3，小红多。"),
    ch("比多少", 1, "两堆物品一个对一个正好对完，说明（　）", ["同样多", "一堆多", "一堆少", "无法比较"], "同样多", "对完即相等。"),
    tf("比长短、比高矮", 1, "比较两根绳子的长短时，要把一端对齐。", "对", "一端对齐才能比。"),
    ca("比多少", 2, "4 和 6 比，较大的数是几？", 6, "6 > 4。"),
  ], [
    ch("比长短、比高矮", 1, "比较高矮时，两个人要站在（　）", ["同一水平面上", "不同的地方", "一个台阶上一个台阶下", "随意站"], "同一水平面上", "同一平面才公平。"),
    tf("比多少", 2, "「同样多」表示两边数量相等。", "对", "数量相等。"),
    ch("比长短、比高矮", 2, "小树高，小草矮，说明（　）", ["小树比小草高", "小树比小草矮", "一样高", "无法比较"], "小树比小草高", "高矮是相对比较。"),
    ch("比多少", 2, "5 个苹果和 5 个梨比，（　）", ["苹果多", "梨多", "同样多", "无法比较"], "同样多", "数量都是 5。"),
  ]),
  unit(3, "加与减（一）", [
    { name: "加法的意义", desc: "理解加法表示「合起来」。", d: 1, core: "把两部分合起来求一共多少，用加法计算：a + b = c。", formula: "$a+b=c$", mistakes: ["把「合起来」用成减法。"], tips: "一共、合起来用加法。" },
    { name: "减法的意义", desc: "理解减法表示「去掉一部分」。", d: 1, core: "从总数里去掉一部分，求剩下多少，用减法计算：a − b = c。", formula: "$a-b=c$", mistakes: ["减法算式总数与部分颠倒。"], tips: "总数减去掉的部分。" },
  ], [
    ...arith("加法的意义", 1, [[1, 2], [2, 3], [4, 1]], "+"),
    ch("加法的意义", 1, "树上有 4 只鸟，又飞来 2 只，求一共几只，用（　）", ["加法", "减法", "乘法", "无法确定"], "加法", "合起来用加法。"),
    ...arith("减法的意义", 1, [[5, 2], [4, 1], [3, 2]], "-"),
  ], [
    ch("减法的意义", 1, "原来有 5 个苹果，吃了 2 个，求还剩几个，用（　）", ["减法", "加法", "乘法", "无法确定"], "减法", "去掉一部分用减法。"),
    ca("加法的意义", 2, "3 和 2 合起来是几？", 5, "3 + 2 = 5。"),
    tf("加法的意义", 1, "把两部分合起来用加法计算。", "对", "加法意义。"),
    ca("减法的意义", 2, "从 5 里面去掉 3，还剩几？", 2, "5 − 3 = 2。"),
  ]),
  unit(4, "分类", [
    { name: "按标准分类", desc: "会按给定标准分类。", d: 1, core: "分类要按统一的标准（如用途、形状、颜色）把物品分成若干组。", formula: "按标准分类", mistakes: ["同一堆里用两个标准混着分。"], tips: "一次分类只用一个标准。" },
    { name: "分类标准不同结果不同", desc: "理解分类标准的多样性。", d: 1, core: "同一组物品，分类标准不同，分得的结果就不同；分类能让东西更整齐、好找。", formula: "标准不同 → 结果不同", mistakes: ["认为分法只有一种。"], tips: "多角度分类。" },
  ], [
    ch("按标准分类", 1, "把铅笔、橡皮、尺子放在一起，是按（　）分", ["用途", "颜色", "大小", "形状"], "用途", "都是文具。"),
    ch("分类标准不同结果不同", 1, "把水果和蔬菜分开，是按（　）分", ["种类", "颜色", "形状", "大小"], "种类", "按食物类别。"),
    tf("分类标准不同结果不同", 1, "同一组物品可以按不同的标准分类。", "对", "标准多样。"),
    ch("按标准分类", 2, "整理房间属于（　）", ["分类", "比较", "数数", "测量"], "分类", "整理即分类。"),
  ], [
    tf("按标准分类", 2, "分类的标准要统一。", "对", "一次一个标准。"),
    ch("分类标准不同结果不同", 2, "分类的好处是（　）", ["更整齐、更好找", "东西变多", "颜色变深", "没有好处"], "更整齐、更好找", "分类的意义。"),
    ch("按标准分类", 2, "把三角形和圆分开，是按（　）分", ["形状", "颜色", "用途", "大小"], "形状", "按形状。"),
    tf("分类标准不同结果不同", 2, "同一组积木既可以按颜色分，也可以按形状分。", "对", "标准不同结果不同。"),
  ]),
  unit(5, "位置与顺序", [
    { name: "前后与上下", desc: "会用前后、上下描述位置。", d: 1, core: "前后：面向的方向是前，背对的是后；上下：高处为上，低处为下。位置是相对的。", formula: "前 / 后 / 上 / 下", mistakes: ["不先说清参照物就说前后。"], tips: "先说「谁」再说位置。" },
    { name: "左右", desc: "会辨认左右。", d: 1, core: "通常写字的手是右手，另一端是左手；左右也是相对的，会随面向改变。", formula: "左 / 右", mistakes: ["以为左右永远固定。"], tips: "左右会随方向变。" },
  ], [
    ch("前后与上下", 1, "我在妈妈的前面，妈妈就在我的（　）", ["后面", "前面", "上面", "下面"], "后面", "前后相对。"),
    ch("前后与上下", 1, "书在桌子上，桌子就在书的（　）", ["下面", "上面", "前面", "后面"], "下面", "上下相对。"),
    ch("左右", 1, "通常我们写字的手是（　）", ["右手", "左手", "两只手", "不一定"], "右手", "大多数人右手写字。"),
    tf("前后与上下", 1, "上和下是相对的。", "对", "相对位置。"),
  ], [
    ch("左右", 2, "面对国旗，你的左手边是（　）", ["东", "西", "南", "北"], "西", "面北背南左西右东（坐向北方时）。"),
    ch("前后与上下", 2, "排队时，小明前面有 2 人，后面有 3 人，这排共（　）人", ["6", "5", "7", "4"], "6", "2 + 1 + 3 = 6。"),
    tf("左右", 2, "左右是相对的。", "对", "相对位置。"),
    ch("前后与上下", 2, "小鸟在云朵下面，云朵就在小鸟的（　）", ["上面", "下面", "前面", "后面"], "上面", "上下相对。"),
  ]),
  unit(6, "认识图形", [
    { name: "立体图形", desc: "认识长方体、正方体、圆柱、球。", d: 1, core: "长方体 6 个面、正方体 6 个面都一样大、圆柱上下一样粗、球没有平面。", formula: "长方体 / 正方体 / 圆柱 / 球", mistakes: ["把圆柱当面是曲面就认为不能滚动描述错。"], tips: "圆柱侧面是曲面。" },
    { name: "图形的拼搭", desc: "会用积木拼搭图形。", d: 1, core: "用相同的立体图形可以拼成新的形状；「我说你做」按指令搭积木。", formula: "拼搭与组合", mistakes: ["认为小球能稳稳堆高。"], tips: "球爱滚动，不好堆。" },
  ], [
    ch("立体图形", 1, "魔方的形状大概是（　）", ["正方体", "长方体", "圆柱", "球"], "正方体", "魔方是正方体。"),
    ch("立体图形", 1, "易拉罐的形状大概是（　）", ["圆柱", "球", "正方体", "长方体"], "圆柱", "上下一样粗是圆柱。"),
    ch("立体图形", 1, "足球的形状是（　）", ["球", "圆", "圆柱", "正方体"], "球", "足球是球体。"),
    tf("立体图形", 1, "正方体有 6 个面。", "对", "6 个面。"),
  ], [
    ch("立体图形", 2, "正方体有几个面？（　）", ["6", "4", "8", "12"], "6", "正方体 6 个面。"),
    tf("立体图形", 2, "圆柱的上下两个面一样大。", "对", "底面全等。"),
    ch("立体图形", 2, "粉笔盒的形状大概是（　）", ["长方体", "正方体", "球", "圆柱"], "长方体", "粉笔盒近长方体。"),
    tf("图形的拼搭", 2, "球没有平平的面，容易滚动。", "对", "球爱滚。"),
  ]),
  unit(7, "加与减（二）", [
    { name: "11~20 各数的组成", desc: "理解十几的组成。", d: 2, core: "11~19 都由 1 个十和几个一组成；20 由 2 个十组成。十位上的 1 表示 1 个十。", formula: "15 = 10 + 5", mistakes: ["把 15 读成「一五」。"], tips: "先读十位再读个位。" },
    { name: "20 以内的加减法", desc: "会计算 20 以内加减法。", d: 2, core: "20 以内加法可用凑十法；减法可用「想加算减」：想几加几得被减数。", formula: "凑十法 / 想加算减", mistakes: ["进位加法忘记进位。"], tips: "看到 9、8 想凑十。" },
  ], [
    ch("11~20 各数的组成", 2, "15 里面有 1 个十和几个一？（　）", ["5", "1", "4", "6"], "5", "15 = 10 + 5。"),
    ca("20 以内的加减法", 2, "9 + 5 = ？", 14, "把 5 分成 1 和 4，9+1=10，10+4=14。"),
    ca("20 以内的加减法", 2, "13 − 6 = ？", 7, "想 6 + 7 = 13，所以 13 − 6 = 7。"),
    tf("11~20 各数的组成", 2, "十几都是由 1 个十和几个一组成的。", "对", "十位是 1。"),
  ], [
    ca("20 以内的加减法", 3, "8 + 7 = ？", 15, "把 7 分成 2 和 5，8+2=10，10+5=15。"),
    ca("20 以内的加减法", 3, "16 − 8 = ？", 8, "想 8 + 8 = 16。"),
    ch("11~20 各数的组成", 2, "2 个十是（　）", ["20", "12", "10", "2"], "20", "2 个十 = 20。"),
    ch("20 以内的加减法", 3, "计算 9 + 6 时，先想把 6 分成 1 和几？（　）", ["5", "4", "6", "1"], "5", "9 和 1 凑十，6 分成 1 和 5。"),
  ]),
  unit(8, "认识钟表", [
    { name: "钟面结构", desc: "认识时针与分针。", d: 1, core: "钟面上又短又粗的是时针，又长又细的是分针；分针走 1 小格是 1 分，走一圈是 60 分（1 小时）。", formula: "1 时 = 60 分", mistakes: ["把时针分针认反。"], tips: "时针短，分针长。" },
    { name: "整时的认读", desc: "会读、会写整时。", d: 2, core: "整时分针指着 12，时针指着几就是几时；记录用 8:00。", formula: "分针指 12，时针指几就几时", mistakes: ["先读分针再读时针。"], tips: "先看时针定几时。" },
  ], [
    ch("钟面结构", 1, "钟面上又短又粗的针是（　）", ["时针", "分针", "秒针", "长针"], "时针", "时针短粗。"),
    ch("钟面结构", 1, "分针走 1 小格是（　）", ["1 分", "1 时", "5 分", "60 分"], "1 分", "1 小格 1 分钟。"),
    tf("整时的认读", 1, "整时时针指着几就是几时。", "对", "分针指 12。"),
    ch("钟面结构", 2, "分针走一圈是（　）", ["60 分", "12 分", "1 分", "24 分"], "60 分", "一圈 60 分钟。"),
  ], [
    ch("钟面结构", 2, "1 时等于（　）分", ["60", "30", "100", "12"], "60", "1 时 = 60 分。"),
    tf("整时的认读", 2, "一天有 24 小时。", "对", "24 小时制。"),
    ch("整时的认读", 2, "时针指 8、分针指 12，是（　）", ["8:00", "12:00", "8:12", "12:08"], "8:00", "时针定小时。"),
    ch("钟面结构", 3, "钟面上从 1 到 12 共（　）个数", ["12", "10", "11", "13"], "12", "1~12 共 12 个。"),
  ]),
]);

// —— 苏教版 数学一年级上册（一~八单元）——
writeBook(M, "苏教版 · 数学一年级上册", "一年级上册", [
  unit(1, "数一数", [
    { name: "数数的方法", desc: "学会按顺序数数。", d: 1, core: "数数时按顺序一个一个（或两个两个）地数，边数边做标记，做到不重复、不遗漏。", formula: "按顺序数数", mistakes: ["数数时漏数或重复数。"], tips: "数一个划掉一个。" },
    { name: "数量的表示", desc: "会用数表示数量。", d: 1, core: "数到几，就用几表示物体的个数；1~10 按从小到大排列。", formula: "1, 2, 3, … 10", mistakes: ["把顺序与个数混淆。"], tips: "「几」是数量，「第几」是顺序。" },
  ], [
    ch("数数的方法", 1, "数数时要（　）", ["按顺序地数", "随便数", "跳着数", "倒数着数"], "按顺序地数", "按顺序才不漏。"),
    tf("数数的方法", 1, "数数时不能重复也不能遗漏。", "对", "一一对应。"),
    ca("数量的表示", 1, "按顺序填数：1、2、3、___、5，横线上是几？", 4, "顺序为 1、2、3、4、5。"),
    ch("数量的表示", 1, "有 5 个苹果，再添 1 个，一共是（　）个", ["6", "5", "7", "4"], "6", "5 + 1 = 6。"),
  ], [
    ch("数数的方法", 2, "「第 3 个」表示的是（　）", ["顺序", "数量", "总数", "多少"], "顺序", "第几表顺序。"),
    tf("数量的表示", 1, "10 比 9 大。", "对", "10 > 9。"),
    ch("数数的方法", 2, "数一堆小球，最好的办法是（　）", ["边数边做标记", "看一眼就说", "随便数", "猜"], "边数边做标记", "做标记防重漏。"),
    ch("数量的表示", 2, "7 前面的一个数是（　）", ["6", "8", "5", "9"], "6", "7 前面是 6。"),
  ]),
  unit(2, "比一比", [
    { name: "比多少", desc: "会用一一对应比多少。", d: 1, core: "比较多少把一个对一个地对起来，谁有多出来的部分谁就较多，否则同样多。", formula: "一一对应", mistakes: ["不对齐就比较。"], tips: "对齐再比。" },
    { name: "比长短、高矮、轻重", desc: "会比较多种属性。", d: 1, core: "比长短要一端对齐；比高矮要同一平面；比轻重可以用手掂一掂或用简易天平。", formula: "一端对齐 / 同一平面 / 掂一掂", mistakes: ["比较长短没有一端对齐。"], tips: "先对齐再比较。" },
  ], [
    ch("比多少", 1, "比较多少最常用的方法是（　）", ["一一对应", "比颜色", "比大小", "比形状"], "一一对应", "一个对一个。"),
    ch("比长短、高矮、轻重", 1, "比较两根绳子的长短，要（　）", ["把一端对齐", "比颜色", "比粗细", "随便比"], "把一端对齐", "一端对齐才公平。"),
    tf("比长短、高矮、轻重", 1, "比较轻重可以用手掂一掂。", "对", "掂一掂估轻重。"),
    ch("比多少", 1, "小明有 3 支笔，小红有 5 支笔，（　）的笔多", ["小明", "小红", "一样多", "无法比较"], "小红", "5 > 3。"),
  ], [
    ch("比多少", 2, "3 和 3 比较，结果是（　）", ["同样多", "多", "少", "无法比较"], "同样多", "两数相等。"),
    tf("比长短、高矮、轻重", 2, "比较高矮时两人要站在同一水平面上。", "对", "同一平面。"),
    ch("比长短、高矮、轻重", 2, "一个苹果和一个西瓜比，（　）", ["西瓜重", "苹果重", "一样重", "无法比较"], "西瓜重", "西瓜更重。"),
    ch("比多少", 2, "4 个苹果和 6 个梨比，（　）", ["苹果多", "梨多", "同样多", "无法比较"], "梨多", "6 > 4。"),
  ]),
  unit(3, "分一分", [
    { name: "按标准分一分", desc: "会按标准给物品分组。", d: 1, core: "分一分就是按用途、形状、颜色等标准把物品分组；每次分一分只用一个标准。", formula: "按标准分组", mistakes: ["一次用两个标准混着分。"], tips: "一次一个标准。" },
    { name: "分一分与整理", desc: "体会分类整理的好处。", d: 1, core: "把文具放进文具盒、把衣服放进衣柜都是分一分；分一分让东西更整齐、更好找。", formula: "整理 = 分一分", mistakes: ["认为分一分只是游戏。"], tips: "生活中处处有分类。" },
  ], [
    ch("按标准分一分", 1, "把铅笔、橡皮、尺子放到一起，是按（　）分", ["用途", "颜色", "形状", "大小"], "用途", "都是文具。"),
    ch("按标准分一分", 1, "把红色和黄色的积木分开，是按（　）分", ["颜色", "形状", "用途", "大小"], "颜色", "按颜色。"),
    tf("分一分与整理", 1, "分一分的标准要一样。", "对", "标准统一。"),
    ch("分一分与整理", 1, "整理房间属于（　）", ["分一分", "数一数", "比一比", "认位置"], "分一分", "整理即分类。"),
  ], [
    ch("按标准分一分", 2, "把汽车和飞机分开，是按（　）分", ["种类", "颜色", "大小", "形状"], "种类", "按类型。"),
    tf("分一分与整理", 2, "分一分可以让东西更整齐。", "对", "整理的好处。"),
    ch("按标准分一分", 2, "把圆形和方形的积木分开，是按（　）分", ["形状", "颜色", "用途", "大小"], "形状", "按形状。"),
    ch("分一分与整理", 2, "同一堆积木，下面说法正确的是（　）", ["可以按颜色分，也可以按形状分", "只能按颜色分", "只能按形状分", "不能分"], "可以按颜色分，也可以按形状分", "标准多样。"),
  ]),
  unit(4, "认位置", [
    { name: "上下、前后", desc: "会用上下、前后描述位置。", d: 1, core: "上下：位置高的为上、低的为下；前后：面对的一方为前、背对的一方为后。", formula: "上 / 下 / 前 / 后", mistakes: ["不说参照物就说上下。"], tips: "先说明以谁为参照。" },
    { name: "左右", desc: "会辨认左右。", d: 1, core: "通常写字的手是右手，另一边是左手；左右会随身体朝向改变而改变。", formula: "左 / 右", mistakes: ["以为左右永远不变。"], tips: "左右相对。" },
  ], [
    ch("上下、前后", 1, "国旗挂在黑板的（　）方", ["上", "下", "前", "后"], "上", "国旗在上方。"),
    ch("上下、前后", 1, "我在妈妈的前面，妈妈就在我的（　）", ["后面", "前面", "上面", "左面"], "后面", "前后相对。"),
    ch("左右", 1, "通常我们写字的手是（　）", ["右手", "左手", "双脚", "不一定"], "右手", "多数人右手写字。"),
    tf("上下、前后", 1, "上和下是相对的。", "对", "相对位置。"),
  ], [
    ch("左右", 2, "面对北方时，我们的左边是（　）", ["西", "东", "南", "北"], "西", "面北左西。"),
    ch("上下、前后", 2, "书在书包里面，书包就在书的（　）", ["外面", "里面", "上面", "下面"], "外面", "内外相对。"),
    tf("左右", 2, "左右是相对的，会随朝向改变。", "对", "相对位置。"),
    ch("上下、前后", 2, "排队做操，小明前面有 3 人，这一排小明排第（　）", ["4", "3", "5", "1"], "4", "前面 3 人，小明第 4。"),
  ]),
  unit(5, "认识10以内的数", [
    { name: "1~10 的认识与顺序", desc: "会读写 1~10 并按顺序排列。", d: 1, core: "1~10 依次增大；后面的数比前面的数大，前面的数比后面的数小。", formula: "1 < 2 < 3 < … < 10", mistakes: ["顺序记混。"], tips: "顺着数越来越大。" },
    { name: "0 的认识与大小比较", desc: "认识 0 并会比较大小。", d: 2, core: "0 表示没有，也表示起点，比 1 小；用 =、>、< 比较两数大小，开口朝大数。", formula: "$=$ / $>$ / $<$", mistakes: ["> 与 < 方向写反。"], tips: "开口朝大数，尖尖朝小数。" },
  ], [
    ch("1~10 的认识与顺序", 1, "「0」表示（　）", ["一个也没有", "1 个", "很多", "最大"], "一个也没有", "0 表示没有。"),
    ch("0 的认识与大小比较", 2, "5 ○ 3，○ 里应填（　）", [">", "<", "=", "无法确定"], ">", "5 > 3。"),
    ca("1~10 的认识与顺序", 1, "按顺序填数：7、8、___、10，横线上是几？", 9, "8 后面是 9。"),
    tf("0 的认识与大小比较", 1, "0 比 1 小。", "对", "0 < 1。"),
  ], [
    ch("0 的认识与大小比较", 2, "8 ○ 8，○ 里应填（　）", ["=", ">", "<", "无法确定"], "=", "两边相等。"),
    tf("1~10 的认识与顺序", 2, "10 是 1~10 中最大的数。", "对", "10 最大。"),
    ch("1~10 的认识与顺序", 2, "「几」表示（　）", ["数量", "顺序", "位置", "方向"], "数量", "几表数量。"),
    ch("0 的认识与大小比较", 3, "下面最大的是（　）", ["9", "8", "10", "1"], "10", "10 最大。"),
  ]),
  unit(6, "认识图形（一）", [
    { name: "立体图形", desc: "认识长方体、正方体、圆柱、球。", d: 1, core: "长方体 6 个面、正方体 6 个面一样大、圆柱上下一样粗、球没有平面会滚动。", formula: "长方体 / 正方体 / 圆柱 / 球", mistakes: ["把球说成圆。"], tips: "球是立体，圆是平面。" },
    { name: "有趣的拼搭", desc: "会搭积木、滚一滚、堆一堆。", d: 1, core: "同样的立体图形可以拼搭成新形状；圆柱和球容易滚动，长方体、正方体容易堆稳。", formula: "拼搭 / 滚动 / 堆积", mistakes: ["认为球能稳稳堆高。"], tips: "球爱滚，方体稳。" },
  ], [
    ch("立体图形", 1, "粉笔盒的形状大概是（　）", ["长方体", "正方体", "球", "圆柱"], "长方体", "粉笔盒近长方体。"),
    ch("立体图形", 1, "足球的形状是（　）", ["球", "圆", "圆柱", "正方体"], "球", "足球是球体。"),
    tf("立体图形", 1, "圆柱的上下两个面一样大。", "对", "底面全等。"),
    ch("立体图形", 1, "正方体有（　）个面", ["6", "4", "8", "12"], "6", "6 个面。"),
  ], [
    tf("立体图形", 2, "球没有平平的面。", "对", "球面是曲面。"),
    ch("立体图形", 2, "易拉罐的形状大概是（　）", ["圆柱", "球", "正方体", "长方体"], "圆柱", "上下一样粗。"),
    ch("有趣的拼搭", 2, "堆得最稳的图形是（　）", ["正方体", "球", "圆柱", "一样稳"], "正方体", "方体有平面好堆。"),
    tf("有趣的拼搭", 2, "圆柱躺着放容易滚动。", "对", "侧面是曲面。"),
  ]),
  unit(7, "分与合", [
    { name: "2~10 的分与合", desc: "掌握数的分与合。", d: 2, core: "把一个数分成两部分叫「分」，两部分合成原来的数叫「合」；分与合互逆。", formula: "5 = 1 + 4", mistakes: ["分与合混淆。"], tips: "分成是拆开，合成是合并。" },
    { name: "分与合的应用", desc: "会用分与合算加减法。", d: 2, core: "看到 9、8 想凑十：把其中一个数分成 1 和几，先凑十再算。", formula: "凑十法", mistakes: ["进位加法忘记拆数。"], tips: "凑十是关键。" },
  ], [
    fb("2~10 的分与合", 2, "5 可以分成 2 和 ___。", 3, "2 + 3 = 5。"),
    ch("2~10 的分与合", 2, "7 可以分成 3 和（　）", ["4", "3", "5", "6"], "4", "3 + 4 = 7。"),
    tf("2~10 的分与合", 2, "分与合是互逆的。", "对", "拆开与合并互逆。"),
    ca("2~10 的分与合", 2, "10 可以分成 1 和几？", 9, "1 + 9 = 10。"),
  ], [
    fb("2~10 的分与合", 3, "8 可以分成 5 和 ___。", 3, "5 + 3 = 8。"),
    ch("分与合的应用", 3, "算 9 + 5 时，把 5 分成 1 和（　）", ["4", "5", "1", "6"], "4", "9 和 1 凑十，5 分成 1 和 4。"),
    tf("分与合的应用", 3, "10 的分与合要记熟，能帮助计算。", "对", "凑十法基础。"),
    ch("2~10 的分与合", 3, "哪两个数合成 9？（　）", ["4 和 5", "3 和 4", "5 和 6", "2 和 6"], "4 和 5", "4 + 5 = 9。"),
  ]),
  unit(8, "10以内的加法和减法", [
    { name: "10 以内的加法", desc: "掌握 10 以内加法。", d: 1, core: "把两部分合起来用加法；可用分与合、接着数、凑十法计算。", formula: "$a+b=c$", mistakes: ["把加法当减法。"], tips: "合起来用加法。" },
    { name: "10 以内的减法", desc: "掌握 10 以内减法。", d: 2, core: "从总数里去掉一部分求剩下用减法；可用「想加算减」。", formula: "$a-b=c$", mistakes: ["减法顺序颠倒。"], tips: "总数减去掉的部分。" },
    { name: "连加、连减与加减混合", desc: "会算两步式题。", d: 3, core: "连加、连减、加减混合都按从左到右的顺序计算。", formula: "从左到右", mistakes: ["先算右边的。"], tips: "从左往右算。" },
  ], [
    ...arith("10 以内的加法", 1, [[3, 4], [2, 5], [6, 3]], "+"),
    ...arith("10 以内的减法", 2, [[9, 5], [8, 3]], "-"),
    ch("10 以内的加法", 1, "树上有 4 只鸟，又飞来 2 只，一共（　）只", ["6", "5", "7", "8"], "6", "4 + 2 = 6。"),
  ], [
    ca("连加、连减与加减混合", 3, "2 + 3 + 4 = ？", 9, "2 + 3 = 5，5 + 4 = 9。"),
    ca("连加、连减与加减混合", 3, "9 − 2 − 3 = ？", 4, "9 − 2 = 7，7 − 3 = 4。"),
    ca("连加、连减与加减混合", 3, "10 − 4 + 2 = ？", 8, "10 − 4 = 6，6 + 2 = 8。"),
    tf("连加、连减与加减混合", 3, "两步式题按从左到右的顺序计算。", "对", "运算顺序。"),
  ]),
]);
// ════════════════════════════════════════════════════════════════════
// 四、初中数学（默认版本 = 人教版；此处为非默认版本）
// ════════════════════════════════════════════════════════════════════

// —— 北师大版 数学七年级上册（第一章~第六章）——
writeBook(M, "北师大版 · 数学七年级上册", "七年级上册", [
  unit(1, "第一章 丰富的图形世界", [
    { name: "几何体与展开图", desc: "认识常见几何体并会判断展开图。", d: 2, core: "棱柱、棱锥、圆柱、圆锥、球是最基本的几何体。正方体有 11 种展开图，相对的两个面在展开图中隔一个正方形。", formula: "正方体有 11 种展开图", mistakes: ["把「田」字形展开当作正方体展开图。"], tips: "「田」字形与「凹」字形不能折成正方体。" },
    { name: "从三个方向看与截面", desc: "掌握三视图与截面形状判断。", d: 3, core: "从正面、左面、上面三个方向看到的图形叫三视图。用平面截几何体，截面形状与截法有关：截正方体可得到三角形、四边形、五边形、六边形。", formula: "截面边数 ≤ 面数", mistakes: ["认为球的截面是圆以外的形状。"], tips: "球的任何截面都是圆。" },
    { name: "点、线、面、体", desc: "理解点线面体的关系。", d: 2, core: "点动成线、线动成面、面动成体；几何体由面围成，面与面相交成线，线与线相交成点。", formula: "点动成线，线动成面，面动成体", mistakes: ["把「点」当成有大小。"], tips: "点没有大小，只有位置。" },
  ], [
    ch("几何体与展开图", 1, "下列几何体中，表面都是平面的是（　）", ["正方体", "球", "圆柱", "圆锥"], "正方体", "正方体的面都是平面。"),
    ch("几何体与展开图", 3, "正方体的展开图共有（　）种", ["11", "6", "8", "12"], "11", "正方体有 11 种展开图。"),
    tf("从三个方向看与截面", 2, "球从任何方向看到的形状都是圆。", "对", "三视图均为圆。"),
    ch("从三个方向看与截面", 3, "用平面截一个正方体，截面不可能是（　）", ["三角形", "五边形", "六边形", "七边形"], "七边形", "正方体只有 6 个面，截面最多六边形。"),
    tf("点、线、面、体", 2, "点动成线，线动成面，面动成体。", "对", "点线面体的关系。"),
  ], [
    ch("几何体与展开图", 3, "圆柱的侧面展开图是（　）", ["长方形", "三角形", "圆形", "扇形"], "长方形", "圆柱侧面展开为长方形。"),
    ch("几何体与展开图", 3, "一个棱柱有 12 个顶点，它是（　）", ["六棱柱", "五棱柱", "七棱柱", "十二棱柱"], "六棱柱", "12 个顶点 ÷ 2 = 6 条侧棱。"),
    tf("从三个方向看与截面", 3, "圆锥的侧面展开图是扇形。", "对", "圆锥侧面展开为扇形。"),
    ch("点、线、面、体", 3, "「面动成」的几何现象是（　）", ["体", "线", "点", "角"], "体", "面动成体。"),
  ]),
  unit(2, "第二章 有理数及其运算", [
    { name: "有理数与数轴", desc: "理解有理数概念与数轴。", d: 3, core: "整数和分数统称有理数。规定了原点、正方向、单位长度的直线叫数轴；数轴上右边的数总比左边的大。", formula: "数轴三要素：原点、正方向、单位长度", mistakes: ["误以为 0 不是有理数。"], tips: "比较两个负数，绝对值大的反而小。" },
    { name: "相反数与绝对值", desc: "掌握相反数与绝对值。", d: 3, core: "只有符号不同的两个数互为相反数，0 的相反数是 0。$|a|$ 表示 $a$ 到原点的距离，绝对值非负。", formula: "$|-a|=|a|$", mistakes: ["认为 $|a|=a$ 恒成立。"], tips: "先判断符号再求绝对值。" },
    { name: "有理数的运算与科学记数法", desc: "掌握四则运算与乘方。", d: 3, core: "同号相乘得正、异号得负；除以一个非零数等于乘它的倒数。科学记数法写成 $a\\times10^n$（$1\\le|a|<10$）。", formula: "$a\\times10^n\\ (1\\le|a|<10)$", mistakes: ["$a$ 的范围写错。"], tips: "先定符号，再算绝对值。" },
  ], [
    ca("有理数与数轴", 2, "$-6$ 的绝对值是多少？", 6, "$|-6|=6$。"),
    ca("相反数与绝对值", 2, "$-\\frac34$ 的倒数是多少（填分数如 -4/3）？", "-4/3", "倒数为 $-\\frac43$。"),
    ...arith("有理数的运算与科学记数法", 3, [[-7, 4], [-5, -9]], "+"),
    ca("有理数的运算与科学记数法", 3, "$(-3)^2$ 的值是多少？", 9, "负数的偶次幂为正。"),
    fb("有理数的运算与科学记数法", 3, "用科学记数法表示 56000 为 $5.6\\times10^n$，$n=$ ___", 4, "$56000=5.6\\times10^4$。"),
  ], [
    ca("有理数的运算与科学记数法", 3, "计算：$-2^3=$ ？", -8, "先乘方后取负：$-8$。"),
    ca("相反数与绝对值", 3, "数轴上表示 $-3$ 的点与表示 $2$ 的点之间的距离是多少？", 5, "$2-(-3)=5$。"),
    fb("相反数与绝对值", 2, "0 的相反数是 ___。", 0, "0 的相反数仍是 0。"),
    tf("有理数的运算与科学记数法", 3, "两个负数相乘，积为正数。", "对", "同号得正。"),
  ]),
  unit(3, "第三章 整式及其加减", [
    { name: "字母表示数与代数式求值", desc: "会用字母表示数并求值。", d: 3, core: "用字母表示数时书写规范：数字写在字母前面，如 $3a$；代数式求值就是代入数值计算。", formula: "速度 $v=\\frac st$", mistakes: ["书写顺序不规范（a3）。"], tips: "数字在前、字母在后。" },
    { name: "整式与合并同类项", desc: "掌握整式加减运算。", d: 3, core: "单项式的数字因数是系数，所有字母指数之和是次数。同类项字母相同且相同字母指数相同，合并时系数相加。", formula: "$5a^2b-3a^2b=2a^2b$", mistakes: ["把 $a^2$ 与 $a$ 当同类项。"], tips: "先判断是否同类项。" },
    { name: "去括号与整式加减", desc: "掌握去括号法则。", d: 3, core: "括号前是「+」，去括号各项不变号；括号前是「−」，去括号各项都变号。整式加减 = 去括号 + 合并同类项。", formula: "$a-(b-c)=a-b+c$", mistakes: ["括号前是减号时只变第一项符号。"], tips: "把括号连同前面的符号一起处理。" },
  ], [
    fb("字母表示数与代数式求值", 2, "每本练习本 $a$ 元，买 5 本需 ___ 元。", "5a", "用 5a 表示。"),
    ca("字母表示数与代数式求值", 3, "当 $x=3$ 时，代数式 $2x+1$ 的值是多少？", 7, "$2\\times3+1=7$。"),
    ca("整式与合并同类项", 3, "合并同类项：$7m-3m+2m=$ ？（填最简形式）", "6m", "$(7-3+2)m=6m$。"),
    fb("整式与合并同类项", 3, "单项式 $-4x^2y$ 的系数是 ___。", -4, "数字因数 $-4$。"),
    fb("去括号与整式加减", 3, "化简：$a-(b-c)=$ ___", "a-b+c", "去括号变号：$a-b+c$。"),
  ], [
    ca("去括号与整式加减", 4, "$2(a+3)-(a-1)$ 化简后 $a$ 的系数是多少？", 1, "化简得 $a+7$。"),
    tf("字母表示数与代数式求值", 3, "代数式 $3a$ 表示 3 与 $a$ 的乘积。", "对", "数字与字母相乘。"),
    ch("整式与合并同类项", 3, "下列是同类项的是（　）", ["$2a^2b$ 与 $-5a^2b$", "$3x$ 与 $3y$", "$x^2$ 与 $x$", "$ab$ 与 $abc$"], "$2a^2b$ 与 $-5a^2b$", "字母相同且指数相同。"),
    ca("整式与合并同类项", 3, "合并同类项：$3x+5x-2x=$ ？（填最简形式）", "6x", "$(3+5-2)x=6x$。"),
  ]),
  unit(4, "第四章 基本平面图形", [
    { name: "线段、射线与直线", desc: "掌握三种线的表示与性质。", d: 2, core: "线段有两个端点、可以度量；射线有一个端点、向一方无限延伸；直线没有端点、向两方无限延伸。两点确定一条直线。", formula: "两点确定一条直线", mistakes: ["认为直线可以度量长度。"], tips: "只有线段能量长度。" },
    { name: "角的认识与度量", desc: "认识角并会表示与度量。", d: 2, core: "有公共端点的两条射线组成的图形是角；1 直角 = 90°，1 平角 = 180°，1 周角 = 360°；1° = 60′。", formula: "$1^\\circ=60'$", mistakes: ["把平角当成直线。"], tips: "平角有顶点和两边。" },
    { name: "角的比较与运算", desc: "会比较角的大小并进行和差运算。", d: 3, core: "角的大小与边的长短无关，与张口大小有关；余角和为 90°，补角和为 180°。", formula: "余角之和 = 90°，补角之和 = 180°", mistakes: ["余角与补角混淆。"], tips: "余 90 补 180。" },
  ], [
    ch("线段、射线与直线", 2, "线段有（　）个端点", ["2", "1", "0", "3"], "2", "线段两个端点。"),
    tf("线段、射线与直线", 2, "射线有一个端点。", "对", "一个端点。"),
    ch("角的认识与度量", 2, "1 直角等于（　）", ["90°", "180°", "360°", "60°"], "90°", "直角 90°。"),
    ca("角的比较与运算", 3, "一个角为 35°，它的余角是多少度？", 55, "$90°-35°=55°$。"),
    ca("角的比较与运算", 3, "一个角为 110°，它的补角是多少度？", 70, "$180°-110°=70°$。"),
  ], [
    tf("线段、射线与直线", 3, "两点确定一条直线。", "对", "直线公理。"),
    ch("角的认识与度量", 3, "1° 的 $\\frac1{60}$ 是（　）", ["1′", "1″", "1°", "60′"], "1′", "1 度 = 60 分。"),
    ca("角的比较与运算", 4, "∠1 = 25°，∠2 = 65°，两角之和是多少度？", 90, "$25°+65°=90°$，互为余角。"),
    ch("角的比较与运算", 3, "互为余角的两个角和为（　）", ["90°", "180°", "270°", "360°"], "90°", "余角和 90°。"),
  ]),
  unit(5, "第五章 一元一次方程", [
    { name: "方程与一元一次方程", desc: "理解方程意义，会判断一元一次方程。", d: 2, core: "含未知数的等式叫方程；只含一个未知数、次数为 1、两边都是整式的方程叫一元一次方程。", formula: "$ax+b=0\\ (a\\ne0)$", mistakes: ["把 $\\frac1x=2$ 当一元一次方程。"], tips: "看三点：一个未知数、次数 1、整式。" },
    { name: "等式的性质与解方程", desc: "掌握等式性质，会移项、合并解方程。", d: 3, core: "等式两边同加（减）同一个数或式子仍相等；两边同乘（除以非零数）仍相等。移项要变号。", formula: "$a=b\\Rightarrow a\\pm c=b\\pm c$", mistakes: ["移项忘记变号。"], tips: "移项 = 过桥变号。" },
    { name: "列方程解应用题", desc: "用一元一次方程解决和差倍分、行程等实际问题。", d: 3, core: "找等量关系是核心。常见模型：和差倍分、行程（$s=vt$）、工程、销售。", formula: "$s=vt$", mistakes: ["单位不统一。"], tips: "先找等量关系再设未知数。" },
  ], [
    ch("方程与一元一次方程", 2, "下列是一元一次方程的是（　）", ["$2x-3=5$", "$x^2+1=0$", "$\\frac1x=2$", "$xy=6$"], "$2x-3=5$", "满足一元一次方程定义。"),
    tf("方程与一元一次方程", 1, "$x=3$ 是方程 $2x-1=5$ 的解。", "对", "代入 $2\\times3-1=5$ 成立。"),
    fb("等式的性质与解方程", 2, "解方程 $x+5=12$，$x=$ ___", 7, "$x=12-5=7$。"),
    ...genLinear("等式的性质与解方程", 3, [[5, -3, 17], [4, 8, 32]]),
    ca("列方程解应用题", 3, "某数的 4 倍加 5 等于 25，这个数是多少？", 5, "设数为 $x$，$4x+5=25$，$x=5$。"),
  ], [
    ca("等式的性质与解方程", 4, "解方程 $3(x-2)=9$，$x=$ ？", 5, "$x-2=3$，$x=5$。"),
    ch("方程与一元一次方程", 3, "若 $2x^m+1=0$ 是一元一次方程，$m=$（　）", ["1", "0", "2", "-1"], "1", "次数为 1，故 $m=1$。"),
    ca("列方程解应用题", 3, "长方形长 8 cm，面积 48 cm²，宽是多少 cm？", 6, "$8x=48$，$x=6$。"),
    fb("等式的性质与解方程", 3, "解方程 $5x=20$，$x=$ ___", 4, "$x=4$。"),
  ]),
  unit(6, "第六章 数据的收集与整理", [
    { name: "数据的收集与表示", desc: "掌握数据收集方法。", d: 2, core: "收集数据的方法有调查、测量、实验等；数据可以用统计表和统计图表示。", formula: "收集 → 整理 → 表示", mistakes: ["凭感觉编数据。"], tips: "数据要真实。" },
    { name: "普查与抽样调查", desc: "理解两种调查方式。", d: 3, core: "对所有对象全面调查叫普查；只调查一部分叫抽样调查，用样本估计总体。", formula: "普查 / 抽样调查", mistakes: ["破坏性调查也用普查。"], tips: "对象太多或有破坏性用抽样。" },
    { name: "统计图的选择", desc: "会根据目的选统计图。", d: 3, core: "条形统计图看数量多少；折线统计图看增减变化；扇形统计图看各部分与总数的关系。", formula: "条形 / 折线 / 扇形", mistakes: ["看占比却用条形图。"], tips: "看变化用折线，看占比用扇形。" },
  ], [
    ch("数据的收集与表示", 2, "要了解全班同学最喜欢的水果，应采用（　）", ["调查统计", "猜测", "计算", "测量"], "调查统计", "收集数据用调查。"),
    ch("普查与抽样调查", 3, "了解全国人口情况，采用（　）", ["普查", "抽样调查", "估算", "不调查"], "普查", "全国人口普查。"),
    ch("统计图的选择", 3, "反映一周气温的增减变化，选（　）", ["折线统计图", "条形统计图", "扇形统计图", "表格"], "折线统计图", "变化看折线。"),
    tf("普查与抽样调查", 3, "抽样调查适用于对象较多的情况。", "对", "抽样估计总体。"),
  ], [
    ch("统计图的选择", 3, "要清楚看出各部分与总数的关系，选（　）", ["扇形统计图", "条形统计图", "折线统计图", "复式统计表"], "扇形统计图", "占比看扇形。"),
    ch("统计图的选择", 4, "比较各班人数多少，选（　）", ["条形统计图", "扇形统计图", "折线统计图", "雷达图"], "条形统计图", "数量多少看条形。"),
    tf("数据的收集与表示", 3, "统计数据要真实，不能编造。", "对", "数据真实性。"),
    ch("普查与抽样调查", 4, "检测一批灯泡的使用寿命，宜采用（　）", ["抽样调查", "普查", "全部测到坏", "不检测"], "抽样调查", "破坏性检测用抽样。"),
  ]),
]);

// —— 浙教版 数学七年级上册（第 1-6 章）——
writeBook(M, "浙教版 · 数学七年级上册", "七年级上册", [
  unit(1, "第1章 有理数", [
    { name: "从自然数到有理数", desc: "理解有理数的概念与分类。", d: 3, core: "整数和分数统称有理数。有理数可按正负分类：正有理数、0、负有理数。", formula: "整数 + 分数 = 有理数", mistakes: ["认为 0 是正数或负数。"], tips: "0 既不是正数也不是负数。" },
    { name: "数轴", desc: "会用数轴表示有理数。", d: 3, core: "规定了原点、正方向、单位长度的直线叫数轴。数轴上右边的数总比左边的大。", formula: "数轴三要素", mistakes: ["画数轴漏标单位长度。"], tips: "原点、正方向、单位长度缺一不可。" },
    { name: "绝对值与有理数大小比较", desc: "掌握绝对值与大小比较。", d: 3, core: "$|a|$ 表示数轴上 $a$ 到原点的距离。正数 > 0 > 负数；两个负数比较，绝对值大的反而小。", formula: "$|a|\\ge0$", mistakes: ["比较负数时认为绝对值大的更大。"], tips: "负数比较：绝对值大的反而小。" },
  ], [
    ch("从自然数到有理数", 3, "下列各数中属于有理数的是（　）", ["$-3$", "$\\pi$", "$\\sqrt2$", "无限不循环小数"], "$-3$", "$-3$ 是负整数，属于有理数。"),
    tf("从自然数到有理数", 2, "0 是正数。", "错", "0 既不是正数也不是负数。"),
    fb("绝对值与有理数大小比较", 2, "$-7$ 的绝对值是 ___。", 7, "$|-7|=7$。"),
    ca("绝对值与有理数大小比较", 2, "数轴上表示 $-3$ 的点与表示 $2$ 的点之间的距离是多少？", 5, "$2-(-3)=5$。"),
    ch("绝对值与有理数大小比较", 3, "$-5$ 与 $-3$ 比较，较大的是（　）", ["$-3$", "$-5$", "一样大", "无法比较"], "$-3$", "两个负数，绝对值大的反而小。"),
  ], [
    ch("从自然数到有理数", 4, "下列说法正确的是（　）", ["整数和分数统称有理数", "0 是正有理数", "负数都是分数", "有理数不含 0"], "整数和分数统称有理数", "有理数定义。"),
    ch("数轴", 3, "数轴的三要素是（　）", ["原点、正方向、单位长度", "原点、正负、长度", "方向、长度、数字", "原点、方向、数字"], "原点、正方向、单位长度", "三要素缺一不可。"),
    tf("绝对值与有理数大小比较", 3, "绝对值等于本身的数是非负数。", "对", "$|a|=a$ 当 $a\\ge0$。"),
    fb("绝对值与有理数大小比较", 3, "$|0|=$ ___。", 0, "0 的绝对值是 0。"),
  ]),
  unit(2, "第2章 有理数的运算", [
    { name: "有理数的加减乘除", desc: "掌握有理数四则运算法则。", d: 3, core: "加法：同号取同号绝对值相加，异号取大绝对值加数符号、大减小。减法：减去一个数等于加上它的相反数。乘除：同号得正、异号得负，绝对值相乘除。", formula: "$a-b=a+(-b)$", mistakes: ["异号相加符号取错。"], tips: "减法统一成加法再算。" },
    { name: "有理数的乘方与混合运算", desc: "掌握乘方与运算顺序。", d: 3, core: "$a^n$ 表示 $n$ 个 $a$ 相乘；负数的奇次幂为负、偶次幂为正。混合运算顺序：先乘方，再乘除，后加减；有括号先算括号。", formula: "$(-2)^2=4$，$-2^2=-4$", mistakes: ["$-2^2$ 与 $(-2)^2$ 混淆。"], tips: "先定符号，再算绝对值。" },
    { name: "近似数", desc: "理解近似数与四舍五入。", d: 3, core: "用四舍五入法按要求的精确度取近似值；精确到哪一位，就看它的下一位。", formula: "四舍五入", mistakes: ["精确到十分位却看百分位。"], tips: "看保留位数的下一位。" },
  ], [
    ...arith("有理数的加减乘除", 3, [[-3, 5], [-8, -6], [7, -12]], "+"),
    ...arith("有理数的加减乘除", 3, [[-4, 6], [-15, -3], [12, -4]], "*"),
    ca("有理数的乘方与混合运算", 3, "计算：$(-2)^3=$ ？", -8, "$(-2)^3=-8$，负数的奇次幂为负。"),
    ca("有理数的乘方与混合运算", 3, "计算：$-8+3-(-5)=$ ？", 0, "$-8+3=-5$，$-5+5=0$。"),
  ], [
    fb("近似数", 3, "用四舍五入法把 3.14159 精确到 0.01，得 ___。", "3.14", "看千分位 1，舍去，得 3.14。"),
    ch("有理数的乘方与混合运算", 4, "计算 $-2^2$ 的结果是（　）", ["-4", "4", "-2", "2"], "-4", "先乘方后取负：$-4$。"),
    tf("有理数的乘方与混合运算", 3, "负数的偶次幂是正数。", "对", "如 $(-3)^2=9$。"),
    ca("有理数的加减乘除", 4, "计算：$-6+9$ 的结果是多少？", 3, "异号相加取正号，$9-6=3$。"),
  ]),
  unit(3, "第3章 实数", [
    { name: "平方根与算术平方根", desc: "掌握平方根概念。", d: 3, core: "若 $x^2=a$，则 $x$ 叫 $a$ 的平方根；正的非负数平方根记 $\\sqrt a$（算术平方根）。正数有两个互为相反数的平方根，0 的平方根是 0，负数没有平方根。", formula: "$\\sqrt a\\ (a\\ge0)$", mistakes: ["认为负数也有平方根。"], tips: "负数没有平方根。" },
    { name: "实数与数轴", desc: "理解实数与数轴对应。", d: 3, core: "无理数是无限不循环小数；有理数与无理数统称实数；实数与数轴上的点一一对应。", formula: "实数 ↔ 数轴上的点", mistakes: ["认为数轴上只有有理数。"], tips: "无理数也能在数轴上表示。" },
    { name: "立方根与实数的运算", desc: "掌握立方根与实数运算。", d: 3, core: "若 $x^3=a$，则 $x$ 叫 $a$ 的立方根，记 $\\sqrt[3]a$；任何实数都有且只有一个立方根。实数大小比较：正数 > 0 > 负数，原点右边越大。", formula: "$\\sqrt[3]a$", mistakes: ["认为负数没有立方根。"], tips: "负数有立方根。" },
  ], [
    ...genSqrt("平方根与算术平方根", 3, [16, 25, 9, 49]),
    ch("实数与数轴", 3, "$\\sqrt2$ 属于（　）", ["无理数", "有理数", "整数", "分数"], "无理数", "$\\sqrt2$ 是无限不循环小数。"),
    ...genCubeRoot("立方根与实数的运算", 3, [8, 27, -27]),
    tf("实数与数轴", 3, "实数与数轴上的点一一对应。", "对", "一一对应。"),
  ], [
    ca("立方根与实数的运算", 4, "$\\sqrt9+\\sqrt{16}=$ ？", 7, "$3+4=7$。"),
    ch("平方根与算术平方根", 3, "9 的平方根是（　）", ["±3", "3", "-3", "9"], "±3", "正数有两个互为相反数的平方根。"),
    tf("立方根与实数的运算", 3, "负数没有平方根，但有立方根。", "对", "$\\sqrt[3]{-8}=-2$。"),
    ch("实数与数轴", 4, "下列数中是无理数的是（　）", ["$\\pi$", "$\\frac12$", "0.333…（循环）", "-5"], "$\\pi$", "$\\pi$ 无限不循环。"),
  ]),
  unit(4, "第4章 代数式", [
    { name: "列代数式与代数式的值", desc: "会用字母表示数量关系并求值。", d: 3, core: "用字母表示数书写规范：数字与字母相乘、数字写在前面；代数式求值就是代入数值计算。", formula: "速度 $v=\\frac st$", mistakes: ["书写顺序不规范（a3）。"], tips: "数字在前、字母在后。" },
    { name: "整式与合并同类项", desc: "掌握整式概念与合并。", d: 3, core: "单项式的数字因数是系数，所有字母指数之和是次数。几个单项式的和是多项式。同类项合并时系数相加。", formula: "$ax+bx=(a+b)x$", mistakes: ["把 $x^2$ 与 $x$ 当同类项。"], tips: "先标同类项再合并。" },
    { name: "整式的加减", desc: "掌握去括号与整式加减。", d: 3, core: "括号前是「+」去括号不变号，括号前是「−」去括号都变号；整式加减步骤：去括号、合并同类项。", formula: "$a-(b-c)=a-b+c$", mistakes: ["括号前是减号时只变第一项。"], tips: "把括号连同前面符号一起处理。" },
  ], [
    fb("列代数式与代数式的值", 2, "每本练习本 $a$ 元，买 5 本需 ___ 元。", "5a", "用 5a 表示。"),
    ca("列代数式与代数式的值", 3, "当 $x=3$ 时，代数式 $2x+1$ 的值是多少？", 7, "$2\\times3+1=7$。"),
    ca("整式与合并同类项", 3, "合并同类项：$7m-3m+2m=$ ？（填最简形式）", "6m", "$(7-3+2)m=6m$。"),
    fb("整式与合并同类项", 3, "单项式 $-4x^2y$ 的系数是 ___。", -4, "数字因数 $-4$。"),
    fb("整式的加减", 3, "化简：$3a-(2a-1)=$ ___", "a+1", "$3a-2a+1=a+1$。"),
  ], [
    ca("整式的加减", 4, "$2(a+3)-(a-1)$ 化简后 $a$ 的系数是多少？", 1, "化简得 $a+7$。"),
    ch("整式与合并同类项", 3, "单项式 $5a^2b^3$ 的次数是（　）", ["5", "2", "3", "6"], "5", "$2+3=5$。"),
    tf("列代数式与代数式的值", 3, "代数式 $3a$ 表示 3 与 $a$ 的乘积。", "对", "数字与字母相乘。"),
    ca("整式与合并同类项", 4, "合并同类项：$4m-7m$ 得（　）", ["$-3m$", "$3m$", "$11m$", "$-11m$"], "$-3m$", "$4-7=-3$。"),
  ]),
  unit(5, "第5章 一元一次方程", [
    { name: "认识方程与等式的性质", desc: "理解方程意义与等式性质。", d: 2, core: "含未知数的等式叫方程。等式性质：两边同加（减）同一个数仍相等；两边同乘（除以非零数）仍相等。", formula: "$a=b\\Rightarrow a\\pm c=b\\pm c$", mistakes: ["等式两边除以 0。"], tips: "除以的数不能为 0。" },
    { name: "一元一次方程的解法", desc: "掌握解方程的一般步骤。", d: 3, core: "解一元一次方程：去分母、去括号、移项、合并同类项、系数化为 1。移项要变号。", formula: "去分母 → 去括号 → 移项 → 合并 → 系数化 1", mistakes: ["移项忘记变号。"], tips: "移项 = 过桥变号。" },
    { name: "一元一次方程的应用", desc: "会用方程解决实际问题。", d: 3, core: "列方程解应用题：审、设、列、解、验、答；关键是从中找到等量关系。", formula: "和差倍分 / 行程 $s=vt$", mistakes: ["单位不统一。"], tips: "先找等量关系再设未知数。" },
  ], [
    ch("认识方程与等式的性质", 2, "下列是一元一次方程的是（　）", ["$2x-3=5$", "$x^2+1=0$", "$\\frac1x=2$", "$xy=6$"], "$2x-3=5$", "满足一元一次方程定义。"),
    fb("一元一次方程的解法", 2, "解方程 $x+5=12$，$x=$ ___", 7, "$x=12-5=7$。"),
    ...genLinear("一元一次方程的解法", 3, [[5, -3, 17], [4, 8, 32]]),
    ca("一元一次方程的解法", 4, "解方程 $3(x-2)=9$，$x=$ ？", 5, "$x-2=3$，$x=5$。"),
    ca("一元一次方程的应用", 3, "某数的 3 倍减去 5 等于 16，这个数是多少？", 7, "设数为 $x$，$3x-5=16$，$x=7$。"),
  ], [
    ch("认识方程与等式的性质", 3, "若 $2x^m+1=0$ 是一元一次方程，$m=$（　）", ["1", "0", "2", "-1"], "1", "次数为 1，故 $m=1$。"),
    fb("一元一次方程的解法", 3, "解方程 $5x=20$，$x=$ ___", 4, "$x=4$。"),
    ca("一元一次方程的应用", 4, "长方形长比宽多 3 cm，周长 26 cm，宽是多少 cm？", 5, "$2(x+x+3)=26$，$x=5$。"),
    tf("一元一次方程的解法", 3, "移项时要注意变号。", "对", "移项变号。"),
  ]),
  unit(6, "第6章 图形的初步知识", [
    { name: "几何图形与线", desc: "认识几何图形与线段射线直线。", d: 2, core: "几何图形分立体图形与平面图形；线段有两个端点、射线有一个端点、直线没有端点。两点确定一条直线。", formula: "两点确定一条直线", mistakes: ["认为直线可以度量。"], tips: "只有线段能量长度。" },
    { name: "线段的长短比较与和差", desc: "会比较线段并进行和差计算。", d: 3, core: "两点之间线段最短；用圆规截取可比较长短；线段和差：若 C 在 AB 上，则 AB = AC + CB。", formula: "两点之间，线段最短", mistakes: ["以为两点之间直线最短（直线无限延伸）。"], tips: "是「线段」最短。" },
    { name: "角与角的度量、余角和补角", desc: "掌握角的度量与运算。", d: 3, core: "角由有公共端点的两条射线组成；1° = 60′，1′ = 60″；余角和为 90°，补角和为 180°。", formula: "$1^\\circ=60'$，$1'=60''$", mistakes: ["余角与补角混淆。"], tips: "余 90 补 180。" },
  ], [
    ch("几何图形与线", 2, "两点可以确定（　）", ["一条直线", "两条直线", "一个平面", "一个圆"], "一条直线", "两点确定一条直线。"),
    tf("几何图形与线", 2, "线段有两个端点。", "对", "线段两端点。"),
    ca("线段的长短比较与和差", 3, "点 C 在线段 AB 上，AB = 10 cm，AC = 4 cm，BC 是多少 cm？", 6, "$BC=AB-AC=10-4=6$。"),
    ca("角与角的度量、余角和补角", 3, "∠A = 35°，它的余角是多少度？", 55, "$90°-35°=55°$。"),
    ca("角与角的度量、余角和补角", 3, "一个角为 110°，它的补角是多少度？", 70, "$180°-110°=70°$。"),
  ], [
    ch("线段的长短比较与和差", 3, "两点之间，（　）最短", ["线段", "直线", "射线", "曲线"], "线段", "两点之间线段最短。"),
    ch("角与角的度量、余角和补角", 3, "1° 等于（　）", ["60′", "100′", "10′", "360′"], "60′", "1 度 = 60 分。"),
    ca("角与角的度量、余角和补角", 4, "∠1 = 25°，∠2 = 65°，两角之和是多少度？", 90, "$25°+65°=90°$，互为余角。"),
    tf("角与角的度量、余角和补角", 3, "角的大小与画出边的长短无关。", "对", "看张口大小。"),
  ]),
]);

// ══════════════════════ 统计输出 ══════════════════════
console.log(`✅ 多版本内容生成完成：教材 ${stats.books} 本 / 单元 ${stats.units} 个 / 题目 ${stats.questions} 道`);
console.log(`   输出目录：${OUTPUT}`);
