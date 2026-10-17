"use client";

/**
 * ChestModal —— 宝箱开箱弹窗。
 *
 * 流程：
 *   1. 弹入（盖子还是合着的 Chest 图标）
 *   2. 用户点"打开"按钮 → 盖子动画 + 音效 + 触觉 + 宝石飞出
 *   3. 展示 "+N 宝石" 卡片
 *   4. 底部按钮关闭弹窗
 *
 * 分层演出（web-economy-13）—— tier 由 chestLogic.rollChestReward 透传：
 *   - common：金色脉冲 + 8 颗宝石粒子
 *   - rare  ：蓝色光环 + 12 颗粒子 + 中等触觉
 *   - epic  ：紫金光环 + 18 颗粒子 + 更长的彩带线 + 重触觉
 *
 * 奖励已经在外层组件里 addGems 过了，这里只负责动画演出。
 * 已领取过的宝箱不会再进入这里（外层直接弹轻提示）。
 */

import { useEffect, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Modal } from "./Modal";
import { Chest, ChestOpen, Gem, Sparkle } from "@/components/icons";
import type { ChestRewardTier } from "@/lib/chestLogic";
import { playSfx } from "@/lib/sfx";
import { haptic } from "@/lib/haptic";

interface ChestModalProps {
  open: boolean;
  gems: number;
  /** 奖励档位，决定开箱演出强度（缺省 common） */
  tier?: ChestRewardTier;
  onClose: () => void;
}

/** 每档的演出参数 */
const TIER_FX: Record<
  ChestRewardTier,
  {
    label: string | null;
    labelColor: string;
    glow: string;
    ringShadow: string;
    particles: number;
    particleDuration: number;
    rewardBg: string;
    rewardShadow: string;
    haptic: "success" | "medium" | "heavy";
    ribbons: number;
  }
> = {
  common: {
    label: null,
    labelColor: "#FFC800",
    glow: "rgba(255, 200, 0, 0.35)",
    ringShadow: "0 0 0 6px rgba(255, 200, 0, 0.35)",
    particles: 8,
    particleDuration: 1.1,
    rewardBg: "linear-gradient(135deg, #1CB0F6, #1899D6)",
    rewardShadow: "0 5px 0 0 #0d7aa8",
    haptic: "success",
    ribbons: 0,
  },
  rare: {
    label: "稀有宝箱！",
    labelColor: "#1CB0F6",
    glow: "rgba(28, 176, 246, 0.4)",
    ringShadow: "0 0 0 8px rgba(28, 176, 246, 0.4), 0 0 28px rgba(28, 176, 246, 0.5)",
    particles: 12,
    particleDuration: 1.3,
    rewardBg: "linear-gradient(135deg, #1CB0F6, #1899D6)",
    rewardShadow: "0 5px 0 0 #0d7aa8",
    haptic: "medium",
    ribbons: 8,
  },
  epic: {
    label: "超级惊喜！",
    labelColor: "#CE82FF",
    glow: "rgba(206, 130, 255, 0.45)",
    ringShadow:
      "0 0 0 8px rgba(206, 130, 255, 0.45), 0 0 36px rgba(255, 200, 0, 0.6)",
    particles: 18,
    particleDuration: 1.6,
    rewardBg: "linear-gradient(135deg, #CE82FF, #FFC800)",
    rewardShadow: "0 5px 0 0 #A560E8",
    haptic: "heavy",
    ribbons: 14,
  },
};

const RIBBON_COLORS = ["#FFC800", "#CE82FF", "#1CB0F6", "#58CC02", "#FF4B4B", "#FF9600"];

