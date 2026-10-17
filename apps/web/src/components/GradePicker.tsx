"use client";

/**
 * GradePicker —— 学段内的「年级」引导（小学 1-6 / 初中 7-9 / 高中 10-12）。
 *
 * 触发：useProgressStore.selectedGrade === null（且已选好学段）
 * 完成后：setSelectedGrade(g) → 硬跳转 /grade/{g}/
 *
 * 大学没有年级，不会进入本组件（由 StagePicker 直接进教材中心）。
 */

import { useState } from "react";
import { motion } from "framer-motion";
import { useProgressStore } from "@/store/progress";
import { Mascot } from "@/components/Mascot";
import { SpeechBubble } from "@/components/SpeechBubble";
import {
  Apple,
  Sprout,
  Tree,
  Butterfly,
  Rocket,
  Trophy,
  type IconProps,
} from "@/components/icons";
import {
  STAGE_BY_ID,
  gradeFullName,
  type StageId,
} from "@cstf/core/stage";
import { cn } from "@/lib/cn";
import { playSfx } from "@/lib/sfx";
import { haptic } from "@/lib/haptic";
import type { ComponentType } from "react";

interface Option {
  grade: number;
  label: string;
  hint: string;
  Icon: ComponentType<IconProps>;
}

// 小学沿用原版 6 个选项的文案与图标（最具童趣）
const PRIMARY_OPTIONS: Option[] = [
  { grade: 1, label: "我刚上一年级", hint: "刚开始识字 / 学加减", Icon: Apple },
  { grade: 2, label: "我读二年级", hint: "已会简单加减 / 拼音", Icon: Sprout },
  { grade: 3, label: "我读三年级", hint: "认识更多汉字 / 学乘除", Icon: Tree },
  { grade: 4, label: "我读四年级", hint: "能写小作文 / 学小数", Icon: Butterfly },
  { grade: 5, label: "我读五年级", hint: "阅读理解 / 学分数", Icon: Rocket },
  { grade: 6, label: "我读六年级", hint: "面对小升初", Icon: Trophy },
];

const STAGE_HINTS: Record<StageId, string[]> = {
  primary: [],
  middle: ["打牢基础", "逐步进阶", "备战中考"],
  high: ["夯实基础", "攻坚克难", "冲刺高考"],
  college: [],
};

const GENERIC_ICONS: ComponentType<IconProps>[] = [
  Apple,
  Sprout,
  Tree,
  Butterfly,
  Rocket,
  Trophy,
];

function buildOptions(stage: StageId | null): Option[] {
  if (!stage || stage === "primary") return PRIMARY_OPTIONS;
  // 大学无年级：给出单一入口（grade 13 → 按学科 / 课程组织）
  if (stage === "college") {
    return [{ grade: 13, label: "我是大学生", hint: "按学科 / 课程学习", Icon: Rocket }];
  }
  const meta = STAGE_BY_ID[stage];
  const hints = STAGE_HINTS[stage] ?? [];
  return meta.grades.map((g, i) => ({
    grade: g,
    label: `我读${gradeFullName(g)}`,
    hint: hints[i] ?? "",
    Icon: GENERIC_ICONS[i % GENERIC_ICONS.length],
  }));
}

