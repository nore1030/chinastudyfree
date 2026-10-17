/**
 * icons.tsx — 自绘 SVG 图标库
 *
 * 设计原则（高级感 / 不花哨）：
 *   - 统一 24×24 viewBox
 *   - line 图标：stroke="currentColor"，strokeWidth 1.75（默认），linecap/linejoin = round
 *   - 实体图标（Heart / Flame / Volume 喇叭体）：fill="currentColor"
 *   - 仅使用基本几何：圆、直线、贝塞尔；拒绝装饰细节、拒绝多色
 *   - 所有图标都通过 className 接收 text-* / w-* / h-* / fill-* Tailwind 类
 *
 * 使用：
 *   import { Heart, ArrowLeft } from "@/components/icons";
 *   <Heart className="w-6 h-6 text-danger" />
 */

import * as React from "react";

export type IconProps = React.SVGProps<SVGSVGElement> & { size?: number | string };

const COMMON = {
  viewBox: "0 0 24 24",
  xmlns: "http://www.w3.org/2000/svg",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

// ============================================================
// 线性图标（fill="none" stroke="currentColor"）
// ============================================================

export function ArrowLeft({ size = 24, ...props }: IconProps) {
  return (
    <svg
      {...COMMON}
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      {...props}
    >
      <path d="M19 12H5" />
      <path d="M12 5l-7 7 7 7" />
    </svg>
  );
}

/** 关闭按钮：细斜十字 */
export function Close({ size = 24, ...props }: IconProps) {
  return (
    <svg
      {...COMMON}
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      {...props}
    >
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </svg>
  );
}

/** 勾：纯粹一笔，强调肯定 */
export function Check({ size = 24, ...props }: IconProps) {
  return (
    <svg
      {...COMMON}
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      {...props}
    >
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

/** 错：粗一点的十字（用作"错"题强调） */
export function XMark({ size = 24, ...props }: IconProps) {
  return (
    <svg
      {...COMMON}
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      {...props}
    >
      <path d="M6.5 6.5l11 11" />
      <path d="M17.5 6.5l-11 11" />
    </svg>
  );
}

export function CheckCircle({ size = 24, ...props }: IconProps) {
  return (
    <svg
      {...COMMON}
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      {...props}
    >
      <circle cx="12" cy="12" r="9.25" />
      <path d="M8 12.5l3 3 5.2-6" strokeWidth={2} />
    </svg>
  );
}

export function XCircle({ size = 24, ...props }: IconProps) {
  return (
    <svg
      {...COMMON}
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      {...props}
    >
      <circle cx="12" cy="12" r="9.25" />
      <path d="M9 9l6 6" strokeWidth={2} />
      <path d="M15 9l-6 6" strokeWidth={2} />
    </svg>
  );
}

/** 锁：圆角锁体 + 半圆锁梁 */
export function Lock({ size = 24, ...props }: IconProps) {
  return (
    <svg
      {...COMMON}
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      {...props}
    >
      <rect x="4.5" y="10.5" width="15" height="10" rx="2.2" />
      <path d="M7.75 10.5V8a4.25 4.25 0 0 1 8.5 0v2.5" />
    </svg>
  );
}

/** 书：打开的书本（两页对称） */
export function BookOpen({ size = 24, ...props }: IconProps) {
  return (
    <svg
      {...COMMON}
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      {...props}
    >
      <path d="M12 6.5v13" />
      <path d="M3 5.5c2.8-.6 5.5-.4 8 1 .6.3 1 1 1 1.7V19c-2.6-1.5-5.4-1.7-8-1V5.5z" />
      <path d="M21 5.5c-2.8-.6-5.5-.4-8 1-.6.3-1 1-1 1.7V19c2.6-1.5 5.4-1.7 8-1V5.5z" />
    </svg>
  );
}

// ============================================================
// 实体图标（fill="currentColor"）
// ============================================================

/** 心：单一贝塞尔填充，端庄 */
export function Heart({ size = 24, ...props }: IconProps) {
  return (
    <svg
      {...COMMON}
      width={size}
      height={size}
      fill="currentColor"
      stroke="none"
      {...props}
    >
      <path d="M12 20.3c-.4 0-.9-.15-1.25-.45C6.9 16.6 3 13.55 3 9.4 3 6.95 4.95 5 7.4 5c1.55 0 3.05.8 3.9 2.05.3.45 1.1.45 1.4 0C13.55 5.8 15.05 5 16.6 5 19.05 5 21 6.95 21 9.4c0 4.15-3.9 7.2-7.75 10.45-.35.3-.85.45-1.25.45z" />
    </svg>
  );
}

/** 火焰：单一水滴状轮廓，低调 */
export function Flame({ size = 24, ...props }: IconProps) {
  return (
    <svg
      {...COMMON}
      width={size}
      height={size}
      fill="currentColor"
      stroke="none"
      {...props}
    >
      <path d="M12 2.5c.3 2.2-.85 3.45-2.2 4.9C8.2 9 6.75 10.75 6.75 13.5 6.75 17.4 9.6 20.5 13 20.5c3.4 0 6.25-3.1 6.25-7 0-2.85-1.7-4.55-3.5-6.35-1.35-1.35-2.2-2.9-2-4.65H12z" />
    </svg>
  );
}

/** 星：标准 5 角星，端正，几何精确 */
export function Star({ size = 24, ...props }: IconProps) {
  return (
    <svg
      {...COMMON}
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      {...props}
    >
      <path d="M12 3.25l2.85 5.78 6.4.93-4.63 4.51 1.09 6.36L12 17.82l-5.71 3.01 1.09-6.36L2.75 9.96l6.4-.93L12 3.25z" />
    </svg>
  );
}

/** 王冠：三峰剪影，简洁庄重 */
export function Crown({ size = 24, ...props }: IconProps) {
  return (
    <svg
      {...COMMON}
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      {...props}
    >
      <path d="M3 8.5l3.25 9.5h11.5L21 8.5l-4.6 3.25L12 5.25l-4.4 6.5L3 8.5z" />
      <path d="M6.25 20.5h11.5" />
    </svg>
  );
}

// ============================================================
// 音频图标
// ============================================================

/** 有声：喇叭体 + 两道弧形声波 */
export function Volume({ size = 24, ...props }: IconProps) {
  return (
    <svg
      {...COMMON}
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      {...props}
    >
      <path d="M4 10.25v3.5c0 .4.35.75.75.75H7.5l4.25 3.4c.5.4 1.25.05 1.25-.6V6.8c0-.65-.75-1-1.25-.6L7.5 9.6H4.75c-.4 0-.75.35-.75.65z" fill="currentColor" />
      <path d="M16 9.5c1.25 1.25 1.25 3.75 0 5" />
      <path d="M18.5 7c2.5 2.5 2.5 7.5 0 10" />
    </svg>
  );
}

// ============================================================
// 年级主题图标（生长旅程：苹果 → 萌芽 → 树 → 蝴蝶 → 火箭 → 奖杯）
// 全部线性，stroke 1.75，统一风格，默认 currentColor
// ============================================================

/** 苹果 — 一年级 */
export function Apple({ size = 24, ...props }: IconProps) {
  return (
    <svg
      {...COMMON}
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      {...props}
    >
      <path d="M12 8.4c-1.6-1.5-4.3-1.3-5.7 1-1.5 2.6-.7 7.2 2 9.8 1.1 1 2.4 1.2 3.7.3.3-.2.6-.2.9 0 1.3.9 2.6.7 3.7-.3 2.7-2.6 3.5-7.2 2-9.8-1.4-2.3-4.1-2.5-5.7-1.1-.3.2-.6.2-.9 0z" />
      <path d="M12 8V4.5" />
      <path d="M12 6.5c1.3-1.8 3.3-1.6 4-.5-.8 1.2-2.7 1.4-4 .5z" />
    </svg>
  );
}

/** 萌芽 — 二年级 */
export function Sprout({ size = 24, ...props }: IconProps) {
  return (
    <svg
      {...COMMON}
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      {...props}
    >
      <path d="M4.5 20.5h15" />
      <path d="M12 20.5V10" />
      <path d="M12 13.5c-3 0-5-2-5.5-5.5 3.5.5 5.5 2.5 5.5 5.5z" />
      <path d="M12 11c0-3 2-5 5.5-5.5C17 9 15 11 12 11z" />
    </svg>
  );
}

/** 树 — 三年级 */
export function Tree({ size = 24, ...props }: IconProps) {
  return (
    <svg
      {...COMMON}
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      {...props}
    >
      <path d="M12 3c-4 0-7 3-7 6.5 0 1.8 1 3.3 2.4 4.2-.9.6-1.4 1.6-1.4 2.6 0 1.8 1.7 3.2 4 3.2h4c2.3 0 4-1.4 4-3.2 0-1-.5-2-1.4-2.6C18 12.8 19 11.3 19 9.5 19 6 16 3 12 3z" />
      <path d="M12 19.5V22" />
    </svg>
  );
}

/** 蝴蝶 — 四年级 */
export function Butterfly({ size = 24, ...props }: IconProps) {
  return (
    <svg
      {...COMMON}
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      {...props}
    >
      <path d="M12 7.5v11" />
      <path d="M12 9.5c-2-3-5-4-7-3s-2 5 0 7 4.5 1.5 5.5.5c.5-.5 1-1 1.5-2" />
      <path d="M12 9.5c2-3 5-4 7-3s2 5 0 7-4.5 1.5-5.5.5c-.5-.5-1-1-1.5-2" />
      <path d="M12 7.5c-.7-1.5-1.6-2.3-2.8-2.3" />
      <path d="M12 7.5c.7-1.5 1.6-2.3 2.8-2.3" />
    </svg>
  );
}

/** 火箭 — 五年级 */
export function Rocket({ size = 24, ...props }: IconProps) {
  return (
    <svg
      {...COMMON}
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      {...props}
    >
      <path d="M12 3c2.7 2.2 4 5.3 4 8.7V17H8v-5.3C8 8.3 9.3 5.2 12 3z" />
      <circle cx="12" cy="10" r="1.75" />
      <path d="M8 13.5l-3 3.5 3 .5" />
      <path d="M16 13.5l3 3.5-3 .5" />
      <path d="M10 17.5l-.5 3" />
      <path d="M14 17.5l.5 3" />
      <path d="M12 17.5v3" />
    </svg>
  );
}

/** 奖杯 — 六年级 */
export function Trophy({ size = 24, ...props }: IconProps) {
  return (
    <svg
      {...COMMON}
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      {...props}
    >
      <path d="M7 4.5h10v4.5c0 3-2.2 5.5-5 5.5s-5-2.5-5-5.5V4.5z" />
      <path d="M7 6.5C5 6.5 4 7.5 4 9s1 2.5 3 2.5" />
      <path d="M17 6.5c2 0 3 1 3 2.5s-1 2.5-3 2.5" />
      <path d="M12 14.5v2.5" />
      <path d="M9 17h6v3H9z" />
      <path d="M7.5 20h9" />
    </svg>
  );
}

/** 用户 — 个人主页 */
export function User({ size = 24, ...props }: IconProps) {
  return (
    <svg
      {...COMMON}
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      {...props}
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1-4.5 4.5-7 8-7s7 2.5 8 7" />
    </svg>
  );
}

/** 书签 — 错题本 */
export function Bookmark({ size = 24, ...props }: IconProps) {
  return (
    <svg
      {...COMMON}
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      {...props}
    >
      <path d="M6 3.5h12v18l-6-4-6 4v-18z" />
    </svg>
  );
}

/** 目标 — 每日目标 */
export function Target({ size = 24, ...props }: IconProps) {
  return (
    <svg
      {...COMMON}
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      {...props}
    >
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    </svg>
  );
}

/** 雪花 — 连胜护盾 */
export function Snowflake({ size = 24, ...props }: IconProps) {
  return (
    <svg
      {...COMMON}
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      {...props}
    >
      <path d="M12 3v18" />
      <path d="M3 12h18" />
      <path d="M5.5 5.5l13 13" />
      <path d="M18.5 5.5l-13 13" />
      <path d="M9 5.5l3 2 3-2" />
      <path d="M9 18.5l3-2 3 2" />
      <path d="M5.5 9l2 3-2 3" />
      <path d="M18.5 9l-2 3 2 3" />
    </svg>
  );
}

/** 垃圾桶 — 删除错题 */
export function Trash({ size = 24, ...props }: IconProps) {
  return (
    <svg
      {...COMMON}
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      {...props}
    >
      <path d="M4 7h16" />
      <path d="M10 4h4a1 1 0 0 1 1 1v2H9V5a1 1 0 0 1 1-1z" />
      <path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" />
      <path d="M10 11v7" />
      <path d="M14 11v7" />
    </svg>
  );
}

/** 闪电 — 经验值 XP */
export function Lightning({ size = 24, ...props }: IconProps) {
  return (
    <svg
      {...COMMON}
      width={size}
      height={size}
      fill="currentColor"
      stroke="none"
      {...props}
    >
      <path d="M13.5 2.5L4 13.5h6L9.5 21.5 20 10h-6l-.5-7.5z" />
    </svg>
  );
}

/** 书 — 统一的教材图标（上册/下册共用） */
export function Book({ size = 24, ...props }: IconProps) {
  return (
    <svg
      {...COMMON}
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      {...props}
    >
      <path d="M6 3.5h11a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1H7.5A1.5 1.5 0 0 1 6 18.5v-15z" />
      <path d="M6 17.5h12" />
    </svg>
  );
}

/** 静音：喇叭体 + 斜十字 */
export function VolumeMute({ size = 24, ...props }: IconProps) {
  return (
    <svg
      {...COMMON}
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      {...props}
    >
      <path d="M4 10.25v3.5c0 .4.35.75.75.75H7.5l4.25 3.4c.5.4 1.25.05 1.25-.6V6.8c0-.65-.75-1-1.25-.6L7.5 9.6H4.75c-.4 0-.75.35-.75.65z" fill="currentColor" />
      <path d="M22 9.5l-5 5" />
      <path d="M17 9.5l5 5" />
    </svg>
  );
}

/** Gem —— 多面切割的宝石/钻石，实体填充 */
export function Gem({ size = 24, ...props }: IconProps) {
  return (
    <svg {...COMMON} width={size} height={size} fill="currentColor" {...props}>
      <path d="M6 3h12l4 6-10 12L2 9l4-6z" fill="currentColor" />
      <path d="M2 9h20" stroke="white" strokeWidth={1.2} fill="none" opacity={0.55} />
      <path d="M12 21l-3-12" stroke="white" strokeWidth={1.2} fill="none" opacity={0.55} />
      <path d="M12 21l3-12" stroke="white" strokeWidth={1.2} fill="none" opacity={0.55} />
      <path d="M9 9L6 3" stroke="white" strokeWidth={1.2} fill="none" opacity={0.55} />
      <path d="M15 9l3-6" stroke="white" strokeWidth={1.2} fill="none" opacity={0.55} />
    </svg>
  );
}

/** Chest —— 封闭宝箱（未开） */
export function Chest({ size = 24, ...props }: IconProps) {
  return (
    <svg {...COMMON} width={size} height={size} fill="currentColor" {...props}>
      <path d="M3 10.5V19a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-8.5H3z" fill="currentColor" />
      <path d="M3 10.5V8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2.5" fill="currentColor" opacity={0.85} />
      <rect x="10.5" y="12" width="3" height="4" rx="0.5" fill="white" opacity={0.9} />
      <circle cx="12" cy="13.8" r="0.7" fill="currentColor" />
      <path d="M3 10.5h18" stroke="white" strokeWidth={1.2} fill="none" opacity={0.6} />
    </svg>
  );
}

/** ChestOpen —— 打开的宝箱，盖子掀起 */
export function ChestOpen({ size = 24, ...props }: IconProps) {
  return (
    <svg {...COMMON} width={size} height={size} fill="currentColor" {...props}>
      <path d="M3 11V19a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-8H3z" fill="currentColor" />
      <path d="M2 11L12 2l10 9" fill="currentColor" opacity={0.85} stroke="currentColor" strokeWidth={0.6} />
      <rect x="10.5" y="12.5" width="3" height="4" rx="0.5" fill="white" opacity={0.9} />
      <path d="M3 11h18" stroke="white" strokeWidth={1.2} fill="none" opacity={0.6} />
    </svg>
  );
}

/** Sparkle —— 四角闪光，用于"首次完美"等亮点提示 */
export function Sparkle({ size = 24, ...props }: IconProps) {
  return (
    <svg
      {...COMMON}
      width={size}
      height={size}
      fill="currentColor"
      stroke="none"
      {...props}
    >
      <path d="M12 2.5l1.6 5.4 5.4 1.6-5.4 1.6-1.6 5.4-1.6-5.4L5 9.5l5.4-1.6L12 2.5z" />
      <path d="M19 14l.7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7L19 14z" opacity={0.7} />
      <path d="M5 16l.5 1.5 1.5.5-1.5.5L5 20l-.5-1.5L3 18l1.5-.5L5 16z" opacity={0.5} />
    </svg>
  );
}

/** Palette —— 调色盘（用于"界面主题"商店分类） */
export function Palette({ size = 24, ...props }: IconProps) {
  return (
    <svg
      {...COMMON}
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinejoin="round"
      {...props}
    >
      <path d="M12 3.5c-4.7 0-8.5 3.6-8.5 8.1 0 4 2.7 6.4 6 6.4 1.5 0 2-1.4 2-2.4 0-1.1-1-1.7-1-2.7 0-1 .8-1.7 1.8-1.7H15a4.5 4.5 0 0 0 4.5-4.5C19.5 5.4 16.1 3.5 12 3.5z" />
      <circle cx="7.5" cy="10" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="11" cy="6.7" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="7.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="17.5" cy="11.5" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Picture —— 风景图（山 + 太阳，用于"课堂背景"商店分类） */
export function Picture({ size = 24, ...props }: IconProps) {
  return (
    <svg
      {...COMMON}
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinejoin="round"
      {...props}
    >
      <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
      <circle cx="8" cy="9.5" r="1.5" fill="currentColor" stroke="none" />
      <path d="M3.5 17.5l5-5 4 4 3-3 5 5" />
    </svg>
  );
}

/** Panda —— 熊猫聪聪脸（用于"聪聪皮肤"商店分类 / 路径装饰） */
export function Panda({ size = 24, ...props }: IconProps) {
  return (
    <svg
      {...COMMON}
      width={size}
      height={size}
      fill="currentColor"
      stroke="none"
      {...props}
    >
      {/* 耳朵 */}
      <circle cx="6.2" cy="6" r="2.6" />
      <circle cx="17.8" cy="6" r="2.6" />
      {/* 头（白脸走镂空：先画实心头，再用白色画脸） */}
      <circle cx="12" cy="12.5" r="8.5" />
      <circle cx="12" cy="12.5" r="6.9" fill="white" />
      {/* 眼圈 */}
      <ellipse cx="9" cy="11.6" rx="2.2" ry="2.8" fill="currentColor" transform="rotate(-12 9 11.6)" />
      <ellipse cx="15" cy="11.6" rx="2.2" ry="2.8" fill="currentColor" transform="rotate(12 15 11.6)" />
      {/* 眼珠高光 */}
      <circle cx="9.3" cy="11.2" r="0.8" fill="white" />
      <circle cx="14.7" cy="11.2" r="0.8" fill="white" />
      {/* 鼻子 + 嘴 */}
      <ellipse cx="12" cy="15" rx="1.3" ry="1" fill="currentColor" />
      <path d="M12 16v1.1M12 17.1q1 1 2 .5M12 17.1q-1 1-2 .5" stroke="currentColor" strokeWidth="0.9" fill="none" />
    </svg>
  );
}

/** Confetti —— 庆祝彩带（替代 🎉 emoji） */
export function Home({ size = 24, ...props }: IconProps) {
  return (
    <svg
      {...COMMON}
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M3 11.5L12 4l9 7.5" />
      <path d="M5 10v10h14V10" />
      <path d="M10 20v-6h4v6" />
    </svg>
  );
}

export function Confetti({ size = 24, ...props }: IconProps) {
  return (
    <svg
      {...COMMON}
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      {...props}
    >
      <path d="M4 20l4-12 8 8-12 4z" fill="currentColor" stroke="none" />
      <path d="M14 4l1.5 1.5M19 6l1 -2M19 10l2 0M16 12l1.5 1.5" />
    </svg>
  );
}

export function Medal({ size = 24, ...props }: IconProps) {
  return (
    <svg {...COMMON} width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.75} {...props}>
      <path d="M7 3l3 6M17 3l-3 6" />
      <circle cx={12} cy={15} r={6} />
      <path d="M9 13l3 2 3-2v4l-3 -1.5L9 17z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function Bell({ size = 24, ...props }: IconProps) {
  return (
    <svg {...COMMON} width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.75} {...props}>
      <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2H4.5z" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </svg>
  );
}

export function Calendar({ size = 24, ...props }: IconProps) {
  return (
    <svg {...COMMON} width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.75} {...props}>
      <rect x={3} y={5} width={18} height={16} rx={3} />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}

export function TrendingUp({ size = 24, ...props }: IconProps) {
  return (
    <svg {...COMMON} width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.75} {...props}>
      <path d="M3 17l6-6 4 4 8-8" />
      <path d="M14 7h7v7" />
    </svg>
  );
}

export function CloudOff({ size = 24, ...props }: IconProps) {
  return (
    <svg {...COMMON} width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.75} {...props}>
      <path d="M3 3l18 18" />
      <path d="M9 5a5 5 0 0 1 9 3 4 4 0 0 1 1.5 7.6" />
      <path d="M16 18H7a4 4 0 0 1 -1.5 -7.7" />
    </svg>
  );
}

export function Smile({ size = 24, ...props }: IconProps) {
  return (
    <svg {...COMMON} width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.75} {...props}>
      <circle cx={12} cy={12} r={9} />
      <path d="M9 14a3.5 3.5 0 0 0 6 0" />
      <circle cx={9} cy={10} r={0.8} fill="currentColor" />
      <circle cx={15} cy={10} r={0.8} fill="currentColor" />
    </svg>
  );
}

export function Sun({ size = 24, ...props }: IconProps) {
  return (
    <svg {...COMMON} width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.75} {...props}>
      <circle cx={12} cy={12} r={4} />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4l1.4 -1.4M17 7l1.4 -1.4" />
    </svg>
  );
}

