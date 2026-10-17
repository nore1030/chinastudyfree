"use client";

/**
 * SoundLink — 有声导航链接
 *
 * 与 <a> 的用法一致，多了一层"点击时播放 tap 音效 + 触感反馈"。
 * 用于所有需要导航的卡片/按钮型链接。
 *
 * ⚠️ 刻意不用 Next <Link>：静态导出（output: export + trailingSlash）下，
 *    软导航在安卓 Capacitor WebView 里偶发 404，原生 <a> 硬跳转才可靠。
 */

import type { AnchorHTMLAttributes, ReactNode } from "react";
import { playSfx, type SfxName } from "@/lib/sfx";
import { haptic, type HapticKind } from "@/lib/haptic";

interface SoundLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  children: ReactNode;
  /** 音效名，默认 "tap" */
  sfx?: SfxName;
  /** 触感强度，默认 "light" */
  hapticIntensity?: HapticKind;
}

export function SoundLink({
  children,
  onClick,
  sfx = "tap",
  hapticIntensity = "light",
  ...rest
}: SoundLinkProps) {
  return (
    <a
      {...rest}
      onClick={e => {
        playSfx(sfx);
        haptic(hapticIntensity);
        onClick?.(e);
      }}
    >
      {children}
    </a>
  );
}
