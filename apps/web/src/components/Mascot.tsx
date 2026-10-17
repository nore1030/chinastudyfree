"use client";

/**
 * 聪聪 — 我们的吉祥物：一只熊猫幼崽。
 * 几何与 iOS 版 MascotView.swift（Canvas 绘制）逐点对齐：
 *   viewBox 0 0 120 120；耳朵 (34,30)/(86,30) r13；头 (60,50) rx40 ry37；
 *   身体 (60,82) rx34 ry30；眼圈 (44,50)/(76,50)；眼睛水平线 y≈48；
 *   鼻子 (60,60-68)；脚 (46,104)/(74,104)；手臂 (22,78)/(98,78)。
 *
 * 用纯 SVG 实现（不依赖任何素材），可通过 props 控制表情。
 * mood:
 *   - happy:       默认开心（眨眼睛）
 *   - cheer:       欢呼（眼睛弯成 ^ ^）
 *   - sad:         答错时（眉毛低下）
 *   - think:       思考中（一只眼半闭）
 *   - wave:        挥手打招呼
 *   - surprise:    惊讶（眼睛很大）
 *   - proud:       骄傲（眼睛闪光 + 抬头）
 *   - embarrassed: 尴尬（脸颊红晕 + 眼睛斜视）
 *
 * reactTo: 一次性动画触发器（由父组件通过 key 或 prop 切换）
 *   - 'correct':  scale 弹跳 + 挥手
 *   - 'wrong':    头摇摆 + 汗滴
 *   - 'levelup':  跳跃 + 金色光晕
 *
 * skin: 美妆系统加的"皮肤叠加层"。从 progress store 的 equippedMascotSkin
 *       读取，决定要不要叠加帽子/眼镜/配饰 SVG。
 */

