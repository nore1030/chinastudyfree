"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/cn";
import { MathText } from "@/components/MathText";
import { TTSButton } from "@/components/TTSButton";
import { playSfx } from "@/lib/sfx";
import { haptic } from "@/lib/haptic";
import { playTTS, playVoice } from "@/lib/tts";
import { useAutoNarrate } from "@/lib/useAutoNarrate";
import { shouldIgnoreKey } from "./keyboard";
import type { QuestionRendererProps } from "./QuestionRenderer";

interface Ripple {
  id: number;
  x: number;
  y: number;
}

function normalizeOpt(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, "");
}

export function ChoiceQuestion({
  question,
  answer,
  phase,
  isCorrect,
  onChange,
  locked = false,
}: QuestionRendererProps) {
  const rawCorrect = question.answer.trim();
  let correctLetter = rawCorrect.toUpperCase().charAt(0);
  // 若 answer 不是单字母 A-D，则在 options 里反查对应字母
  if (!/^[A-D]$/.test(correctLetter) && question.options?.length) {
    const cn = normalizeOpt(rawCorrect);
    const idx = question.options.findIndex(o => {
      const stripped = o.replace(/^[A-D][.、]\s*/, "");
      return normalizeOpt(o) === cn || normalizeOpt(stripped) === cn;
    });
    if (idx >= 0) correctLetter = String.fromCharCode(65 + idx);
  }
  const [ripples, setRipples] = useState<Record<string, Ripple[]>>({});
  const idRef = useRef(0);

  // 自动朗读题干（只在进入该题时一次；点选项立即打断）
  const cancelNarrate = useAutoNarrate(
    [{ src: question.audio?.question, text: question.question }],
    question.id,
  );

  /** 选中某个选项（点击 / 键盘共用）：朗读 + 音效 + 触感 + 写回 answer */
  function selectLetter(letter: string) {
    if (locked || phase === "checked") return;
    cancelNarrate();
    // 选中选项时自动朗读该选项
    const idx = letter.charCodeAt(0) - 65;
    const optAudio = question.audio?.options?.[idx];
    const optText = question.options?.[idx];
    if (optAudio || optText) void playVoice(optAudio, optText);
    playSfx("tap");
    haptic("light");
    onChange(letter);
  }

  function handleTap(letter: string, e: React.MouseEvent<HTMLButtonElement>) {
    if (locked || phase === "checked") return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const id = ++idRef.current;
    setRipples(prev => ({ ...prev, [letter]: [...(prev[letter] ?? []), { id, x, y }] }));
    setTimeout(() => {
      setRipples(prev => ({
        ...prev,
        [letter]: (prev[letter] ?? []).filter(r => r.id !== id),
      }));
    }, 600);
    selectLetter(letter);
  }

  // 键盘快捷键（web-lesson-3）：数字 1-4 选选项
  useEffect(() => {
    if (locked || phase !== "answering") return; // 遮罩打开时不接管键盘（webrunner-5）
    const onKeyDown = (e: KeyboardEvent) => {
      if (shouldIgnoreKey(e)) return;
      const n = Number(e.key);
      if (!Number.isInteger(n) || n < 1 || n > Math.min(4, question.options.length)) return;
      e.preventDefault();
      selectLetter(String.fromCharCode(64 + n));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, question.id, locked]);

  return (
    <div className="w-full">
      <div className="flex items-start gap-3 mb-6">
        <div className="text-2xl font-bold text-ink leading-relaxed flex-1">
          <MathText text={question.question} />
        </div>
        <TTSButton src={question.audio?.question} text={question.question} className="mt-1" label="朗读题目" />
      </div>

      <div className="space-y-3">
        {question.options.map((opt, idx) => {
          const letter = String.fromCharCode(65 + idx); // A B C D
          const display = /^[A-D][.、]/.test(opt) ? opt.replace(/^[A-D][.、]\s*/, "") : opt;
          const selected = answer === letter;
          const isThisCorrect = letter === correctLetter;

          let cls = "option-card";
          if (phase === "checked") {
            if (isThisCorrect) cls = "option-card option-card-correct";
            else if (selected && !isCorrect) cls = "option-card option-card-wrong";
          } else if (selected) {
            cls = "option-card option-card-selected";
          }

          // 答错时在正确选项上播放脉冲高亮，引导用户注意
          const shouldPulse = phase === "checked" && !isCorrect && isThisCorrect;

          const optionAudio = question.audio?.options?.[idx] ?? null;
          return (
            <div key={idx} className="flex items-stretch gap-2">
              <motion.button
                type="button"
                disabled={phase === "checked"}
                onClick={e => handleTap(letter, e)}
                className={cn("flex-1 text-left flex items-center gap-3 relative", cls)}
                whileTap={phase === "answering" ? { scale: 0.98 } : undefined}
                animate={
                  shouldPulse
                    ? {
                        boxShadow: [
                          "0 2px 0 0 #58a700, 0 0 0 0 rgba(88,204,2,0.6)",
                          "0 2px 0 0 #58a700, 0 0 0 12px rgba(88,204,2,0)",
                          "0 2px 0 0 #58a700, 0 0 0 0 rgba(88,204,2,0.6)",
                        ],
                      }
                    : undefined
                }
                transition={shouldPulse ? { duration: 1.3, repeat: Infinity } : undefined}
              >
                <span className="flex-1">
                  <MathText text={display} />
                </span>
                {/* Duolingo 风格：右下角数字角标（1/2/3/4）
                    仅在有物理键盘的桌面端（pointer:fine）显示 —— 触屏上是噪音 */}
                <motion.span
                  animate={
                    selected
                      ? { scale: [1, 1.18, 1], borderColor: "#1CB0F6", color: "#1CB0F6" }
                      : { scale: 1 }
                  }
                  transition={{ duration: 0.25 }}
                  className="ml-3 w-7 h-7 rounded-md border-2 border-bg-softer hidden [@media(pointer:fine)]:flex items-center justify-center font-extrabold text-ink-softer text-xs tabular-nums shrink-0"
                >
                  {idx + 1}
                </motion.span>

                {/* Ripple */}
                {(ripples[letter] ?? []).map(r => (
                  <span
                    key={r.id}
                    className="ripple-dot text-secondary"
                    style={{ left: r.x - 8, top: r.y - 8, width: 16, height: 16 }}
                  />
                ))}
              </motion.button>
              {(optionAudio || display) && (
                <div className="flex items-center">
                  <TTSButton
                    src={optionAudio}
                    text={display}
                    size="sm"
                    label={`朗读选项 ${letter}`}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
