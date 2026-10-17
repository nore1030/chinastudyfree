import type { CapacitorConfig } from "@capacitor/core";

/**
 * Capacitor 配置：用同一套 Next.js 静态产物(out/) 封装安卓与 iOS。
 *
 * - webDir: 指向 monorepo 内的静态导出目录（apps/web/out）。
 * - 在线 AI 通过构建期环境变量 NEXT_PUBLIC_AI_BASE 注入
 *   （指向你的自托管 Docker 服务，例如 https://study.example.com）。
 *   留空则移动端仅使用离线预生成内容。
 *
 * 构建流程：
 *   NEXT_PUBLIC_AI_BASE=https://你的域名 npm run build:web
 *   npm run sync:android   # 或 sync:ios
 * 然后在 Android Studio / Xcode 中打开并上架。
 */
const config: CapacitorConfig = {
  appId: "com.chinastudyfree.app",
  appName: "聪聪学堂",
  webDir: "../web/out",
  server: {
    // 使用 https scheme，避免 WebView 混合内容限制
    androidScheme: "https",
    iosScheme: "https",
  },
  plugins: {},
};

export default config;