export function Moon({ size = 24, ...props }: IconProps) {
  return (
    <svg {...COMMON} width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.75} {...props}>
      <path d="M21 12.5A9 9 0 1 1 11.5 3a7 7 0 0 0 9.5 9.5z" />
    </svg>
  );
}

/** 屏幕/自动 —— 三态主题「跟随系统」档 */
export function MonitorIcon({ size = 24, ...props }: IconProps) {
  return (
    <svg {...COMMON} width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.75} {...props}>
      <rect x="3" y="4.5" width="18" height="13" rx="2.5" />
      <path d="M9 21h6M12 17.5V21" />
    </svg>
  );
}

// ============================================================
// 粗填充变体（web-shell-19）—— 导航/HUD 激活态使用，
// 视觉重量对齐 iOS 的 SF Symbols .fill 图标
// ============================================================

/** Home 填充版 —— 导航「学习」激活态 */
export function HomeFill({ size = 24, ...props }: IconProps) {
  return (
    <svg {...COMMON} width={size} height={size} fill="currentColor" stroke="none" {...props}>
      <path d="M12 3.2c.35 0 .7.12.98.35l7.5 6.25c.33.28.52.69.52 1.12V19.5A1.5 1.5 0 0 1 19.5 21H15a1 1 0 0 1-1-1v-4.5h-4V20a1 1 0 0 1-1 1H4.5A1.5 1.5 0 0 1 3 19.5v-8.58c0-.43.19-.84.52-1.12l7.5-6.25c.28-.23.63-.35.98-.35z" />
    </svg>
  );
}

