"use client";

/**
 * MascotSkinOverlay —— 吉祥物皮肤的 SVG 叠加层。
 *
 * 这是 Mascot.tsx 内部 <svg viewBox="0 0 120 120"> 的子元素，
 * 根据装备的 skin id 渲染对应的帽子 / 眼镜 / 配件 SVG。
 *
 * 配件坐标从 iOS MascotView.swift 的 drawAccessory 逐点移植，
 * 锚点参考熊猫主体几何：
 *   - 头中心 ≈ (60, 50)，半径 ≈ 37（头顶边缘 y ≈ 13）
 *   - 耳朵 (34, 30) / (86, 30)
 *   - 双眼水平 y ≈ 48
 *   - 脖颈/胸口 ≈ y 88
 *
 * 所有装饰只用基础 SVG primitive（path/circle/rect/ellipse），零外部依赖。
 */

import * as React from "react";

const GOLD = "#FFC800";
const GOLD_DARK = "#E0A800";
const DARK = "#2E2E2E";

interface MascotSkinOverlayProps {
  skinId?: string | null;
}

export function MascotSkinOverlay({ skinId }: MascotSkinOverlayProps) {
  switch (skinId) {
    case "skin_graduate":
      return <GraduateCap />;
    case "skin_glasses":
      return <RoundGlasses />;
    case "skin_party":
      return <PartyHat />;
    case "skin_crown":
      return <GoldCrown />;
    case "skin_wizard":
      return <WizardHat />;
    case "skin_astronaut":
      return <AstronautHelmet />;
    case "skin_sunglasses":
      return <Sunglasses />;
    case "skin_pirate":
      return <PirateHat />;
    case "skin_headphones":
      return <Headphones />;
    case "skin_laurel":
      return <LaurelWreath />;
    case "skin_bowtie":
      return <BowTie />;
    case "skin_default":
    case null:
    case undefined:
    default:
      return null;
  }
}

// ============================================================
// 学士帽：帽带 + 菱形方板 + 金流苏（iOS: band(42..78,16..26) + board(60,2)-(100,17)-(60,32)-(20,17)）
// ============================================================
function GraduateCap() {
  return (
    <g>
      <path d="M 42 16 L 78 16 L 76 26 L 44 26 Z" fill={DARK} />
      <path d="M 60 2 L 100 17 L 60 32 L 20 17 Z" fill="#1F1F1F" />
      {/* 流苏 */}
      <path d="M 96 18 Q 103 25 100 34" fill="none" stroke={GOLD} strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="100" cy="37" r="4" fill={GOLD} />
    </g>
  );
}

// ============================================================
// 圆框眼镜（iOS: 双圆 r12 @ (45,48)/(75,48) + 鼻梁）
// ============================================================
function RoundGlasses() {
  return (
    <g>
      <circle cx="45" cy="48" r="12" fill="none" stroke="#4A3A2A" strokeWidth="2.6" />
      <circle cx="75" cy="48" r="12" fill="none" stroke="#4A3A2A" strokeWidth="2.6" />
      <line x1="57" y1="47" x2="63" y2="47" stroke="#4A3A2A" strokeWidth="2.4" />
      {/* 镜片反光 */}
      <path d="M 39 43 Q 44 39 50 42" stroke="#FFFFFF" strokeWidth="1.4" fill="none" opacity="0.7" />
      <path d="M 69 43 Q 74 39 80 42" stroke="#FFFFFF" strokeWidth="1.4" fill="none" opacity="0.7" />
    </g>
  );
}

// ============================================================
// 派对锥帽（iOS: 三角 (60,-4)-(44,28)-(76,28)，三色分层 + 白绒球）
// ============================================================
function PartyHat() {
  return (
    <g>
      <path d="M 60 -4 L 44 28 L 76 28 Z" fill="#FF6B9D" />
      <path d="M 60 -4 L 52 12 L 68 12 Z" fill="#FFD166" />
      <path d="M 48 22 L 72 22 L 76 28 L 44 28 Z" fill="#4ECDC4" />
      <circle cx="60" cy="-4" r="5" fill="#FFFFFF" />
    </g>
  );
}

// ============================================================
// 金色皇冠（iOS: 五峰 (30,28)-(40,10)-(50,22)-(60,6)-(70,22)-(80,10)-(90,28) + 深金环带 + 红宝石）
// ============================================================
function GoldCrown() {
  return (
    <g>
      <path d="M 30 28 L 40 10 L 50 22 L 60 6 L 70 22 L 80 10 L 90 28 Z" fill={GOLD} />
      <rect x="30" y="25" width="60" height="8" rx="3" fill={GOLD_DARK} />
      <circle cx="60" cy="8" r="3.2" fill="#FF6B6B" />
    </g>
  );
}