import { motion, useAnimation, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { MascotSkinOverlay } from "./MascotSkinOverlay";
import { useProgressStore } from "@/store/progress";
import type { MascotMood, MascotReaction } from "@cstf/core";

export type { MascotMood, MascotReaction };

export interface MascotProps {
  mood?: MascotMood;
  size?: number;
  animate?: boolean;
  reactTo?: MascotReaction;
  /** 每次 reactKey 变化时触发一次 reactTo 动画 */
  reactKey?: number;
  /**
   * 皮肤覆盖：如果传入则用这个 skin id；否则读 progress store 里
   * 当前装备的皮肤。让 shop 页面试穿场景可以传 prop 直接预览。
   */
  skinOverride?: string | null;
}

// 与 iOS MascotView.swift 相同的熊猫调色
const EEL = "#3A3A3A";
const PANDA_BLACK = "#2E2E2E";
const BODY_WHITE = "#FBFBFB";
const BODY_SHADE = "#E9EDEF";
const BLUSH = "#FF9AA8";

export function Mascot({
  mood = "happy",
  size = 120,
  animate = true,
  reactTo = null,
  reactKey = 0,
  skinOverride,
}: MascotProps) {
  const prefersReduced = useReducedMotion();
  const controls = useAnimation();
  const armControls = useAnimation();
  const [blinkClose, setBlinkClose] = useState(false);
  const [showSweat, setShowSweat] = useState(false);
  const [showGlow, setShowGlow] = useState(false);

  const equippedSkin = useProgressStore(s => s.equippedMascotSkin);
  const skinId = skinOverride !== undefined ? skinOverride : equippedSkin;

  // 持续呼吸
  useEffect(() => {
    if (!animate || prefersReduced) return;
    controls.start({
      y: [0, -3, 0],
      scale: [1, 1.02, 1],
      transition: { duration: 2.6, repeat: Infinity, ease: "easeInOut" },
    });
  }, [animate, prefersReduced, controls]);

  // 随机眨眼（仅在 happy/think/wave 时视觉合理；cheer/sad 时 Eyes 会自己替换）
  useEffect(() => {
    if (!animate || prefersReduced) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const next = 2500 + Math.random() * 3500;
      timer = setTimeout(() => {
        setBlinkClose(true);
        setTimeout(() => setBlinkClose(false), 120);
        schedule();
      }, next);
    };
    schedule();
    return () => clearTimeout(timer);
  }, [animate, prefersReduced]);

  // 一次性反应动画
  useEffect(() => {
    if (!reactTo || prefersReduced) return;
    setShowSweat(false);
    setShowGlow(false);
    if (reactTo === "correct") {
      controls.start({
        scale: [1, 1.18, 0.95, 1.05, 1],
        y: [0, -6, 0],
        transition: { duration: 0.55, ease: "easeOut" },
      });
      armControls.start({
        rotate: [0, -25, 0, -18, 0],
        transition: { duration: 0.55 },
      });
    } else if (reactTo === "wrong") {
      controls.start({
        rotate: [0, -8, 8, -6, 6, 0],
        x: [0, -2, 2, 0],
        transition: { duration: 0.55 },
      });
      setShowSweat(true);
      setTimeout(() => setShowSweat(false), 1200);
    } else if (reactTo === "levelup") {
      setShowGlow(true);
      controls.start({
        y: [0, -18, 0, -8, 0],
        scale: [1, 1.1, 1, 1.05, 1],
        transition: { duration: 0.9, ease: "easeOut" },
      });
      armControls.start({
        rotate: [0, -30, 0, -30, 0],
        transition: { duration: 0.9 },
      });
      setTimeout(() => setShowGlow(false), 1400);
    }
  }, [reactTo, reactKey, controls, armControls, prefersReduced]);

  return (
    <div style={{ width: size, height: size, position: "relative", display: "inline-block" }}>
      {showGlow && (
        <motion.div
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: [0, 0.8, 0], scale: [0.6, 1.4, 1.6] }}
          transition={{ duration: 1.2 }}
          style={{
            position: "absolute",
            inset: "-20%",
            borderRadius: "9999px",
            background: "radial-gradient(circle, rgba(255,200,0,0.55), rgba(255,200,0,0) 70%)",
            pointerEvents: "none",
          }}
        />
      )}
      <motion.svg
        animate={controls}
        width={size}
        height={size}
        viewBox="0 0 120 120"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="聪聪"
        style={{ display: "block" }}
      >
        {/* 耳朵（黑色圆） */}
        <circle cx="34" cy="30" r="13" fill={PANDA_BLACK} />
        <circle cx="86" cy="30" r="13" fill={PANDA_BLACK} />

        {/* 左手臂（黑色，reactTo 时会挥动；wave 表情抬高） */}
        <motion.ellipse
          cx="22"
          cy="78"
          rx="9"
          ry="15"
          fill={PANDA_BLACK}
          style={{ originX: "60px", originY: "78px" } as React.CSSProperties}
          animate={armControls}
          transform={mood === "wave" ? "rotate(-40 22 78)" : undefined}
        />
        {/* 右手臂 */}
        <ellipse cx="98" cy="78" rx="9" ry="15" fill={PANDA_BLACK} />

        {/* 脚（黑色，底部） */}
        <ellipse cx="46" cy="104" rx="11" ry="8" fill={PANDA_BLACK} />
        <ellipse cx="74" cy="104" rx="11" ry="8" fill={PANDA_BLACK} />

        {/* 身体 + 头（白色圆润团子） */}
        <ellipse cx="60" cy="82" rx="34" ry="30" fill={BODY_WHITE} />
        <ellipse cx="60" cy="50" rx="40" ry="37" fill={BODY_WHITE} />
        {/* 肚皮淡影 */}
        <ellipse cx="60" cy="84" rx="20" ry="18" fill={BODY_SHADE} opacity={0.6} />

        {/* 黑眼圈（斜椭圆） */}
        <ellipse cx="44" cy="50" rx="12" ry="15" fill={PANDA_BLACK} />
        <ellipse cx="76" cy="50" rx="12" ry="15" fill={PANDA_BLACK} />

        {/* 眼圈上的白色眼窝 */}
        <circle cx="45" cy="48" r="8.5" fill={BODY_WHITE} />
        <circle cx="75" cy="48" r="8.5" fill={BODY_WHITE} />

        {/* 眼珠（按 mood 切换；blinkClose 时盖上眼皮） */}
        {blinkClose && (mood === "happy" || mood === "think" || mood === "wave") ? (
          <>
            <path d="M 32 48 Q 44 52 56 48" fill="none" stroke={EEL} strokeWidth="3" strokeLinecap="round" />
            <path d="M 64 48 Q 76 52 88 48" fill="none" stroke={EEL} strokeWidth="3" strokeLinecap="round" />
          </>
        ) : (
          <Eyes mood={mood} />
        )}

        {/* 鼻子（黑色圆角三角） */}
        <path
          d="M 54 60 Q 60 58 66 60 Q 66 66 60 68 Q 54 66 54 60 Z"
          fill={PANDA_BLACK}
        />
        {/* 嘴（鼻下小微笑） */}
        <path
          d="M 60 68 L 60 72 Q 64 76 68 74 M 60 72 Q 56 76 52 74"
          fill="none"
          stroke={PANDA_BLACK}
          strokeWidth="2"
          strokeLinecap="round"
        />

        {/* 尴尬红晕 */}
        {mood === "embarrassed" && (
          <>
            <ellipse cx="32" cy="62" rx="6" ry="3.5" fill={BLUSH} opacity={0.7} />
            <ellipse cx="88" cy="62" rx="6" ry="3.5" fill={BLUSH} opacity={0.7} />
          </>
        )}

        {/* 汗滴（答错时） */}
        {showSweat && (
          <motion.path
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: [0, 1, 1, 0], y: [-4, 2, 8, 14] }}
            transition={{ duration: 1.1 }}
            d="M 96 24 Q 100 32 96 36 Q 92 32 96 24 Z"
            fill="#7EC4F0"
            stroke="#1CB0F6"
            strokeWidth="1.2"
          />
        )}

        {/* 皮肤叠加层（帽子 / 眼镜 / 配饰） */}
        <MascotSkinOverlay skinId={skinId} />
      </motion.svg>
    </div>
  );
}

