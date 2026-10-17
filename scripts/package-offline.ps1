# package-offline.ps1 —— 组装「离线版 / 校园内网部署包」（Windows）
# 前置：npm run build:web 与 npm run build:server 已成功
$ErrorActionPreference = "Stop"
$ROOT = Resolve-Path (Join-Path $PSScriptRoot "..")
$OUT = Join-Path $ROOT "apps/web/out"
$SRV = Join-Path $ROOT "apps/server/dist"
$DEST = Join-Path $ROOT "offline-bundle"
$WEB = Join-Path $DEST "web"
$SRV_D = Join-Path $DEST "server"

if (-not (Test-Path $OUT)) { Write-Error "缺少 $OUT，请先运行 npm run build:web"; exit 1 }
if (-not (Test-Path $SRV)) { Write-Error "缺少 $SRV，请先运行 npm run build:server"; exit 1 }

if (Test-Path $DEST) { Remove-Item $DEST -Recurse -Force }
New-Item -ItemType Directory -Path $WEB | Out-Null
New-Item -ItemType Directory -Path $SRV_D | Out-Null
Copy-Item "$OUT\*" $WEB -Recurse -Force
Copy-Item "$SRV\*" $SRV_D -Recurse -Force
# 带上 package.json（含 "type":"module"），否则 node 会把 ESM 当 CJS 报错
Copy-Item (Join-Path $ROOT "apps/server/package.json") $SRV_D -Force

@"
`$env:PORT = if (`$env:PORT) { `$env:PORT } else { "8787" }
`$env:STATIC_DIR = Join-Path `$PSScriptRoot "web"
Write-Host "▶ 聪聪学堂离线服务已启动: http://0.0.0.0:`$env:PORT"
node (Join-Path `$PSScriptRoot "server/index.js")
"@ | Set-Content -Path (Join-Path $DEST "start.ps1") -Encoding UTF8

$readme = @"
# 聪聪学堂 · 离线版 / 校园内网部署包

把 AI 学习平台带进没有公网、或希望数据不出校园的环境。

## 启动
在 offline-bundle 目录执行：
    powershell -ExecutionPolicy Bypass -File start.ps1
默认端口 8787。启动后校园内其他设备浏览器打开 http://<本机IP>:8787 即可。

## 完整离线资源
打包时若 web/ 内已含 audio/、textbook-pages/、story-images/，则完全离线可用。
缺失时请先把发布资源复制到 apps/web/out/ 对应目录，重新 build:web，再运行本脚本。

## AI 能力
未配置 Key 时平台自动降级，已预生成的课程、课文听读、故事仍可正常使用。
"@
Set-Content -Path (Join-Path $DEST "README.md") -Value $readme -Encoding UTF8

Write-Host "✅ 离线包已生成: $DEST"
Write-Host "   运行: cd offline-bundle; powershell -ExecutionPolicy Bypass -File start.ps1"
