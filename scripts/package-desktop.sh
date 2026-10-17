#!/usr/bin/env bash
# 组装 Tauri 桌面版「绿色便携包」到 release/desktop/
# 前置：已执行 `cd apps/desktop && npx tauri build`（产出 target/release/china-study-free-desktop.exe）
#      且 apps/desktop/src-tauri/bin/node.exe 侧车已就位。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_EXE="$ROOT/apps/desktop/src-tauri/target/release/china-study-free-desktop.exe"
NODE_EXE="$ROOT/apps/desktop/src-tauri/bin/node.exe"
SERVER_DIST="$ROOT/apps/server/dist"
SERVER_PKG="$ROOT/apps/server/package.json"
WEB_OUT="$ROOT/apps/web/out"
OUT="$ROOT/release/desktop"

if [ ! -f "$SRC_EXE" ]; then
  echo "❌ 找不到桌面可执行文件：$SRC_EXE"
  echo "   请先在 apps/desktop 执行：npx tauri build"
  exit 1
fi

rm -rf "$OUT"
mkdir -p "$OUT/bin" "$OUT/server/dist"
cp "$SRC_EXE" "$OUT/china-study-free-desktop.exe"
cp "$SERVER_PKG" "$OUT/server/package.json"
cp "$SERVER_DIST"/*.js "$OUT/server/dist/"
# AI Key 模板：用户改名为 .env 并填入 Key 即可启用在线 AI（含项目 TTS 语音合成）。
# 服务端（dotenv）从启动目录读取 .env —— 桌面版启动时工作目录即本目录。
cp "$ROOT/apps/server/.env.example" "$OUT/.env.example"
[ -f "$NODE_EXE" ] && cp "$NODE_EXE" "$OUT/bin/node.exe" || echo "⚠️ 未找到 bin/node.exe，AI 服务将回退到系统 node"

# 服务端已用 esbuild 打包成单文件（dist/index.js，express/dotenv 全部内联），
# 因此便携包无需再安装 node_modules，解压即用。
echo "  ✅ AI 服务为单文件产物（零 node_modules 依赖）"

# 前端静态站：供本地 AI 服务的「在浏览器中打开」使用（主界面由 exe 内嵌，不依赖它）
if [ -d "$WEB_OUT" ]; then
  echo "→ 复制前端静态站（web/out）…"
  mkdir -p "$OUT/web"
  cp -r "$WEB_OUT" "$OUT/web/out"
  echo "  ✅ web/out 就绪（浏览器打开可用）"
else
  echo "  ⚠️ 未找到 apps/web/out，便携版的「在浏览器中打开」将不可用"
fi

cat > "$OUT/启动聪聪学堂.bat" <<'BAT'
@echo off
chcp 65001 >nul
cd /d "%~dp0"
start "" "china-study-free-desktop.exe"
BAT

cat > "$OUT/启动聪聪学堂.sh" <<'SH'
#!/usr/bin/env bash
cd "$(dirname "$0")"
exec ./china-study-free-desktop.exe "$@"
SH
chmod +x "$OUT/启动聪聪学堂.sh" 2>/dev/null || true

cat > "$OUT/说明.txt" <<'TXT'
聪聪学堂 · 桌面版（Windows 绿色便携包）
====================================

1. 双击「启动聪聪学堂.bat」即可运行（无需安装）。
2. 界面（前端）已内嵌进 exe，纯离线可用：学段/年级、单元小测、课文听读、
   课外故事、错题回顾、商店、教材中心入口等。
3. 系统托盘：程序启动后右下角托盘区会出现「聪聪学堂」图标。
   - 左键单击托盘图标：唤出主窗口
   - 右键单击：菜单（显示主界面 / 在浏览器中打开 / 打开运行日志 / 退出聪聪学堂）
   - 点窗口右上角「×」= 最小化到托盘（后台继续运行，不退出）
   - 真正退出：右键托盘图标 → 退出聪聪学堂（会同时关闭本地 AI 服务）
4. 本地 AI 服务：程序启动时会尝试拉起内置 Node 服务(server/dist + bin/node.exe)，
   在 127.0.0.1:8787 提供 /api/ai/*（出题/讲解/故事/TTS）。
   未配置 AI Key 时相关能力自动降级为离线内容，不影响正常学习。
   如需启用在线 AI（含 TTS 语音合成），把本目录的 .env.example 改名为 .env，
   填入 LLM_API_KEY / DASHSCOPE_API_KEY / GEMINI_API_KEY 后重启即可。
   注：语音只使用「预生成音频 + 本项目 TTS API(/api/ai/tts)」两种音源，
   不使用操作系统 / 浏览器的系统语音；未配置 DASHSCOPE_API_KEY 时语音静默。
5. 教材中心的 PDF 来自开源教材库 ChinaTextbook，点击会跳转在线查看（需联网）。
   教材按「学段 → 学科 → 出版社版本」筛选，同一年级同一学科可切换
   人教版 / 沪教版 / 北师大版 / 苏教版 / 外研版 等多个版本。

目录结构：
  china-study-free-desktop.exe   主程序（含内嵌前端 + 系统托盘）
  bin/node.exe                   内置 Node 运行时（供本地 AI 服务）
  server/dist/index.js           本地 AI 服务端（esbuild 单文件，零 node_modules 依赖）
  server/package.json            声明 "type":"module"（ESM 产物必需，勿删）
  web/out/                       前端静态站（用浏览器访问 http://127.0.0.1:8787/ 时使用）
  .env.example                   AI Key 模板（改名 .env 填 Key 即启用在线 AI）
  启动聪聪学堂.bat / .sh         启动脚本

运行日志（托盘菜单「打开运行日志」打开的位置）：
  %LOCALAPPDATA%\ChinaStudyFree\logs\ai-server.log
  说明：日志刻意不放在本目录 —— 安装版装到 C:\Program Files 时普通用户无权写入，
        且残留日志会让卸载器无法删除目录。若用户目录不可写，才回退到本目录。
TXT

echo "✅ 桌面便携包已生成：$OUT"
ls -la "$OUT"