export function ChestModal({ open, gems, tier = "common", onClose }: ChestModalProps) {
  const [opened, setOpened] = useState(false);
  const prefersReduced = useReducedMotion();
  const fx = TIER_FX[tier];

  // 弹窗关闭后重置内部状态，下次弹开重新从"合着"开始
  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => setOpened(false), 300);
      return () => clearTimeout(t);
    }
  }, [open]);

  function handleOpen() {
    if (opened) return;
    playSfx("unlock");
    haptic(fx.haptic);
    setOpened(true);
  }

  return (
    <Modal open={open} onClose={onClose}>
      <div className="flex flex-col items-center text-center">
        <h2 className="text-2xl font-extrabold text-ink mb-1">宝箱来啦！</h2>
        <p className="text-ink-light text-sm mb-4">点击打开，领取奖励</p>

        <div className="relative w-36 h-36 flex items-center justify-center">
          {/* 脉冲光圈（未开时；rare/epic 颜色更亮） */}
          {!opened && !prefersReduced && (
            <motion.div
              aria-hidden
              animate={{ scale: [1, 1.25, 1], opacity: [0.35, 0, 0.35] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
              className="absolute inset-0 rounded-full"
              style={{ backgroundColor: fx.glow }}
            />
          )}

          <AnimatePresence mode="wait">
            {!opened ? (
              <motion.button
                key="closed"
                type="button"
                onClick={handleOpen}
                initial={{ scale: 0.3, opacity: 0, rotate: -20 }}
                animate={{ scale: 1, opacity: 1, rotate: 0 }}
                exit={{ scale: 0.5, opacity: 0 }}
                transition={{ type: "spring", damping: 12, stiffness: 220 }}
                whileHover={{ y: -4, scale: 1.05 }}
                whileTap={{ scale: 0.92 }}
                className="relative text-warning"
                aria-label="打开宝箱"
              >
                <motion.div
                  animate={prefersReduced ? undefined : { y: [0, -4, 0] }}
                  transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
                >
                  <Chest className="w-28 h-28 drop-shadow-lg" />
                </motion.div>
              </motion.button>
            ) : (
              <motion.div
                key="open"
                initial={{ scale: 0.5, opacity: 0, rotate: -10 }}
                animate={{ scale: 1, opacity: 1, rotate: 0 }}
                transition={{ type: "spring", damping: 10, stiffness: 220 }}
                className="text-warning"
              >
                {/* 开箱后按档位挂一圈光环 */}
                <motion.div
                  aria-hidden
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0, 1, 0.6] }}
                  transition={{ duration: 0.8 }}
                  className="absolute inset-2 rounded-full pointer-events-none"
                  style={{ boxShadow: fx.ringShadow }}
                />
                <ChestOpen className="w-28 h-28 drop-shadow-lg" />
              </motion.div>
            )}
          </AnimatePresence>

          {/* 开箱后飞出的宝石粒子 */}
          <AnimatePresence>
            {opened &&
              Array.from({ length: fx.particles }).map((_, i) => {
                const angle = (i / fx.particles) * Math.PI * 2 - Math.PI / 2;
                const dist = 70 + Math.random() * (tier === "epic" ? 40 : 20);
                return (
                  <motion.div
                    key={i}
                    initial={{ x: 0, y: 0, opacity: 0, scale: 0.4 }}
                    animate={{
                      x: Math.cos(angle) * dist,
                      y: Math.sin(angle) * dist - 10,
                      opacity: [0, 1, 1, 0],
                      scale: [0.4, 1.1, 1, 0.6],
                    }}
                    transition={{
                      duration: fx.particleDuration,
                      delay: 0.05 * i,
                      ease: "easeOut",
                    }}
                    className="absolute text-secondary pointer-events-none"
                  >
                    {tier === "epic" && i % 3 === 2 ? (
                      <Sparkle className="w-5 h-5 drop-shadow" style={{ color: "#FFC800" }} />
                    ) : (
                      <Gem className="w-5 h-5 drop-shadow" />
                    )}
                  </motion.div>
                );
              })}
          </AnimatePresence>

          {/* rare/epic：更长的彩带雨 */}
          <AnimatePresence>
            {opened &&
              !prefersReduced &&
              fx.ribbons > 0 &&
              Array.from({ length: fx.ribbons }).map((_, i) => {
                const x0 = (i / fx.ribbons - 0.5) * 160 + (Math.random() * 24 - 12);
                return (
                  <motion.span
                    key={`ribbon-${i}`}
                    aria-hidden
                    initial={{ x: x0 * 0.3, y: -10, opacity: 0, rotate: 0 }}
                    animate={{
                      x: x0,
                      y: 120 + Math.random() * 40,
                      opacity: [0, 1, 1, 0],
                      rotate: (Math.random() - 0.5) * 540,
                    }}
                    transition={{
                      duration: tier === "epic" ? 2.2 : 1.5,
                      delay: 0.15 + 0.06 * i,
                      ease: "easeIn",
                    }}
                    className="absolute pointer-events-none"
                    style={{
                      width: 6,
                      height: 12,
                      borderRadius: 2,
                      backgroundColor: RIBBON_COLORS[i % RIBBON_COLORS.length],
                    }}
                  />
                );
              })}
          </AnimatePresence>
        </div>

        {/* 档位标签（rare/epic） */}
        <AnimatePresence>
          {opened && fx.label && (
            <motion.div
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", damping: 12, delay: 0.35 }}
              className="mt-3 text-sm font-extrabold"
              style={{ color: fx.labelColor }}
            >
              {fx.label}
            </motion.div>
          )}
        </AnimatePresence>

        {/* 奖励数字 */}
        <AnimatePresence>
          {opened && (
            <motion.div
              initial={{ scale: 0, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              transition={{ type: "spring", damping: 14, delay: 0.55 }}
              className="mt-3 inline-flex items-center gap-2 px-5 py-3 rounded-2xl font-extrabold text-2xl text-white"
              style={{
                background: fx.rewardBg,
                boxShadow: fx.rewardShadow,
              }}
            >
              <Gem className="w-7 h-7" />
              <span className="tabular-nums">+{gems}</span>
            </motion.div>
          )}
        </AnimatePresence>

        <button
          type="button"
          onClick={() => {
            playSfx("tap");
            haptic("light");
            onClose();
          }}
          className={`mt-6 w-full ${opened ? "btn-chunky-primary" : "btn-chunky-disabled"}`}
          disabled={!opened}
        >
          {opened ? "收下" : "先点开宝箱"}
        </button>
      </div>
    </Modal>
  );
}