// ============================================================
// 法师尖帽（iOS: 紫三角 (62,-8)-(38,30)-(86,30) + 深紫帽檐 + 金星）
// ============================================================
function WizardHat() {
  return (
    <g>
      <path d="M 62 -8 L 38 30 L 86 30 Z" fill="#7C3AED" />
      <rect x="34" y="26" width="56" height="9" rx="4" fill="#5B21B6" />
      {/* 小金星 */}
      <path
        d="M 58 4 L 60.6 10 L 67 10 L 62 14 L 64 20 L 58 16 L 52 20 L 54 14 L 49 10 L 55.4 10 Z"
        fill={GOLD}
      />
    </g>
  );
}

// ============================================================
// 宇航员头盔（iOS: 大球罩 (60,48) r46 半透明 + 高光弧）
// ============================================================
function AstronautHelmet() {
  return (
    <g>
      <circle cx="60" cy="48" r="46" fill="#BFE3F7" opacity="0.30" stroke="#DCE9F0" strokeWidth="4" />
      {/* 左上高光弧（对应 iOS 200°→250° 弧） */}
      <path
        d="M 24.3 35 A 38 38 0 0 1 47 12.3"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="5"
        strokeLinecap="round"
        opacity="0.75"
      />
    </g>
  );
}

// ============================================================
// 酷炫墨镜（iOS: 圆角矩形镜片 (31,39,27,19)/(62,39,27,19) + 粗桥 + 反光）
// ============================================================
function Sunglasses() {
  return (
    <g>
      <rect x="31" y="39" width="27" height="19" rx="7" fill="#22262B" />
      <rect x="62" y="39" width="27" height="19" rx="7" fill="#22262B" />
      <line x1="58" y1="45" x2="62" y2="45" stroke="#22262B" strokeWidth="4" />
      <path d="M 36 54 L 46 42" stroke="#FFFFFF" strokeWidth="2.2" opacity="0.5" />
    </g>
  );
}

// ============================================================
// 海盗船长（iOS: 大三角帽 (18,26)-(60,4)-(102,26) + 红帽带 + 白圆徽 + 左眼罩）
// ============================================================
function PirateHat() {
  return (
    <g>
      <path d="M 18 26 L 60 4 L 102 26 L 96 32 L 24 32 Z" fill="#1F2328" />
      <rect x="22" y="24" width="76" height="9" rx="4" fill="#8B0000" />
      <circle cx="60" cy="17" r="5" fill="#FFFFFF" />
      {/* 左眼罩 + 绑带 */}
      <circle cx="45" cy="48" r="11" fill="#1F2328" />
      <line x1="24" y1="40" x2="92" y2="44" stroke="#1F2328" strokeWidth="2.6" />
    </g>
  );
}

// ============================================================
// DJ 耳机（iOS: 头梁弧 (60,46) r44 蓝 + 两侧深蓝耳罩）
// ============================================================
function Headphones() {
  return (
    <g>
      <path
        d="M 18.7 31 A 44 44 0 0 1 101.3 31"
        fill="none"
        stroke="#1CB0F6"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <rect x="10" y="40" width="16" height="26" rx="7" fill="#1899D6" />
      <rect x="94" y="40" width="16" height="26" rx="7" fill="#1899D6" />
    </g>
  );
}

// ============================================================
// 桂冠（iOS: 双侧弧枝 (60,52) r42 绿 + 叶片）
// ============================================================
function LaurelWreath() {
  const leaves: React.ReactNode[] = [];
  for (const dir of [1, -1] as const) {
    for (let k = 0; k < 4; k++) {
      const ang = (dir > 0 ? 310 : 230) + k * (dir > 0 ? 18 : -18);
      const rad = (ang * Math.PI) / 180;
      const cx = 60 + Math.cos(rad) * 42;
      const cy = 52 + Math.sin(rad) * 42;
      leaves.push(
        <ellipse
          key={`${dir}-${k}`}
          cx={cx}
          cy={cy}
          rx="5"
          ry="3"
          fill="#6ABE30"
          transform={`rotate(${ang + 90} ${cx} ${cy})`}
        />,
      );
    }
  }
  return (
    <g>
      {/* 右侧弧（300°→20°）与左侧弧（240°→160°，逆向） */}
      <path
        d="M 81 15.6 A 42 42 0 0 1 99.5 66.4"
        fill="none"
        stroke="#4C9A2A"
        strokeWidth="3.4"
        strokeLinecap="round"
      />
      <path
        d="M 39 15.6 A 42 42 0 0 0 20.5 66.4"
        fill="none"
        stroke="#4C9A2A"
        strokeWidth="3.4"
        strokeLinecap="round"
      />
      {leaves}
      {/* 顶部红丝带 */}
      <path d="M 56 8 L 60 4 L 64 8 L 60 12 Z" fill="#FF4B4B" />
    </g>
  );
}

// ============================================================
// 绅士领结（iOS: 胸口 y≈88，两翼 (44..56)/(64..76) + 深红结节）
// ============================================================
function BowTie() {
  return (
    <g>
      <path d="M 44 88 L 56 82 L 56 96 L 44 94 Z" fill="#E5484D" />
      <path d="M 76 88 L 64 82 L 64 96 L 76 94 Z" fill="#E5484D" />
      <circle cx="60" cy="89" r="4.6" fill="#B8353A" />
    </g>
  );
}
