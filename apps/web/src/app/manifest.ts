import type { MetadataRoute } from "next";

// output: "export" 下 metadata route 需要显式声明为静态
export const dynamic = "force-static";

/**
 * PWA Web App Manifest（critic-7）
 *
 * 图标：聪聪熊猫 SVG（maskable + any），路径见 public/icons/。
 * iOS 主屏图标由 layout.tsx 的 apple-touch-icon（PNG）负责。
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "聪聪学堂 · 小学全科免费学习",
    short_name: "聪聪学堂",
    description: "全科免费，人人可学的小学AI学习平台，和熊猫聪聪一起天天进步",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F7F7F7",
    theme_color: "#58CC02",
    lang: "zh-CN",
    icons: [
      {
        src: "/icons/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
