"use client";

/**
 * shareCard.ts —— 分享卡纯本地渲染（E2）
 *
 * 两款版式（canvas 绘制，零网络依赖）：
 *   1. 连胜卡  renderStreakCard：品牌绿底 + 聪聪简笔 + 大火焰数字
 *      + 本周 7 格日历 + slogan
 *   2. 徽章卡  renderBadgeCard：星星/奖杯徽章 + 课程名或成就名
 *      （结算三星幕、成就领取时刻共用）
 *
 * 分发：shareCardBlob 优先 navigator.share（移动端系统分享面板），
 * 不支持时降级为下载 PNG。全程不上传任何服务器。
 */

// 品牌色（与 tailwind 设计 token 同源的 Duolingo 派生色板）
const BRAND_GREEN = "#58CC02";
const BRAND_GREEN_DARK = "#46A302";
const FLAME_ORANGE = "#FF9600";
const GOLD = "#FFC800";
const EEL = "#4B4B4B";

export const SHARE_SLOGAN = "聪聪学堂 · 和聪聪一起天天进步";

/** 连胜卡的一格（周一到周日） */
export interface ShareWeekCell {
  /** "一"…"日" */
  label: string;
  /** 当天有学习记录 */
  active: boolean;
  isToday: boolean;
}

export interface StreakCardInput {
  streak: number;
  week: ShareWeekCell[];
}

export interface BadgeCardInput {
  /** 顶部小标题，如「三星通关」「成就解锁」 */
  heading: string;
  /** 主标题：课程名 / 成就名 */
  title: string;
  /** 副标题（可选）：成就描述、教材名等 */
  subtitle?: string;
  /** 三星卡传 3；不传则画奖杯徽章 */
  stars?: number;
}

const W = 1000;
const H = 1250;

function makeCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d context unavailable");
  return { canvas, ctx };
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const FONT = `-apple-system, "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif`;

/** 品牌绿渐变底 + 顶部装饰泡泡 */
function paintBrandBackground(ctx: CanvasRenderingContext2D) {
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, BRAND_GREEN);
  grad.addColorStop(1, BRAND_GREEN_DARK);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // 半透明装饰圆
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  for (const [cx, cy, r] of [
    [120, 140, 130],
    [900, 90, 90],
    [960, 1120, 150],
    [60, 1180, 100],
  ] as const) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** 聪聪简笔（熊猫）：白团子 + 黑耳黑眼圈 + 小黑鼻（几何对齐 Mascot.tsx） */