export function GradePicker({ stage = null }: { stage?: StageId | null }) {
  const setSelectedGrade = useProgressStore(s => s.setSelectedGrade);
  const setSelectedStage = useProgressStore(s => s.setSelectedStage);
  const [picked, setPicked] = useState<number | null>(null);
  const OPTIONS = buildOptions(stage);

  function handleContinue() {
    if (picked == null) return;
    playSfx("star");
    haptic("success");
    setSelectedGrade(picked);
    // 用硬跳转避免 next.js (output: export + trailingSlash) router.push 偶发 404
    window.location.assign(`/grade/${picked}/`);
  }

  return (
    <>
      {/* 内容层：整屏 fixed + 自身滚动（同 StagePicker —— 避免安卓 WebView 里
          flex-1 高度算错把底部按钮条挤出视口）。 */}
      <div className="fixed inset-0 z-50 bg-bg overflow-y-auto">
        <div className="max-w-md mx-auto px-5 pt-12 pb-32 flex flex-col items-center">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", damping: 18 }}
            className="flex items-end gap-3 mb-4 w-full"
          >
            <Mascot size={96} mood="wave" />
            <div className="mb-2">
              <SpeechBubble text="你现在读几年级呀？" tone="neutral" />
            </div>
          </motion.div>

          {/* 学段信息 + 显式「切换学段」入口（学段一旦选过就不会再强制重选） */}
          {stage && (
            <div className="mb-3 w-full flex items-center justify-center gap-2 text-xs">
              <span className="text-ink-light">
                当前学段：
                <b className="text-ink">{STAGE_BY_ID[stage]?.name ?? stage}</b>
              </span>
              <button
                type="button"
                onClick={() => {
                  playSfx("tap");
                  haptic("light");
                  setSelectedStage(null);
                  setSelectedGrade(null);
                }}
                className="font-extrabold text-secondary hover:underline"
              >
                切换学段
              </button>
            </div>
          )}

          {/* 教材版本入口：不同出版社版本学的内容不一样，可按科目切换（<a> 硬跳转） */}
          {stage && stage !== "college" && (
            <a
              href={`/stage/${stage}/versions/`}
              className="mb-6 w-full flex items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-bg-softer bg-white px-4 py-2.5 text-sm font-extrabold text-secondary hover:border-secondary/50 transition-colors"
            >
              📚 选教材版本（人教版 / 沪教版…内容不同）›
            </a>
          )}

          <div className="w-full flex flex-col gap-3">
            {OPTIONS.map((opt, i) => {
              const Icon = opt.Icon;
              const selected = picked === opt.grade;
              return (
                <motion.button
                  key={opt.grade}
                  type="button"
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 + i * 0.05 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    playSfx("tap");
                    haptic("light");
                    setPicked(opt.grade);
                  }}
                  className={cn(
                    "flex items-center gap-4 px-4 py-4 rounded-2xl border-2 text-left transition-colors select-none",
                    selected
                      ? "border-secondary bg-secondary/10"
                      : "border-bg-softer bg-white hover:border-secondary/40",
                  )}
                  style={{
                    boxShadow: selected
                      ? "0 4px 0 0 #1899D6"
                      : "0 3px 0 0 var(--shadow-card-color)",
                  }}
                >
                  <div
                    className={cn(
                      "w-12 h-12 rounded-2xl flex items-center justify-center shrink-0",
                      selected ? "bg-secondary/15" : "bg-bg-soft"
                    )}
                  >
                    <Icon
                      className={cn(
                        "w-7 h-7",
                        selected ? "text-secondary" : "text-ink-light"
                      )}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div
                      className={cn(
                        "text-base font-extrabold leading-tight",
                        selected ? "text-secondary-dark" : "text-ink"
                      )}
                    >
                      {opt.label}
                    </div>
                    <div className="text-xs text-ink-light mt-0.5">{opt.hint}</div>
                  </div>
                </motion.button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 底部按钮条：独立 fixed 到底部，z-50 压过 BottomNav（z-40）；垫安全区。
          按钮不做 opacity / AnimatePresence 进出场动画 —— 真机上易一直隐身。 */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 border-t-2 border-bg-softer bg-white"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px))" }}
      >
        <div className="max-w-md mx-auto px-5 py-4 flex justify-end">
          {picked != null ? (
            <button
              type="button"
              onClick={handleContinue}
              className="btn-chunky-primary px-10"
            >
              继续
            </button>
          ) : (
            <button type="button" disabled className="btn-chunky-disabled px-10">
              继续
            </button>
          )}
        </div>
      </div>
    </>
  );
}
