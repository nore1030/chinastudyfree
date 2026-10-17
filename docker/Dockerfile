# ChinaStudyFree 多端镜像
# 单容器同时托管 Next.js 静态产物(out/) 与在线 AI 接口(/api/ai/*)。
# 构建期会执行：build:data(生成题库索引) + sync:textbooks(抓取 ChinaTextbook 目录) + build:web + build:server。
# 注意：互动课程正文依赖上游 output/ 数据（体积大、未入库）；若仓库内无 output/，构建出的站点结构完整但课程内容为空，
#       需自行放入 output/ 后重跑 build:data。教材中心(textbook-catalog.json)由 sync:textbooks 自动生成。
# 音频/课本原页等大资源如需离线打包，可在 build:data 前执行 npm run download-assets（约 2GB）。

FROM node:20-slim AS build
WORKDIR /app

# 安装全部 workspace 依赖（含 web / server / core；忽略 tauri/capacitor 的 postinstall 下载，容器内用不到）
COPY . .
RUN npm install --ignore-scripts

# 生成数据并构建前端静态导出 + AI 后端
RUN npm run build:data || true
RUN npm run sync:textbooks || true
RUN npm run build:web
RUN npm run build:server

# ---- 运行时 ----
FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8787
ENV STATIC_DIR=/app/apps/web/out
ENV HOST=0.0.0.0

# 仅复制运行所需产物。
# server/dist/index.js 是 esbuild 单文件产物（express/dotenv 已内联），
# 因此运行时**不需要 node_modules**，也无需再跑 npm install。
COPY --from=build /app/apps/server/dist ./apps/server/dist
COPY --from=build /app/apps/web/out ./apps/web/out
COPY --from=build /app/apps/web/public/data ./apps/web/public/data

EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||8787)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/server/dist/index.js"]
