"use client";

/**
 * JumpClient —— ⚡ 跳级测试（jump ahead，E2）
 *
 * 口径（双端拍板）：
 *   - 从目标单元之前所有单元的课程题库均匀抽 15 题（core sampleJumpQuestions）；
 *   - 无课前讲解、无跳过；通过线 accuracy ≥ 0.80（core JUMP_PASS_ACCURACY）；
 *   - 通过：之前所有未完成课程批量 completed{stars:1, accuracy:0.8}
 *     （store.jumpAheadComplete，不发 XP/宝石——防刷）+ 庆祝幕 + 返回路径；
 *   - 失败：扣 1 颗红心，可重试（换 seed 换一套题）；0 心时弹补心；
 *   - 测试是合成会话：不写 completedLessons、不入错题本、不持久化进度。
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { motion, AnimatePresence, useAnimation, useReducedMotion } from "framer-motion";
import {
  sampleJumpQuestions,
  JUMP_TEST_SIZE,
  JUMP_PASS_ACCURACY,
  type JumpQuestionSource,
  type JumpSampledQuestion,
} from "@cstf/core/jump";
import type { Lesson } from "@/types";
import type { PathLessonMeta } from "@cstf/core";
import { gradeAnswer } from "@/lib/grade";
import { useProgressStore, MAX_HEARTS, HEART_REFILL_COST } from "@/store/progress";
import { QuestionRenderer, type QuestionPhase } from "@/components/question/QuestionRenderer";
import { Mascot } from "@/components/Mascot";
import { Modal } from "@/components/Modal";
import { SoundLink } from "@/components/SoundLink";
import { MuteToggle, useSyncMute } from "@/components/MuteToggle";
import { Close, Gem, Heart, Lightning, Crown } from "@/components/icons";
import { FeedbackPanel } from "@/components/FeedbackPanel";
import { playSfx } from "@/lib/sfx";
import { haptic } from "@/lib/haptic";

const ConfettiCanvas = dynamic(
  () => import("@/components/ConfettiCanvas").then(m => ({ default: m.ConfettiCanvas })),
  { ssr: false },
);

interface OutlineFile {
  lessons: PathLessonMeta[];
  units?: Array<{ unit_number: number; title: string }>;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | {
      kind: "ready";
      sources: JumpQuestionSource[];
      priorLessonIds: string[];
      unitTitle: string;
    };

function newSeed(): string {
  return `jump-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function JumpClient() {
  useSyncMute();
  const searchParams = useSearchParams();
  const bookId = searchParams.get("book") ?? "";
  const unitNumber = Number(searchParams.get("unit") ?? "0");

  const loseHeart = useProgressStore(s => s.loseHeart);
  const jumpAheadComplete = useProgressStore(s => s.jumpAheadComplete);
  const buyHeartRefill = useProgressStore(s => s.buyHeartRefill);
  const hearts = useProgressStore(s => s.hearts);
  const gems = useProgressStore(s => s.gems);

  // ============ 数据装载：outline → 前置课程题库 ============
  const [load, setLoad] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    async function fetchAll() {
      if (!bookId || !Number.isInteger(unitNumber) || unitNumber < 2) {
        setLoad({ kind: "error", message: "跳级链接不完整，回到路径再试一次吧" });
        return;
      }
      try {
        const outlineRes = await fetch(`/data/books/${bookId}/outline.json`);
        if (!outlineRes.ok) throw new Error("outline");
        const outline: OutlineFile = await outlineRes.json();
        const prior = outline.lessons.filter(l => l.unitNumber < unitNumber);
        if (prior.length === 0) {
          if (!cancelled) {
            setLoad({ kind: "error", message: "前面还没有课程，不需要跳级哦" });
          }
          return;
        }
        const lessons = await Promise.all(
          prior.map(async (meta): Promise<JumpQuestionSource | null> => {
            try {
              const res = await fetch(`/data/books/${bookId}/lessons/${meta.id}.json`);
              if (!res.ok) return null;
              const lesson: Lesson = await res.json();
              return { lessonId: meta.id, questions: lesson.questions };
            } catch {
              return null;
            }
          }),
        );
        const sources = lessons.filter((s): s is JumpQuestionSource => s !== null);
        if (cancelled) return;
        if (sources.length === 0) {
          setLoad({ kind: "error", message: "题目没有加载出来，检查一下网络再试吧" });
          return;
        }
        const unitTitle =
          outline.units?.find(u => u.unit_number === unitNumber)?.title ??
          outline.lessons.find(l => l.unitNumber === unitNumber)?.unitTitle ??
          "";
        setLoad({
          kind: "ready",
          sources,
          priorLessonIds: prior.map(l => l.id),
          unitTitle,
        });
      } catch {
        if (!cancelled) {
          setLoad({ kind: "error", message: "题目没有加载出来，检查一下网络再试吧" });
        }
      }
    }
    void fetchAll();
    return () => {
      cancelled = true;
    };
  }, [bookId, unitNumber]);

  // ============ 组卷（换 seed = 换一套题） ============
  const [seed, setSeed] = useState(newSeed);
  const questions = useMemo<JumpSampledQuestion[]>(
    () =>
      load.kind === "ready"
        ? sampleJumpQuestions(load.sources, JUMP_TEST_SIZE, seed)
        : [],
    [load, seed],
  );

  // ============ 答题状态（合成会话：不持久化、不入错题本） ============
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [phase, setPhase] = useState<QuestionPhase>("answering");
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [result, setResult] = useState<"pass" | "fail" | null>(null);
  const [passedCount, setPassedCount] = useState(0);
  // 0 心补心遮罩（入口 & 重试共用）
  const [gateOpen, setGateOpen] = useState(false);
  const gateCheckedRef = useRef(false);
  const shakeControls = useAnimation();
  const prefersReduced = useReducedMotion();

  // 入口 0 心检查：先结算自然回心，仍为 0 → 弹补心
  useEffect(() => {
    if (gateCheckedRef.current) return;
    gateCheckedRef.current = true;
    useProgressStore.getState().refreshHearts();
    if (useProgressStore.getState().hearts <= 0) {
      setGateOpen(true);
    }
  }, []);

  const total = questions.length;
  const current = questions[index] ?? null;
  const progress = total > 0 ? (index / total) * 100 : 0;

  function handleCheck() {
    if (!current || phase !== "answering" || !answer.trim()) return;
    const ok = gradeAnswer(current.question, answer);
    setIsCorrect(ok);
    setPhase("checked");
    if (ok) {
      setCorrectCount(c => c + 1);
      haptic("light");
      playSfx("correct");
    } else {
      haptic("heavy");
      playSfx("wrong");
      if (!prefersReduced) {
        shakeControls.start({ x: [0, -8, 8, -5, 5, 0], transition: { duration: 0.45 } });
      }
    }
  }

  function handleContinue() {
    if (phase !== "checked") return;
    const finalCorrect = correctCount; // isCorrect 已在 handleCheck 计入
    if (index + 1 >= total) {
      finishTest(finalCorrect);
      return;
    }
    setIndex(i => i + 1);
    setAnswer("");
    setIsCorrect(null);
    setPhase("answering");
  }

  function finishTest(finalCorrect: number) {
    const accuracy = total > 0 ? finalCorrect / total : 0;
    if (accuracy >= JUMP_PASS_ACCURACY && load.kind === "ready") {
      // ✅ 通过：批量补标前置课程（不发 XP / 宝石），庆祝
      const marked = jumpAheadComplete(load.priorLessonIds);
      setPassedCount(marked);
      setResult("pass");
      playSfx("complete");
      haptic("success");
    } else {
      // ❌ 失败：扣 1 颗红心，可重试
      loseHeart();
      setResult("fail");
      playSfx("wrong", { volume: 0.5 });
      haptic("medium");
    }
  }

  function retry() {
    useProgressStore.getState().refreshHearts();
    if (useProgressStore.getState().hearts <= 0) {
      setGateOpen(true);
      return;
    }
    playSfx("unlock");
    haptic("medium");
    setSeed(newSeed()); // 换一套题
    setIndex(0);
    setAnswer("");
    setIsCorrect(null);
    setPhase("answering");
    setCorrectCount(0);
    setResult(null);
  }

  function exitToPath() {
    playSfx("tap");
    haptic("light");
    window.location.assign(bookId ? `/book/${bookId}/` : "/");
  }

  function handleGateRefill() {
    const ok = buyHeartRefill();
    if (!ok) {
      playSfx("wrong", { volume: 0.35 });
      haptic("medium");
      return;
    }
    playSfx("unlock");
    haptic("success");
    setGateOpen(false);
    // 失败页上点补心 → 直接开新一轮
    if (result === "fail") retry();
  }

  // ============ 装载 / 异常态 ============
  if (load.kind === "loading") {
    return (
      <main className="min-h-screen bg-bg-soft flex flex-col items-center justify-center gap-4">
        <Mascot mood="think" size={100} />
        <div className="text-sm font-extrabold text-ink-light">聪聪正在出题…</div>
      </main>
    );
  }
  if (load.kind === "error") {
    return (
      <main className="min-h-screen bg-bg-soft flex flex-col items-center justify-center px-5 text-center">
        <Mascot mood="sad" size={110} />
        <div className="text-lg font-extrabold text-ink mt-4">{load.message}</div>
        <SoundLink
          href={bookId ? `/book/${bookId}/` : "/"}
          hapticIntensity="medium"
          className="btn-chunky-primary px-8 mt-6"
        >
          返回路径
        </SoundLink>
      </main>
    );
  }

  // ============ 结果页 ============
  if (result === "pass") {
    return (
      <main className="min-h-screen bg-bg-soft flex flex-col items-center justify-center px-5 relative overflow-hidden">
        <ConfettiCanvas active />
        <motion.div
          initial={{ scale: 0.6, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={{ type: "spring", damping: 16, stiffness: 220 }}
          className="text-center relative z-10 w-full max-w-sm"
        >
          <Mascot mood="cheer" size={150} reactTo="levelup" reactKey={1} />
          <h1 className="text-4xl font-extrabold text-primary mt-4">跳级成功！</h1>
          <p className="text-ink-light mt-2">
            你已经掌握了前面的知识，直接从第 {unitNumber} 单元
            {load.unitTitle ? `「${load.unitTitle}」` : ""}继续吧！
          </p>
          <motion.div
            initial={{ scale: 0, y: 10, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            transition={{ delay: 0.45, type: "spring", damping: 11 }}
            className="mt-5 inline-flex items-center gap-2 px-5 py-3 rounded-2xl font-extrabold text-base text-white"
            style={{
              background: "linear-gradient(135deg, #FFC800, #FF9600)",
              boxShadow: "0 5px 0 0 #C89600",
            }}
          >
            <Crown className="w-5 h-5" />
            <span>前面 {passedCount} 节课已点亮</span>
          </motion.div>
          <p className="text-[11px] text-ink-softer mt-3">
            跳级点亮的课程按一星计，随时可以回去重玩拿三星
          </p>
          <button
            autoFocus
            onClick={exitToPath}
            className="btn-chunky-primary w-full mt-8"
          >
            去看新起点
          </button>
        </motion.div>
      </main>
    );
  }

  if (result === "fail") {
    return (
      <main className="min-h-screen bg-bg-soft flex flex-col items-center justify-center px-5">
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: "spring", damping: 18 }}
          className="text-center w-full max-w-sm"
        >
          <Mascot mood="sad" size={130} />
          <h1 className="text-3xl font-extrabold text-ink mt-4">差一点点！</h1>
          <p className="text-ink-light mt-2">
            这次答对 <span className="font-extrabold text-ink tabular-nums">{correctCount}/{total}</span>，
            答对 8 成就能跳级。先别灰心，换一套题再试试？
          </p>
          <div className="mt-4 inline-flex items-center gap-1.5 text-sm font-extrabold text-danger">
            <Heart className="w-4 h-4 fill-current" />
            <span>已消耗 1 颗红心 · 剩余 {hearts}</span>
          </div>
          <div className="flex flex-col gap-3 mt-8">
            <button
              onClick={retry}
              className={hearts > 0 ? "btn-chunky-primary w-full" : "btn-chunky-disabled w-full"}
              disabled={hearts <= 0 && gems < HEART_REFILL_COST}
            >
              {hearts > 0 ? "再试一次（换一套题）" : "补满红心再试"}
            </button>
            <button onClick={exitToPath} className="btn-chunky-ghost w-full">
              先回去把前面学扎实
            </button>
          </div>
        </motion.div>

        {/* 0 心补心遮罩 */}
        <HeartGateModal
          open={gateOpen}
          gems={gems}
          onRefill={handleGateRefill}
          onExit={exitToPath}
        />
      </main>
    );
  }

  // ============ 答题中 ============
  return (
    <motion.main animate={shakeControls} className="min-h-screen bg-bg-soft flex flex-col">
      {/* 顶栏：退出 + 进度条 + 跳级徽章 + 静音 */}
      <div className="bg-white border-b border-bg-softer">
        <div className="max-w-md lg:max-w-2xl mx-auto px-3 py-2.5 flex items-center gap-2">
          <button
            type="button"
            onClick={exitToPath}
            className="h-9 w-9 -ml-1 inline-flex items-center justify-center rounded-full text-ink-light hover:text-ink hover:bg-bg-softer transition-colors shrink-0"
            aria-label="退出跳级测试"
          >
            <Close className="w-5 h-5" />
          </button>
          <div className="flex-1 h-3 bg-bg-softer rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-warning rounded-full"
              initial={{ width: "0%" }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            />
          </div>
          <div className="text-xs font-extrabold text-ink-softer tabular-nums shrink-0">
            {index + 1}/{total}
          </div>
          <MuteToggle />
        </div>
      </div>

      {/* 跳级上下文胶囊 */}
      <div className="max-w-md lg:max-w-2xl mx-auto w-full px-5 pt-4 flex items-center gap-2 flex-wrap">
        <span
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-white text-[11px] font-extrabold"
          style={{
            background: "linear-gradient(135deg, #FFC800, #FF9600)",
            boxShadow: "0 2px 0 0 #C89600",
          }}
        >
          <Lightning className="w-3 h-3" />
          跳级测试 · 冲向第 {unitNumber} 单元
        </span>
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-bg-softer text-ink-light text-[11px] font-extrabold">
          答对 {Math.ceil(total * JUMP_PASS_ACCURACY)} 题过关
        </span>
      </div>

      {/* 题目区 */}
      <div className="flex-1 flex flex-col items-center justify-start px-5 py-4 pb-40">
        <div className="w-full max-w-md lg:max-w-2xl">
          <AnimatePresence mode="wait">
            <motion.div
              key={`${seed}-${index}`}
              initial={{ x: 30, y: 8, opacity: 0 }}
              animate={{ x: 0, y: 0, opacity: 1 }}
              exit={{ x: -30, y: 0, opacity: 0 }}
              transition={{ type: "spring", damping: 22, stiffness: 240 }}
            >
              {current && (
                <QuestionRenderer
                  question={current.question}
                  answer={answer}
                  phase={phase}
                  isCorrect={isCorrect}
                  onChange={setAnswer}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* a11y：实时播报判分结果 */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {phase === "checked" && isCorrect === true && "回答正确。"}
        {phase === "checked" && isCorrect === false && current &&
          `回答错误。正确答案是：${current.question.answer}。`}
      </div>

      {/* 底部：只有「检查」——跳级测试没有跳过 */}
      {phase === "answering" && (
        <div className="bg-white border-t-2 border-bg-softer">
          <div className="max-w-md lg:max-w-2xl mx-auto px-5 py-4">
            <button
              onClick={handleCheck}
              disabled={!answer.trim()}
              className={answer.trim() ? "w-full btn-chunky-primary" : "w-full btn-chunky-disabled"}
            >
              检查
            </button>
          </div>
        </div>
      )}

      {/* 判分反馈（🚩 报错可用；答错不扣心、不入错题本——只看总分） */}
      {phase === "checked" && current && (
        <FeedbackPanel
          isCorrect={isCorrect ?? false}
          explanation={current.question.explanation}
          explanationAudio={current.question.audio?.explanation ?? null}
          onContinue={handleContinue}
          reportContext={{
            lessonId: current.lessonId,
            question: current.question,
            userAnswer: answer || undefined,
          }}
        />
      )}

      {/* 0 心入口遮罩 */}
      <HeartGateModal
        open={gateOpen}
        gems={gems}
        onRefill={handleGateRefill}
        onExit={exitToPath}
      />
    </motion.main>
  );
}

/** 💔 0 心补心遮罩：补满继续 / 返回路径 */
function HeartGateModal({
  open,
  gems,
  onRefill,
  onExit,
}: {
  open: boolean;
  gems: number;
  onRefill: () => void;
  onExit: () => void;
}) {
  return (
    <Modal open={open} dismissible={false} ariaLabel="红心用完了">
      <div className="flex flex-col items-center text-center">
        <Mascot mood="sad" size={96} />
        <h2 className="text-2xl font-extrabold text-ink mt-3">红心用完了！</h2>
        <p className="text-ink-light mt-2">跳级测试要用红心，补满再来挑战吧～</p>
        <div className="mt-3 inline-flex items-center gap-1.5 text-sm font-extrabold text-secondary-dark">
          <Gem className="w-4 h-4" />
          <span className="tabular-nums">当前宝石 {gems}</span>
        </div>
        <div className="flex flex-col gap-3 w-full mt-5">
          <button
            onClick={onRefill}
            disabled={gems < HEART_REFILL_COST}
            className={
              gems >= HEART_REFILL_COST
                ? "btn-chunky-primary w-full"
                : "btn-chunky-disabled w-full"
            }
          >
            <span className="inline-flex items-center justify-center gap-1.5">
              <Gem className="w-4 h-4" />
              用 {HEART_REFILL_COST} 宝石补满（{MAX_HEARTS} 颗）
            </span>
          </button>
          {gems < HEART_REFILL_COST && (
            <p className="text-xs text-ink-softer -mt-1">
              宝石不够，先回去学习攒一攒，红心也会慢慢恢复
            </p>
          )}
          <button onClick={onExit} className="btn-chunky-ghost w-full">
            返回路径
          </button>
        </div>
      </div>
    </Modal>
  );
}