function paintPanda(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
  const s = size / 100; // 以 100 为基准的比例
  const black = "#2E2E2E";
  const white = "#FBFBFB";
  ctx.save();
  ctx.translate(cx, cy);

  // 耳朵
  ctx.fillStyle = black;
  ctx.beginPath();
  ctx.arc(-24 * s, -34 * s, 13 * s, 0, Math.PI * 2);
  ctx.arc(24 * s, -34 * s, 13 * s, 0, Math.PI * 2);
  ctx.fill();
  // 头（白团子）
  ctx.fillStyle = white;
  ctx.beginPath();
  ctx.ellipse(0, 0, 40 * s, 37 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  // 黑眼圈
  ctx.fillStyle = black;
  ctx.beginPath();
  ctx.ellipse(-16 * s, -2 * s, 12 * s, 15 * s, -0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(16 * s, -2 * s, 12 * s, 15 * s, 0.15, 0, Math.PI * 2);
  ctx.fill();
  // 白眼窝
  ctx.fillStyle = white;
  ctx.beginPath();
  ctx.arc(-15 * s, -4 * s, 8.5 * s, 0, Math.PI * 2);
  ctx.arc(15 * s, -4 * s, 8.5 * s, 0, Math.PI * 2);
  ctx.fill();
  // 眼珠
  ctx.fillStyle = "#3A3A3A";
  ctx.beginPath();
  ctx.arc(-15 * s, -4 * s, 5 * s, 0, Math.PI * 2);
  ctx.arc(15 * s, -4 * s, 5 * s, 0, Math.PI * 2);
  ctx.fill();
  // 高光
  ctx.fillStyle = "#FFFFFF";
  ctx.beginPath();
  ctx.arc(-13.5 * s, -5.5 * s, 1.6 * s, 0, Math.PI * 2);
  ctx.arc(16.5 * s, -5.5 * s, 1.6 * s, 0, Math.PI * 2);
  ctx.fill();
  // 鼻子
  ctx.fillStyle = black;
  ctx.beginPath();
  ctx.ellipse(0, 12 * s, 6 * s, 4.5 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  // 嘴（微笑两瓣）
  ctx.strokeStyle = black;
  ctx.lineWidth = 2 * s;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(0, 16 * s);
  ctx.lineTo(0, 20 * s);
  ctx.quadraticCurveTo(4 * s, 24 * s, 8 * s, 22 * s);
  ctx.moveTo(0, 20 * s);
  ctx.quadraticCurveTo(-4 * s, 24 * s, -8 * s, 22 * s);
  ctx.stroke();

  ctx.restore();
}

/** 大火焰（连胜卡主视觉） */
function paintFlame(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
  const s = size / 100;
  ctx.save();
  ctx.translate(cx, cy);
  // 外焰
  ctx.fillStyle = FLAME_ORANGE;
  ctx.beginPath();
  ctx.moveTo(0, -58 * s);
  ctx.bezierCurveTo(30 * s, -28 * s, 44 * s, -6 * s, 44 * s, 16 * s);
  ctx.bezierCurveTo(44 * s, 44 * s, 24 * s, 60 * s, 0, 60 * s);
  ctx.bezierCurveTo(-24 * s, 60 * s, -44 * s, 44 * s, -44 * s, 16 * s);
  ctx.bezierCurveTo(-44 * s, -8 * s, -26 * s, -30 * s, 0, -58 * s);
  ctx.closePath();
  ctx.fill();
  // 内焰
  ctx.fillStyle = GOLD;
  ctx.beginPath();
  ctx.moveTo(0, -14 * s);
  ctx.bezierCurveTo(16 * s, 4 * s, 24 * s, 16 * s, 24 * s, 30 * s);
  ctx.bezierCurveTo(24 * s, 46 * s, 13 * s, 56 * s, 0, 56 * s);
  ctx.bezierCurveTo(-13 * s, 56 * s, -24 * s, 46 * s, -24 * s, 30 * s);
  ctx.bezierCurveTo(-24 * s, 18 * s, -14 * s, 4 * s, 0, -14 * s);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** 五角星（三星卡） */
function paintStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const outer = (i * 2 * Math.PI) / 5 - Math.PI / 2;
    const inner = outer + Math.PI / 5;
    const ox = Math.cos(outer) * r;
    const oy = Math.sin(outer) * r;
    const ix = Math.cos(inner) * r * 0.45;
    const iy = Math.sin(inner) * r * 0.45;
    if (i === 0) ctx.moveTo(ox, oy);
    else ctx.lineTo(ox, oy);
    ctx.lineTo(ix, iy);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** 奖杯（成就卡） */
function paintTrophy(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
  const s = size / 100;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = GOLD;
  // 杯身
  ctx.beginPath();
  ctx.moveTo(-34 * s, -50 * s);
  ctx.lineTo(34 * s, -50 * s);
  ctx.bezierCurveTo(34 * s, -8 * s, 18 * s, 12 * s, 0, 12 * s);
  ctx.bezierCurveTo(-18 * s, 12 * s, -34 * s, -8 * s, -34 * s, -50 * s);
  ctx.closePath();
  ctx.fill();
  // 双耳
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 9 * s;
  ctx.beginPath();
  ctx.arc(-38 * s, -32 * s, 14 * s, Math.PI * 0.4, Math.PI * 1.5);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(38 * s, -32 * s, 14 * s, Math.PI * 1.5, Math.PI * 2.6);
  ctx.stroke();
  // 杯柄 + 底座
  ctx.fillRect(-6 * s, 12 * s, 12 * s, 16 * s);
  roundRect(ctx, -26 * s, 28 * s, 52 * s, 14 * s, 5 * s);
  ctx.fill();
  // 星星点缀
  paintStar(ctx, 0, -26 * s, 13 * s, "#FFFFFF");
  ctx.restore();
}

/** 底部 slogan + 品牌落款 */
function paintFooter(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.font = `800 34px ${FONT}`;
  ctx.textAlign = "center";
  ctx.fillText(SHARE_SLOGAN, W / 2, H - 72);
}

/** 文本超宽截断（加 …） */
function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) {
    t = t.slice(0, -1);
  }
  return `${t}…`;
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png");
  });
}

// ============================================================
// 版式 1：连胜卡
// ============================================================

