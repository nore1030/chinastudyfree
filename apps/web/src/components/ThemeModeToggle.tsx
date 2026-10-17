"use client";

/**
 * ThemeModeToggle —— 免费深色模式的三态开关（跟随系统 / 亮 / 暗）。
 *
 * 出现在 SideNav 底部（桌面）和 我的 页外观设置（移动端可达）。
 * 装备了暗色美妆主题时强制暗色，这里的选择暂不生效 —— 给出提示。
 */

import { useEffect, useState } from "react";
import { useThemeMode, setThemeMode, type ThemeMode } from "@/lib/themeMode";
import { useProgressStore } from "@/store/progress";
import { getCosmeticById, type UiTheme } from "@/lib/cosmetics";
import { Sun, Moon, MonitorIcon } from "@/components/icons";
import { playSfx } from "@/lib/sfx";
import { haptic } from "@/lib/haptic";
import { cn } from "@/lib/cn";

const OPTIONS: Array<{
  mode: ThemeMode;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}> = [
  { mode: "system", label: "自动", Icon: MonitorIcon },
  { mode: "light", label: "亮", Icon: Sun },
  { mode: "dark", label: "暗", Icon: Moon },
];

export function ThemeModeToggle({ compact = false }: { compact?: boolean }) {
  const mode = useThemeMode();
  const themeId = useProgressStore(s => s.equippedTheme);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  const equipped = getCosmeticById(themeId) as UiTheme | undefined;
  const forcedDark = hydrated && !!(equipped?.type === "ui_theme" && equipped.data.isDark);
  const active = hydrated ? mode : "system";

  return (
    <div>
      <div
        className="grid grid-cols-3 gap-1 p-1 rounded-2xl border-2 border-bg-softer bg-bg-soft"
        role="radiogroup"
        aria-label="外观模式"
      >
        {OPTIONS.map(opt => {
          const selected = active === opt.mode;
          const Icon = opt.Icon;
          return (
            <button
              key={opt.mode}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={forcedDark}
              onClick={() => {
                playSfx("tap");
                haptic("light");
                setThemeMode(opt.mode);
              }}
              className={cn(
                "flex items-center justify-center gap-1 h-9 rounded-xl text-xs font-extrabold transition-colors select-none",
                selected
                  ? "bg-white text-ink shadow-sm border-2 border-bg-softer"
                  : "text-ink-softer hover:text-ink-light",
                forcedDark && "opacity-50 cursor-not-allowed",
              )}
              title={forcedDark ? "当前装备了暗色主题，界面保持暗色" : undefined}
            >
              <Icon className="w-4 h-4" />
              {!compact && <span>{opt.label}</span>}
            </button>
          );
        })}
      </div>
      {forcedDark && !compact && (
        <p className="mt-1.5 text-[10px] text-ink-softer leading-snug">
          装备了暗色主题，界面保持暗色；想切回来可以在商店换个主题
        </p>
      )}
    </div>
  );
}
