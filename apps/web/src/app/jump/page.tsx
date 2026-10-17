import { Suspense } from "react";
import { JumpClient } from "./JumpClient";

/**
 * ⚡ 跳级测试（jump ahead，E2）
 *
 * 轻路由：/jump/?book={bookId}&unit={unitNumber}
 * 静态导出下用 useSearchParams 读取参数（Suspense 包裹）。
 */
export default function JumpPage() {
  return (
    <Suspense fallback={null}>
      <JumpClient />
    </Suspense>
  );
}