/** Trophy 填充版 —— 导航「排行榜」激活态 */
export function TrophyFill({ size = 24, ...props }: IconProps) {
  return (
    <svg {...COMMON} width={size} height={size} fill="currentColor" stroke="none" {...props}>
      <path d="M7 3.5h10a1 1 0 0 1 1 1v.75h2.1a1 1 0 0 1 1 1.05c-.12 2.4-1.4 4.35-3.6 4.95A5.6 5.6 0 0 1 13.5 14.3v2.2H15a1 1 0 0 1 1 1v1.3h1.25a1 1 0 0 1 1 1v.2a1 1 0 0 1-1 1H6.75a1 1 0 0 1-1-1v-.2a1 1 0 0 1 1-1H8v-1.3a1 1 0 0 1 1-1h1.5v-2.2A5.6 5.6 0 0 1 6.5 11.25c-2.2-.6-3.48-2.55-3.6-4.95a1 1 0 0 1 1-1.05H6V4.5a1 1 0 0 1 1-1zM6 6.75H4.95c.2 1.35.85 2.35 1.85 2.85A9.7 9.7 0 0 1 6 6.75zm12 0c0 1.05-.3 2-.8 2.85 1-.5 1.65-1.5 1.85-2.85H18z" />
    </svg>
  );
}

/** Bookmark 填充版 —— 导航「错题本」激活态 */
export function BookmarkFill({ size = 24, ...props }: IconProps) {
  return (
    <svg {...COMMON} width={size} height={size} fill="currentColor" stroke="none" {...props}>
      <path d="M6.5 2.75h11a1 1 0 0 1 1 1V20.6a1 1 0 0 1-1.55.83L12 18.1l-4.95 3.33a1 1 0 0 1-1.55-.83V3.75a1 1 0 0 1 1-1z" />
    </svg>
  );
}

/** User 填充版 —— 导航「我的」激活态 */
export function UserFill({ size = 24, ...props }: IconProps) {
  return (
    <svg {...COMMON} width={size} height={size} fill="currentColor" stroke="none" {...props}>
      <circle cx="12" cy="7.75" r="4.5" />
      <path d="M12 13.75c4 0 7.6 2.6 8.7 6.55.17.6-.3 1.2-.93 1.2H4.23c-.63 0-1.1-.6-.93-1.2 1.1-3.95 4.7-6.55 8.7-6.55z" />
    </svg>
  );
}