function Eyes({ mood }: { mood: MascotMood }) {
  switch (mood) {
    case "cheer":
      return (
        <>
          <path d="M 36 48 Q 44 40 52 48" fill="none" stroke={EEL} strokeWidth="3" strokeLinecap="round" />
          <path d="M 68 48 Q 76 40 84 48" fill="none" stroke={EEL} strokeWidth="3" strokeLinecap="round" />
        </>
      );
    case "sad":
      return (
        <>
          <circle cx="44" cy="50" r="4" fill={EEL} />
          <circle cx="76" cy="50" r="4" fill={EEL} />
          <path d="M 32 38 L 50 42" stroke={EEL} strokeWidth="2.5" strokeLinecap="round" />
          <path d="M 88 38 L 70 42" stroke={EEL} strokeWidth="2.5" strokeLinecap="round" />
        </>
      );
    case "think":
      return (
        <>
          <circle cx="44" cy="48" r="5" fill={EEL} />
          <circle cx="45.5" cy="46.5" r="1.5" fill="#FFFFFF" />
          <path d="M 68 48 Q 76 46 84 48" fill="none" stroke={EEL} strokeWidth="2.5" strokeLinecap="round" />
        </>
      );
    case "surprise":
      return (
        <>
          <circle cx="44" cy="48" r="7" fill={EEL} />
          <circle cx="46" cy="46" r="2" fill="#FFFFFF" />
          <circle cx="76" cy="48" r="7" fill={EEL} />
          <circle cx="78" cy="46" r="2" fill="#FFFFFF" />
        </>
      );
    case "proud":
      // 闪闪发光的眼睛 + 上扬眉毛 → 自信
      return (
        <>
          <circle cx="44" cy="48" r="5" fill={EEL} />
          <circle cx="45.5" cy="46.5" r="1.8" fill="#FFFFFF" />
          <circle cx="42" cy="50" r="0.9" fill="#FFFFFF" />
          <circle cx="76" cy="48" r="5" fill={EEL} />
          <circle cx="77.5" cy="46.5" r="1.8" fill="#FFFFFF" />
          <circle cx="74" cy="50" r="0.9" fill="#FFFFFF" />
          {/* 上扬眉毛 */}
          <path d="M 32 38 Q 40 34 50 40" stroke={EEL} strokeWidth="2.5" strokeLinecap="round" fill="none" />
          <path d="M 88 38 Q 80 34 70 40" stroke={EEL} strokeWidth="2.5" strokeLinecap="round" fill="none" />
        </>
      );
    case "embarrassed":
      // 斜视小眼（红晕在主体层画）
      return (
        <>
          <circle cx="44" cy="50" r="3.5" fill={EEL} />
          <circle cx="76" cy="50" r="3.5" fill={EEL} />
        </>
      );
    case "wave":
    case "happy":
    default:
      return (
        <>
          <circle cx="44" cy="48" r="5" fill={EEL} />
          <circle cx="45.5" cy="46.5" r="1.5" fill="#FFFFFF" />
          <circle cx="76" cy="48" r="5" fill={EEL} />
          <circle cx="77.5" cy="46.5" r="1.5" fill="#FFFFFF" />
        </>
      );
  }
}
