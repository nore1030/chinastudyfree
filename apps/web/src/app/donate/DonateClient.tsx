"use client";

import { motion } from "framer-motion";
import { SoundLink } from "@/components/SoundLink";
import { Mascot } from "@/components/Mascot";
import { AppShell } from "@/components/layout/AppShell";
import { ArrowLeft } from "@/components/icons";

export function DonateClient() {
  return (
    <AppShell right={null} centerMaxWidth={640}>
      <main className="min-h-screen bg-bg-soft lg:bg-transparent relative">
        {/* Header —— 与个人中心一致：移动端白底 sticky，桌面端简化 */}
        <div className="bg-white border-b border-bg-softer sticky top-0 z-10 lg:bg-transparent lg:border-0 lg:static lg:mb-2">
          <div className="max-w-2xl mx-auto flex items-center justify-between gap-3 px-4 py-3 lg:px-0 lg:py-2">
            <SoundLink
              href="/profile"
              aria-label="返回"
              className="inline-flex items-center justify-center w-10 h-10 rounded-full text-ink-light hover:text-primary hover:bg-bg-soft transition-colors shrink-0"
            >
              <ArrowLeft className="w-5 h-5" />
            </SoundLink>
            <div className="flex-1 min-w-0 text-center lg:hidden">
              <div className="text-base font-extrabold text-ink">打赏支持</div>
            </div>
            <div className="hidden lg:block flex-1" />
            <div className="shrink-0 w-10 lg:hidden" />
          </div>
        </div>

        <div className="max-w-2xl mx-auto px-4 py-8">
          {/* 顶部：聪聪 + 说明 */}
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: "spring", damping: 18 }}
            className="flex flex-col items-center text-center"
          >
            <Mascot mood="happy" size={120} />
            <h1 className="text-2xl font-extrabold text-ink mt-4">请聪聪喝杯咖啡 ☕</h1>
            <p className="text-sm text-ink-light mt-2 leading-relaxed max-w-md">
              聪聪学堂是<strong className="text-ink">完全免费、无广告、无内购</strong>的公益项目。
              如果它对你的学习有帮助，欢迎自愿打赏 ——{" "}
              <strong className="text-ink">打赏不影响任何功能</strong>，
              每一份心意都会用于把项目做得更好。
            </p>
          </motion.div>

          {/* 收款码卡片 */}
          <motion.section
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: "spring", damping: 18, delay: 0.08 }}
            className="bg-white rounded-3xl border-2 border-bg-softer p-6 mt-6 flex flex-col items-center"
            style={{ boxShadow: "0 4px 0 0 var(--shadow-card-color)" }}
          >
            {/* 本地静态图（public/donate/wechat-qr.png），用原生 img 避免静态导出下的图片优化配置 */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/donate/wechat-qr.png"
              alt="微信打赏二维码"
              width={260}
              height={260}
              className="rounded-2xl border border-bg-softer"
            />
            <div className="text-base font-extrabold text-ink mt-4">微信扫码 · 自愿打赏</div>
            <div className="text-xs text-ink-light mt-1">感谢每一份心意 ❤️</div>
          </motion.section>

          {/* 底部说明 */}
          <div className="text-center text-xs text-ink-softer mt-6 leading-relaxed">
            聪聪学堂以 MIT 许可证开源 · Web / 桌面 / 安卓 / iOS 四端 + 小初高大学四学段全部免费
            <br />
            打赏完全自愿，不设任何付费门槛
          </div>
        </div>
      </main>
    </AppShell>
  );
}
