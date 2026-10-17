"use client";

/**
 * ChangeGradeButton —— 年级页头部的「切换教材」按钮。
 *
 * 语义：**只换教材 / 换年级，不换学段**。
 *   - 清空 selectedGrade + activeBookId → 回首页进入「年级选择」
 *   - **保留 selectedStage** —— 否则用户每次点它都要把学段（小学/初中/高中/大学）
 *     重选一遍，这是曾经的真实投诉（"每次点学习都要重新选择学段"）。
 *
 * 想换学段请用 GradePicker 上的「切换学段」入口（显式清空 selectedStage）。
 */

import { useProgressStore } from "@/store/progress";
import { playSfx } from "@/lib/sfx";
import { haptic } from "@/lib/haptic";

export function ChangeGradeButton() {
  const setSelectedGrade = useProgressStore(s => s.setSelectedGrade);
  const setActiveBookId = useProgressStore(s => s.setActiveBookId);

  return (
    <button
      type="button"
      onClick={() => {
        playSfx("tap");
        haptic("light");
        // 只清年级与当前教材，保留学段 → 首页进入同批次的年级选择
        setActiveBookId(null);
        setSelectedGrade(null);
        // 硬跳转：静态导出 + 安卓 WebView 下 router.push 偶发 404
        window.location.assign("/");
      }}
      className="text-xs lg:text-sm font-extrabold text-secondary hover:underline"
    >
      切换教材
    </button>
  );
}