export async function renderStreakCard(input: StreakCardInput): Promise<Blob> {
  const { canvas, ctx } = makeCanvas();
  paintBrandBackground(ctx);

  // 聪聪
  paintPanda(ctx, W / 2, 240, 200);

  // 大火焰 + 连胜数字
  paintFlame(ctx, W / 2, 560, 260);
  ctx.fillStyle = "#FFFFFF";
  ctx.textAlign = "center";
  ctx.font = `900 150px ${FONT}`;
  ctx.fillText(String(input.streak), W / 2, 660);

  ctx.font = `800 56px ${FONT}`;
  ctx.fillText("天连续学习！", W / 2, 780);

  // 本周 7 格日历卡
  const cardX = 90;
  const cardY = 850;
  const cardW = W - 180;
  const cardH = 200;
  ctx.fillStyle = "rgba(255,255,255,0.16)";
  roundRect(ctx, cardX, cardY, cardW, cardH, 32);
  ctx.fill();

  const cell = cardW / 7;
  input.week.slice(0, 7).forEach((d, i) => {
    const cx = cardX + cell * i + cell / 2;
    // 星期标签
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.font = `800 30px ${FONT}`;
    ctx.fillText(d.label, cx, cardY + 58);
    // 圆点
    const cy = cardY + 128;
    const r = 32;
    if (d.isToday) {
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(cx, cy, r + 10, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = d.active ? GOLD : "rgba(255,255,255,0.28)";
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    if (d.active) paintFlame(ctx, cx, cy, 44);
  });

  paintFooter(ctx);
  return canvasToBlob(canvas);
}

// ============================================================
// 版式 2：徽章卡（三星通关 / 成就）
// ============================================================

export async function renderBadgeCard(input: BadgeCardInput): Promise<Blob> {
  const { canvas, ctx } = makeCanvas();
  paintBrandBackground(ctx);

  // 聪聪
  paintPanda(ctx, W / 2, 230, 190);

  // 顶部小标题胶囊
  ctx.font = `800 40px ${FONT}`;
  ctx.textAlign = "center";
  const headingW = ctx.measureText(input.heading).width + 96;
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  roundRect(ctx, (W - headingW) / 2, 380, headingW, 84, 42);
  ctx.fill();
  ctx.fillStyle = "#FFFFFF";
  ctx.fillText(input.heading, W / 2, 437);

  // 徽章主体
  if (input.stars && input.stars > 0) {
    // 三星排布：中间高两侧低
    const n = Math.min(3, input.stars);
    const positions =
      n === 3
        ? [
            [W / 2 - 190, 640, 92],
            [W / 2, 590, 120],
            [W / 2 + 190, 640, 92],
          ]
        : n === 2
          ? [
              [W / 2 - 110, 620, 100],
              [W / 2 + 110, 620, 100],
            ]
          : [[W / 2, 620, 120]];
    for (const [sx, sy, sr] of positions) {
      ctx.save();
      ctx.shadowColor = "rgba(255,200,0,0.55)";
      ctx.shadowBlur = 50;
      paintStar(ctx, sx, sy, sr, GOLD);
      ctx.restore();
    }
  } else {
    ctx.save();
    ctx.shadowColor = "rgba(255,200,0,0.5)";
    ctx.shadowBlur = 50;
    paintTrophy(ctx, W / 2, 640, 260);
    ctx.restore();
  }

  // 主标题（课程名 / 成就名）
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `900 64px ${FONT}`;
  ctx.fillText(ellipsize(ctx, input.title, W - 160), W / 2, 880);

  // 副标题
  if (input.subtitle) {
    ctx.fillStyle = "rgba(255,255,255,0.88)";
    ctx.font = `700 40px ${FONT}`;
    ctx.fillText(ellipsize(ctx, input.subtitle, W - 200), W / 2, 950);
  }

  paintFooter(ctx);
  return canvasToBlob(canvas);
}

// ============================================================
// 分发：navigator.share → 降级下载 PNG
// ============================================================

export type ShareOutcome = "shared" | "downloaded" | "cancelled";

export async function shareCardBlob(
  blob: Blob,
  filename: string,
  text: string,
): Promise<ShareOutcome> {
  try {
    const file = new File([blob], filename, { type: "image/png" });
    if (
      typeof navigator !== "undefined" &&
      typeof navigator.share === "function" &&
      typeof navigator.canShare === "function" &&
      navigator.canShare({ files: [file] })
    ) {
      await navigator.share({ files: [file], text });
      return "shared";
    }
  } catch (err) {
    // 用户取消系统分享面板：静默返回
    if (err instanceof DOMException && err.name === "AbortError") return "cancelled";
    // 其他失败走下载降级
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return "downloaded";
}

/** 本周 7 格（周一为首）——连胜卡挂点共用的取数小工具 */
export function buildShareWeek(xpHistory: Record<string, number>): ShareWeekCell[] {
  const labels = ["一", "二", "三", "四", "五", "六", "日"];
  const now = new Date();
  const mondayOffset = (now.getDay() + 6) % 7; // 0 = 周一
  return labels.map((label, i) => {
    const d = new Date();
    d.setDate(d.getDate() + (i - mondayOffset));
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return {
      label,
      active: (xpHistory[key] ?? 0) > 0,
      isToday: i === mondayOffset,
    };
  });
}
