import { Suspense } from "react";
import { TextbooksClient } from "./TextbooksClient";

/**
 * 教材中心 —— 浏览 ChinaTextbook 开源教材库的真实课本目录。
 * 客户端组件（静态导出下 useSearchParams 需包在 Suspense 内）。
 */
export default function TextbooksPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-bg" />}>
      <TextbooksClient />
    </Suspense>
  );
}
