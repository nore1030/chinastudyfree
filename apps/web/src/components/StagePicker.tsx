"use client";

/**
 * StagePicker —— 首次进入时的「学段」引导（小学 / 初中 / 高中 / 大学）。
 *
 * 触发：useProgressStore.selectedStage === null
 * 完成后（一律 window.location.assign 硬跳转，规避静态导出 + 安卓 WebView 的软导航 404）：
 *   - 大学 → /grade/13/（大学无年级，直接进「大学」互动课程页）
 *   - 其他学段 → setSelectedStage(stage) + /stage/{stage}/versions/
 *     （选完学段先按科目选教材版本，再进年级选择）
 */

import { useState } from "react";
import { motion } from "framer-motion";
import { useProgressStore } from "@/store/progress";
import { Mascot } from "@/components/Mascot";
import { SpeechBubble } from "@/components/SpeechBubble";
import { STAGES, gradeFullName, type StageMeta } from "@cstf/core/stage";
import { cn } from "@/lib/cn";
import { playSfx } from "@/lib/sfx";
import { haptic } from "@/lib/haptic";

export function StagePicker() {
  const setSelectedStage = useProgressStore(s => s.setSelectedStage);
  const [picked, setPicked] = useState<StageMeta | null>(null);

  function handlePick(stage: StageMeta) {
    playSfx("tap");
    haptic("light");
    setPicked(stage);
  }

  function handleContinue() {
    if (!picked) return;
    playSfx("star");
    haptic("success");
    setSelectedStage(picked.id);
    // 一律硬跳转：静态导出（output: export + trailingSlash）+ 安卓 WebView 下
    // Next router 软导航偶发 404，window.location.assign 才可靠。
    //   大学：无年级概念 → 直接进「大学」互动课程页（grade 13）。
    //   其他学段：先按科目选教材版本（人教版 / 沪教版…内容不同），再选年级。
    if (picked.isCollege) {
      window.location.assign("/grade/13/");
    } else {
      window.location.assign(`/stage/${picked.id}/versions/`);
    }
  }

  return (
    <>
      {/* 内容层：整屏 fixed + 自身滚动。
          ⚠️ 不要再用「flex-1 撑高 + overflow-y-auto」那套 —— 在安卓 WebView 里
          高度会算错，把底部按钮条挤到视口之外，表现为「选完学段看不到继续按钮」
          （用户在真机上截图复现）。改为按钮条独立 fixed 到底部。 */}
      <div className="fixed inset-0 z-50 bg-bg overflow-y-auto">
        <div className="max-w-md mx-auto px-5 pt-12 pb-32 flex flex-col items-center">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", damping: 18 }}
            className="flex items-end gap-3 mb-8 w-full"
          >
            <Mascot size={96} mood="wave" />
            <div className="mb-2">
              <SpeechBubble text="你现在读哪个学段呀？" tone="neutral" />
            </div>
          </motion.div>

          <div className="w-full flex flex-col gap-3">
            {STAGES.map((stage, i) => {
              const selected = picked?.id === stage.id;
              return (
                <motion.button
                  key={stage.id}
                  type="button"
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 + i * 0.05 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handlePick(stage)}
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
                    className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 text-white font-extrabold text-2xl"
                    style={{ backgroundColor: stage.color }}
                  >
                    {stage.short}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div
                      className={cn(
                        "text-base font-extrabold leading-tight",
                        selected ? "text-secondary-dark" : "text-ink",
                      )}
                    >
                      {stage.name}
                    </div>
                    <div className="text-xs text-ink-light mt-0.5">
                      {stage.isCollege
                        ? "按学科 / 课程组织"
                        : stage.grades.map(g => gradeFullName(g)).join(" / ")}
                    </div>
                  </div>
                </motion.button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 底部按钮条：独立 fixed 到底部，z-50 压过 BottomNav（z-40）；
          并垫 env(safe-area-inset-bottom) 防安卓系统导航条遮挡。
          按钮**不做 opacity 渐入** —— 真机上曾因动画未完成让按钮一直隐身。 */}
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
