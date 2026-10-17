"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import { Check, XMark } from "@/components/icons";
import { cn } from "@/lib/cn";
import { MathText } from "@/components/MathText";
import { TTSButton } from "@/components/TTSButton";
import { playSfx } from "@/lib/sfx";
import { haptic } from "@/lib/haptic";
import { useAutoNarrate } from "@/lib/useAutoNarrate";
import { shouldIgnoreKey } from "./keyboard";
import type { QuestionRendererProps } from "./QuestionRenderer";

const TRUE_VALUES = new Set(["对", "正确", "true", "T", "✓", "√"]);

export function TrueFalseQuestion({
  question,
  answer,
  phase,
  isCorrect,
  onChange,
  locked = false,
}: QuestionRendererProps) {
  const correctIsTrue = TRUE_VALUES.has(question.answer.trim());
  const cancelNarrate = useAutoNarrate(
    [{ src: question.audio?.question, text: question.question }],
    question.id,
  );

  function select(label: "对" | "错") {
    if (locked || phase !== "answering") return;
    cancelNarrate();
    playSfx("tap");
    haptic("light");
    onChange(label);
  }

  // 键盘快捷键（web-lesson-3）：1 = 对，2 = 错
  useEffect(() => {
    if (locked || phase !== "answering") return; // 遮罩打开时不接管键盘（webrunner-5）
    const onKeyDown = (e: KeyboardEvent) => {
      if (shouldIgnoreKey(e)) return;
      if (e.key === "1") {
        e.preventDefault();
        select("对");
      } else if (e.key === "2") {
        e.preventDefault();
        select("错");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, question.id, locked]);

  const renderBtn = (label: "对" | "错", icon: React.ReactNode, hotkey: string) => {
    const selected = answer === label;
    const thisCorrect = (label === "对") === correctIsTrue;
    let cls = "option-card";
    if (phase === "checked") {
      if (thisCorrect) cls = "option-card option-card-correct";
      else if (selected && !isCorrect) cls = "option-card option-card-wrong";
    } else if (selected) {
      cls = "option-card option-card-selected";
    }
    return (
      <motion.button
        key={label}
        type="button"
        disabled={phase === "checked"}
        onClick={() => select(label)}
        whileTap={phase === "answering" ? { scale: 0.98 } : undefined}
        className={cn("flex-1 flex flex-col items-center gap-2 relative", cls)}
        style={{ minHeight: 108 }}
      >
        <motion.div animate={selected ? { scale: [1, 1.15, 1] } : { scale: 1 }} transition={{ duration: 0.25 }}>
          {icon}
        </motion.div>
        <span className="text-lg font-extrabold">{label}</span>
        {/* 数字角标：仅桌面端（pointer:fine）显示，对应快捷键 1/2 */}
        <span className="absolute bottom-2 right-2 w-6 h-6 rounded-md border-2 border-bg-softer hidden [@media(pointer:fine)]:flex items-center justify-center font-extrabold text-ink-softer text-xs tabular-nums">
          {hotkey}
        </span>
      </motion.button>
    );
  };

  return (
    <div className="w-full">
      <div className="flex items-start gap-3 mb-6">
        <div className="text-xl font-bold text-ink leading-relaxed flex-1">
          <MathText text={question.question} />
        </div>
        <TTSButton src={question.audio?.question} text={question.question} className="mt-1" label="朗读题目" />
      </div>
      <div className="flex gap-3">
        {renderBtn("对", <Check className="w-10 h-10 text-primary" />, "1")}
        {renderBtn("错", <XMark className="w-10 h-10 text-danger" />, "2")}
      </div>
    </div>
  );
}
