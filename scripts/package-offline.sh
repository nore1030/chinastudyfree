#!/usr/bin/env bash
# package-offline.sh —— 组装「离线版 / 校园内网部署包」
#
# 前置：
#   npm run build:web      # 生成 apps/web/out
#   npm run build:server   # 生成 apps/server/dist
#
# 产物：offline-bundle/
#   web/           静态站点（含已打包的音频 / 课本页 / 故事图）
#   server/        Express AI 后端（未配 Key 时仅托管静态，可正常学习）
#   start.sh        一键启动（默认端口 8787）
#   README.md       使用说明
#
# 校园网内任一台机器运行 start.sh，其余设备浏览器访问 http://该机IP:8787 即可。
# 如需完整语音/课本原页，先把发布资源（audio / textbook-pages / story-images）
# 复制到 apps/web/out/ 对应目录后再 build:web。

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/apps/web/out"
SRV="$ROOT/apps/server/dist"
DEST="$ROOT/offline-bundle"
WEB="$DEST/web"
SRV_D="$DEST/server"

[ -d "$OUT" ] || { echo "❌ 缺少 $OUT，请先运行 npm run build:web"; exit 1; }
[ -d "$SRV" ] || { echo "❌ 缺少 $SRV，请先运行 npm run build:server"; exit 1; }

rm -rf "$DEST"
mkdir -p "$WEB" "$SRV_D"
cp -r "$OUT/." "$WEB/"
cp -r "$SRV/." "$SRV_D/"
# 带上 package.json（含 "type":"module"），否则 node 会把 ESM 当 CJS 报错；
# express / dotenv 依赖由仓库 node_modules 解析（或部署机先 npm install）。
cp "$ROOT/apps/server/package.json" "$SRV_D/package.json"

cat > "$DEST/start.sh" <<'EOF'
#!/usr/bin/env bash
cd "$(dirname "$0")"
export PORT="${PORT:-8787}"
export STATIC_DIR="$(pwd)/web"
echo "▶ 聪聪学堂离线服务已启动: http://0.0.0.0:${PORT}"
exec node server/index.js
EOF
chmod +x "$DEST/start.sh"

# Windows PowerShell 启动脚本（与 start.sh 等价；README 里提到它，必须真的产出）
cat > "$DEST/start.ps1" <<'EOF'
# 聪聪学堂 · 离线版 Windows 启动脚本
# 用法：powershell -ExecutionPolicy Bypass -File start.ps1
$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot
$env:PORT = if ($env:PORT) { $env:PORT } else { "8787" }
$env:STATIC_DIR = Join-Path $PSScriptRoot "web"
Write-Host "▶ 聪聪学堂离线服务已启动: http://0.0.0.0:$($env:PORT)"
& node (Join-Path $PSScriptRoot "server\index.js")
EOF

cat > "$DEST/README.md" <<'EOF'
# 聪聪学堂 · 离线版 / 校园内网部署包

把 AI 学习平台带进没有公网、或希望数据不出校园的环境。

## 启动
- Linux / macOS：`./start.sh`
- Windows（PowerShell）：`powershell -ExecutionPolicy Bypass -File start.ps1`

默认端口 8787。启动后，校园内其他设备在浏览器打开 `http://<本机IP>:8787` 即可使用。

## 端口 / 目录
- 端口：环境变量 `PORT`（默认 8787）
- 静态目录：环境变量 `STATIC_DIR`（默认指向同目录 `web/`）

## 完整离线资源（语音 / 课本原页 / 故事图）
打包时若 `web/` 内已含 `audio/`、`textbook-pages/`、`story-images/`，则完全离线可用。
若缺失，请先把发布资源复制到 `apps/web/out/` 对应目录，再重新 `npm run build:web`，然后重新运行本脚本。

## AI 能力
`server/` 内的 AI 接口（出题 / 讲解 / 故事 / 配音）需要配置 Key 才会生效；
未配置时平台自动降级，已预生成的课程、课文听读、故事仍可正常使用。
EOF

echo "✅ 离线包已生成: $DEST"
echo "   运行: cd offline-bundle && ./start.sh"
