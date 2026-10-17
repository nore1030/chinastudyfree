"use client";

/**
 * ShareCardButton —— 分享卡通用按钮（E2）
 *
 * 点击 → 本地 canvas 渲染分享卡 → navigator.share（降级下载 PNG）。
 * 渲染/分享全程本地完成，不上传任何服务器。
 */

import { useState, type ReactNode } from "react";
import { useToast } from "./Toast";
import { playSfx } from "@/lib/sfx";
import { haptic } from "@/lib/haptic";
import { shareCardBlob } from "@/lib/shareCard";

interface ShareCardButtonProps {
  /** 生成分享卡 PNG 的懒回调（点击时才渲染） */
  makeBlob: () => Promise<Blob>;
  filename: string;
  /** 系统分享面板附带的文字 */
  shareText: string;
  className?: string;
  children?: ReactNode;
}

export function ShareCardButton({
  makeBlob,
  filename,
  shareText,
  className,
  children,
}: ShareCardButtonProps) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function handleShare() {
    if (busy) return;
    playSfx("tap");
    haptic("light");
    setBusy(true);
    try {
      const blob = await makeBlob();
      const outcome = await shareCardBlob(blob, filename, shareText);
      if (outcome === "downloaded") {
        toast.success("图片已保存，快去分享吧！", 3200);
      }
    } catch {
      toast.error("分享卡没做出来，再试一次吧");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      disabled={busy}
      className={className ?? "btn-chunky-secondary px-8 mx-auto block"}
    >
      {children ?? <span>{busy ? "制作中…" : "分享 📤"}</span>}
    </button>
  );
}
