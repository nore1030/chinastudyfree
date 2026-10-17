# 聪聪学堂 · ChinaStudyFree 多端适配工程

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE) ![平台](https://img.shields.io/badge/平台-Web%20%7C%20%E6%A1%8C%E9%9D%A2%20%7C%20%E5%AE%89%E5%8D%93%20%7C%20iOS%20%7C%20Docker-blue) ![学段](https://img.shields.io/badge/学段-小学%20%7C%20初中%20%7C%20高中%20%7C%20大学-green)

把开源公益项目 [ChinaStudyFree](https://github.com/caiyanqi/ChinaStudyFree)（免费、公益的小学 AI 学习平台）改造为 **四端统一** 的版本，并扩展支持 **初中 / 高中 / 大学** 学段。

- 单一 Web 源码（Next.js 静态导出）作为所有端的基础
- 桌面端 = **Tauri** 封装（内嵌 Node AI 服务）
- 安卓 / iOS = **Capacitor** 封装（同一套 Web）
- Docker = 静态 `out/` + Express AI 后端，一键起服务
- 统一在线 AI 后端（`apps/server`）：出题 / 讲解 / 故事生成 + 语音合成 + 课本配图

---

## 一、学段与教材中心（本次新增）

原项目只覆盖 **小学 1-6 年级**。本次引入「学段」概念：

| 学段 | 年级 | 说明 |
| --- | --- | --- |
| 小学 | 1-6 | 互动课程（原有，完整）：语文 / 数学 / 英语 / 科学 / **道德与法治** |
| 初中 | 7-9 | 互动课程：语文 / 数学 / 英语 / 物理 / 化学 / 生物 / 历史 / 地理 / 道德与法治（**七、八、九三个年级均已按课标开齐**） |
| 高中 | 10-12 | 互动课程：语文 / 数学 / 英语 / 物理 / 化学 / 生物 / 历史 / 地理 / 思想政治（必修 + 选择性必修，**高一、高二均已开齐**） |
| 大学 | 13 | 按学科 / 课程组织：高等数学 / 线性代数 / 程序设计基础 / 大学英语 / 大学物理 |

- **学段引导**：首次进入先选学段（小学 / 初中 / 高中 / 大学），非大学学段再选年级，大学直接进入年级页（课程列表）。
- **12 个学科**：数学 / 语文 / 英语 / 科学 / 道德与法治 / 物理 / 化学 / 生物 / 历史 / 地理 / 思想政治 / 信息技术。
- **教材中心 `/textbooks`**：浏览 [TapXWorld/ChinaTextbook](https://github.com/TapXWorld/ChinaTextbook) 开源教材库的真实课本目录（共 **1886 本**，已自动抓取），按 学段 → 出版社版本 → 学科 → 年级/册 分组，点开即跳转 GitHub 查看 PDF。

> 教材目录是**真实数据**：`npm run sync:textbooks` 会调用 GitHub API 拉取 ChinaTextbook 目录树并生成 `apps/web/public/data/textbook-catalog.json`。

### 1.1 多出版社（教材版本）体系 ✅

中国教材「一纲多本」：同一年级同一学科常有多个出版社版本。本次把**出版社**建成一等概念：

- **单一事实源** `packages/core/src/publishers.ts`：登记 13 个出版社（统编版 / 人教版 / 人教版PEP / 沪教版 / 沪外教版 / 北师大版 / 苏教版 / 外研版 / 译林版 / 教科版 / 高教社 / 清华社 / 通用），含显示名、bookId 短标识、主题色、文件名匹配规则。
- **bookId 规则（向后兼容）**：默认出版社不加前缀，其他出版社插入短标识 ——
  - `english-g3up`（人教版PEP，默认） vs `english-hujiao-g3up`（**沪教版**）
  - `g7up`（人教版，数学默认） vs `math-beishida-g7up`（**北师大版**）
  - `g1up`（人教版） vs `math-sujiao-g1up`（**苏教版**）
  - 大学课程：`college-{学科}-{课程slug}`，如 `college-english-comprehensive`（高教社）、`college-computer-python-programming`（清华社）
- **已产出的多版本互动课程**：不同版本的单元主题、知识点与难度顺序**并不相同**，与默认版本同年级共存。
  - 小学：人教版PEP 英语 3-6 年级；沪教版 / 外研社版 / 译林版 / 北师大版 英语三年级下册；北师大版 / 苏教版 数学一年级上册
  - 初中：人教版 英语七至九年级；沪教版 / 外研版 / 译林版 英语七年级、八年级上册；人教版 / 北师大版 / 浙教版 / 苏教版 数学七年级、八年级上册
  - 高中：人教版英语必修第一册、必修第二册、选择性必修第一册；外研版 / 北师大版 / 译林版 英语必修第一册
  - 共 **20 本多版本教材**（`npm run coverage` 可查看完整出版社分布）。
- **界面呈现**：
  - `/grade/[grade]` 教材卡片带出版社徽标（同页可见「人教版PEP / 沪教版」并列）
  - 换书弹层、单元路径顶部标签行、课文听读页均标注出版社版本
  - `/textbooks` 教材中心新增**出版社筛选**（默认展示前 12 个，可展开全部；小学 65 个版本、初中 57 个、高中 41 个）+ 每行版本徽标 + 关键词可匹配版本名
- **大学公共课出版社**：默认「高教社」（高等教育出版社），程序设计类「清华社」（清华大学出版社）。

---

## 二、四端架构总览

```
                ┌─────────────────────────────────────────────┐
                │            Web (Next.js 15, output:export)    │
                │   apps/web  →  apps/web/out  (纯静态 HTML/JS)  │
                └───────────────┬───────────────┬───────────────┘
                                │               │
           桌面端 Tauri         │        安卓/iOS Capacitor        Docker
        apps/desktop           │        apps/mobile              docker/
   (内嵌 Node AI 服务)         │     (WebView 加载 out/)     (out/ + server)
        localhost:8787 ─────────┘
                                │
                        apps/server (Express)
                   /api/ai/quiz|explain|story|tts  + 托管静态 out/
```

- **单一事实源**：所有端共用 `apps/web` 的静态产物 `out/`，无需为各端维护多份前端代码。
- **AI 后端共用**：Tauri 桌面端在本地 spawn 一个 Node 服务（`apps/server`）监听 `127.0.0.1:8787`；Web / Docker / Capacitor 在线端连同一个服务端（由 `NEXT_PUBLIC_AI_BASE` / `AI_BASE` 决定地址）。
- **离线优先**：资源（音频 / 课本页 / 故事图）打包进 `out/`，无网也能学；AI 生成类能力按需联网。

---

## 三、目录结构

```
ChinaStudyFree/
├── apps/
│   ├── web/            # Next.js 前端（静态导出），单一源码
│   │   ├── src/app/    # 路由：/ /grade/[grade] /stage/[stage] /book /lesson /reading /textbooks /ai ...
│   │   ├── public/data/# 构建产物：index.json、books/*、textbook-catalog.json（gitignore）
│   │   └── scripts/build-data.ts  # output/ → public/data 的转换脚本（注入 stage / 音频路径）
│   ├── server/         # Express AI 后端（LLM / TTS / 配图），四端共用
│   ├── desktop/        # Tauri v2 桌面封装（src-tauri 内嵌 Node AI 服务）
│   └── mobile/         # Capacitor 6 安卓/iOS 封装
├── packages/core/      # 跨端纯 TS 核心（判分 / 经济 / 学段 stage / 类型）
├── scripts/            # sync-textbooks.mjs（抓取 ChinaTextbook 目录）
├── output/             # 上游生成的 outlines/quizzes（原始数据，gitignore 部分）
├── docker/             # Dockerfile + docker-compose.yml
└── README.md
```

---

## 四、本地开发

```bash
npm install                 # 安装 workspace 依赖

# 1) 生成前端数据（output/ → public/data，注入学段 / 音频路径）
npm run build:data

# 2) 抓取教材目录（ChinaTextbook → public/data/textbook-catalog.json）
npm run sync:textbooks

# 2.5) 生成互动课程内容（默认版本 + 多版本 + 覆盖缺口，增量+覆盖写，勿通配删除 output/）
npm run gen:content# = gen-stage-content.mjs（默认版本 40 本）
                               # + gen-version-content.mjs（多版本 10 本）
                               # + gen-coverage-content.mjs（覆盖缺口 54 本）
npm run gen:version         # 只跑多版本生成器
npm run gen:coverage        # 只跑覆盖缺口生成器
npm run validate:quizzes    # 校验全部题目：答案∈选项 / 无重复选项 / 判断题答案合法（约 1.57 万道）
npm run coverage            # 教材覆盖矩阵报告（学段 × 年级 × 学科 + 出版社明细）

# 3) 前端开发
npm run dev:web             # http://localhost:3000

# 4) AI 后端（可选，需配置 Key 才有真实生成能力）
cp .env.example apps/server/.env   # 填入 LLM_API_KEY / DASHSCOPE_API_KEY / GEMINI_API_KEY
npm run dev:server          # http://localhost:8787
```

前端通过 `apps/web/src/lib/ai.ts` 自动判断运行环境：
- Tauri 内 → `http://localhost:8787`
- 浏览器 → `process.env.NEXT_PUBLIC_AI_BASE`（空则隐藏 AI 能力，仅本地学习）

在线 AI 实验室：`/ai`（quiz 生成 + TTS 试听）。

---

## 五、构建与四端打包

| 端 | 命令 | 产物 |
| --- | --- | --- |
| Web 静态站 | `npm run build:web` | `apps/web/out/`（可直接托管任意静态服务器） |
| AI 后端 | `npm run build:server` | `apps/server/dist/index.js`（esbuild **单文件**，express/dotenv 已内联，零 `node_modules` 依赖） |
| 桌面 (Tauri) | `cd apps/desktop && npm i && npx tauri build` | exe + **Windows 安装包**（NSIS `*_x64-setup.exe` + MSI）→ `release/windows/` |
| 桌面便携包 | `bash scripts/package-desktop.sh` | `release/desktop/`（exe + 内嵌 Node + 服务端 + 启动脚本 + 说明） |
| 仅重打包安装器（不重编译） | `cd apps/desktop && npx tauri bundle -b nsis,msi` | 同上（复用已编译的 exe） |
| 安卓 (Capacitor) | `cd apps/mobile && npx cap sync android && cd android && ./gradlew assembleRelease bundleRelease` | **签名 APK + AAB** → `release/android/` |
| iOS (Capacitor) | `npx cap add ios && npx cap sync && npx cap build ios` | IPA（需 macOS + Xcode + 签名；CI 可产未签名 IPA） |
| 离线包 / Docker | `bash scripts/package-offline.sh` / `docker compose -f docker/docker-compose.yml up --build` | `offline-bundle/` / 容器 `:8787` 提供站点 + AI 后端 |
| 全平台一键（GitHub Actions） | 推送 tag 或手动触发 `.github/workflows/build-installers.yml` | Windows 安装包 / 安卓 APK+AAB / iOS 未签名 IPA / Linux AppImage+deb / Docker 镜像 tar |

### 各平台安装包产物一览

| 平台 | 安装包 | 说明 |
| --- | --- | --- |
| Windows | `release/windows/聪聪学堂-安装程序-0.1.0-x64.exe`（56.4 MB） | NSIS 安装向导：开始菜单 / 桌面快捷方式 / 应用卸载项，安装模式可选仅当前用户或全机；装完即离线可用（已实测静默安装 → 运行 → 卸载零残留） |
| Windows | `release/windows/聪聪学堂-安装程序-0.1.0-x64.msi`（90.0 MB） | MSI 包（WiX，zh-CN），供组策略 / 企业批量分发 |
| Windows | `release/windows/聪聪学堂-便携版-0.1.0.zip`（109.0 MB） | 免安装绿色版压缩包（解压即用，含 `web/out` 静态站） |
| Android | `release/android/聪聪学堂-安卓-release.apk`（43.5 MB） | 发布签名（v1+v2 已校验），可侧载分发 |
| Android | `release/android/聪聪学堂-安卓-release.aab`（43.4 MB） | App Bundle，用于上架应用商店 |
| Android | `release/android/聪聪学堂-安卓-debug.apk`（47.6 MB） | 调试包（与 release 签名不同，需先卸载） |
| iOS / Linux / Docker | 由 CI 工作流产出 | 本机无 macOS / Docker 守护进程，见 `.github/workflows/build-installers.yml` |

> 📥 **不想自己构建？** 直接到 [Releases 页面](https://github.com/tanle-mtr/ChinaStudyFree/releases)下载已构建好的安装包 / 便携版 / 安卓 APK / 离线部署包（附 SHA256 校验和）。注意：GitHub 会去除资产文件名中的非 ASCII 字符，故发行资产使用英文名（`ChinaStudyFree-*`），产品名称仍为「聪聪学堂」。

> ⚠️ 安卓发布签名使用仓库内的**演示密钥**（`apps/mobile/android/keystore/` + `keystore.properties`），正式上架请替换为你自己的私钥并妥善备份。

### 桌面版系统托盘 ✅
桌面版（Tauri v2 `tray-icon`）启动后常驻系统托盘：
- **左键单击**托盘图标 → 唤出主窗口
- **右键菜单**：显示主界面 / 在浏览器中打开（127.0.0.1:8787）/ 打开运行日志 / 退出聪聪学堂
- **点窗口「×」= 最小化到托盘**（`api.prevent_close()` + `window.hide()`，后台继续运行），真正退出走托盘菜单
- 任何退出路径（托盘退出 / 系统注销 / `ExitRequested`）都会**回收内嵌 Node AI 服务子进程**，不留僵尸端口
- **端口复用**：拉起服务前先探活 `127.0.0.1:8787/api/health`，若上次被强杀留下孤儿进程仍占用端口则直接复用，避免 `EADDRINUSE`
- **日志位置**：`%LOCALAPPDATA%\ChinaStudyFree\logs\ai-server.log`（用户级目录，安装到 `Program Files` 时普通用户也可写、且不污染安装目录导致卸载残留）

### 资源打包策略（离线）
- 音频 / 课本扫描页 / 故事配图在构建期写入 `apps/web/out/`，随安装包 / 镜像一起分发，**完全离线可用**。
- 教材 PDF 体积大且来自 ChinaTextbook，**不打包进安装包**，教材中心以「在线链接」方式提供（符合开源协议，也避免安装包膨胀）。

### 语音（TTS）三级音源 —— 只用项目自己的声音 ✅
互动语音（题干朗读、选项朗读、讲解、知识卡、课文、故事、鼓励语）走**三级音源**，
全部由本项目源码产出，**不使用操作系统 / 浏览器的系统语音**（音色不受控、平台差异大）：

| 级别 | 来源 | 条件 | 特点 |
| --- | --- | --- | --- |
| 1 | 预生成音频 `/audio/<hash[0:2]>/<sha1>.opus` | 跑过 `npm run tts:audio` | 离线、音色最好、零延迟 |
| 2 | 在线合成 `/api/ai/tts`（DashScope CosyVoice） | 后端配了 `DASHSCOPE_API_KEY` | 实时合成，音质稳定 |
| 3 | **免费 EdgeTTS**（微软 Edge 朗读，`apps/server/src/edge-tts.ts`） | 能联网，**无需任何 Key** | 零配置兜底，桌面/便携版开箱即有声 |

- **入口是 `playVoice(src, text)`**（`apps/web/src/lib/tts.ts`）：有 `src` 播预生成音频
  （文件 404 时自动降级）；没有 `src` 就用 `text` 走项目 TTS API。
- **三级都不可用时静默**（不回退系统语音），不影响学习流程。
- **`/api/health` 报告当前后端**：`ttsBackend` = `dashscope`（配了 Key）· `edge`（免费兜底生效）· `none`（已禁用）——
  点朗读没声音时先看这个字段，即可判断是「没配 Key」还是「禁用了 EdgeTTS / 没联网」。
- **EdgeTTS 实现要点（2026-10 修复「没声音」的根因）**：微软朗读端点要求 `Sec-MS-GEC` **v2** 令牌
  （自定义初始向量 `_SHA256_STATE` 的密钥化 SHA256 + CS64 校验和，版本前缀必须是 `2-`）。
  已从官方 `edge_tts` 7.3.1 逐行移植到 `apps/server/src/gec.ts`（仓库根 `gec-port.mjs` 为跨语言校验脚本），
  实测 WebSocket 握手 + mp3 音频返回正常。离线 / 内网部署设 `EDGE_TTS_ENABLED=false` 即可关闭。
- **桌面 / 便携版启用更高级别音质**：把包里的 `.env.example` 改名为 `.env` 填入 `DASHSCOPE_API_KEY` 后重启；
  不配任何 Key 时自动走免费 EdgeTTS（联网即可）。
- **为什么需要 `text` 兜底**：`public/audio` 是本地生成物且被 `.gitignore` 忽略，
  一旦缺失，`build-data` 的 `audioFor()` 全部返回 `undefined`，
  旧实现下 `TTSButton` 直接 `return null`（按钮消失）；现在 `src` 缺失时
  组件依然传 `text`，由项目 TTS API 实时合成。
- **重新生成预生成音频**（可选，用于拿到最好音质）：
  ```bash
  npm run tts:audio:dry                                      # 先看有多少条、分布如何
  DASHSCOPE_API_KEY=sk-xxx npm run tts:audio -- --limit 50   # 先试 50 条试听
  DASHSCOPE_API_KEY=sk-xxx npm run tts:audio -- --book chinese-g1up   # 按教材分批
  DASHSCOPE_API_KEY=sk-xxx npm run tts:audio                 # 全量（约 4.7 万条，注意成本）
  npm run build:data                                         # 重新注入 /audio/... 路径
  ```
  生成脚本 `scripts/tts/generate-audio.mjs` 的 sha1 哈希规则与 `build-data.ts` **逐位一致**
  （已用 `src/lib/uiAudio.ts` 的硬编码哈希表交叉校验 5/5）；它会把题干里的 LaTeX
  （`$\frac12\times\frac12$`）清理成"1 除以 2 乘以 1 除以 2"再送合成，
  **但哈希仍用原文**，保证路径对得上。

---

## 六、AI 后端环境变量（`apps/server/.env`）

| 变量 | 作用 | 缺省 |
| --- | --- | --- |
| `LLM_BASE_URL` | OpenAI 兼容 LLM 地址 | — |
| `LLM_API_KEY` | LLM Key（出题 / 讲解 / 故事） | — |
| `DASHSCOPE_API_KEY` | 阿里云 TTS（语音合成，付费 Key） | — |
| `EDGE_TTS_ENABLED` | 免费 EdgeTTS 兜底开关（零 Key，需联网） | `true`（离线/内网设 `false`） |
| `GEMINI_API_KEY` | Google Gemini（课本配图） | — |
| `PORT` | 服务端口 | 8787 |
| `STATIC_DIR` | 托管的静态目录（指到 `apps/web/out`） | 自动探测 |

未配置 Key 时，相关接口返回 `501` + 错误码（`LLM_NOT_CONFIGURED` / `TTS_NOT_CONFIGURED` / `IMAGE_NOT_CONFIGURED`），前端优雅降级。

`STATIC_DIR` 未显式设置时按以下顺序自动探测（取第一个存在的）：
① 环境变量 → ② **本文件所在目录**的 `../../web/out` → ③ `cwd/web/out` → ④ `cwd/../web/out` → ⑤ `cwd/apps/web/out`。
②在全部部署布局下都成立（开发 `apps/server/dist/` → `apps/web/out`；便携 `<root>/server/dist/` → `<root>/web/out`；
安装 `C:\…\聪聪学堂\server\dist\` → `C:\…\聪聪学堂\web\out`；Docker `/app/server/dist/` → `/app/web/out`）。
**早期实现只用 `cwd/../web/out`**，当工作目录与预期不符（双击 bat / Docker `-w` / 系统服务）时会解析到父级目录，
导致静态站 404（仅 AI 接口可用）；现已改为以文件位置为主锚点、`cwd` 仅作兜底。

---

## 七、线路图（Roadmap）

> 状态图例：✅ 已完成并已在本地验证 · 🟡 代码就绪但未在本环境跑通（缺工具链）· ⬜ 待做（依赖后端 / AI Key / 人工）

### 7.1 本工程内部线路图

| # | 任务 | 状态 |
| --- | --- | --- |
| 1 | Web 单一源码 + `output:export` 静态导出 | ✅ 已验证（`build:web` 通过，全路由预渲染） |
| 2 | 嵌套动态路由扁平化（复合 key `book__lesson` 等），解决 Next 15 静态导出报错 | ✅ 已验证 |
| 3 | 统一 AI 后端 `apps/server`（quiz/explain/story/tts + 托管静态） | ✅ 已验证（health / 静态 / 目录均 200） |
| 4 | 桌面端 Tauri 封装（内嵌 Node AI 服务 + **系统托盘**） | ✅ 已构建并验证：`china-study-free-desktop.exe`（前端内嵌，约 32 MB）+ 内嵌 Node 启动 `apps/server`，`/api/health` → `{"ok":true}`；托盘菜单 / 左键唤出 / 关闭即最小化到托盘 / 退出回收 AI 子进程；成品在 `release/desktop/` |
| 5 | 安卓 Capacitor 封装 | ✅ 已构建：`app-debug.apk`（约 34 MB，debug 签名）→ `release/android/聪聪学堂-安卓-debug.apk` |
| 6 | iOS Capacitor 封装 | 🟡 `apps/mobile/ios` Xcode 工程 + Web 资源已生成；归档 IPA 需 macOS + Xcode（Windows 无法执行） |
| 7 | Docker 镜像 + compose | 🟡 `docker/Dockerfile` + `docker-compose.yml` 已按多阶段重写（含 `build:data` / `build:web` / `build:server`）；本机无 Docker 守护进程，未执行 `docker build` |
| 8 | **学段框架**：小学/初中/高中/大学 + 年级感知（七/八/九/高一…） | ✅ 已验证（/stage 四学段 + /grade 1-13 全部预渲染，大学走 grade 13） |
| 9 | **教材中心**：接入 ChinaTextbook 真实目录（1886 本） | ✅ 已验证（`/textbooks` 可浏览，目录 API 200） |
| 10 | 初中/高中 互动课程数据生成 | ✅ 已完成：`scripts/gen-stage-content.mjs` 生成 46 本教材 / 129 单元 / 1188 道题（含概念题人工编写 + 计算题程序生成，答案由程序计算保证正确），无需 AI Key |
| 11 | 大学按学科 / 课程组织互动内容 | ✅ 已完成：高等数学 / 线性代数 / 程序设计基础（Python）/ 大学英语 / 大学物理 5 门课程，bookId 使用 ASCII slug 规避中文路径编码问题 |
| 12 | **新增学科**：物理 / 化学 / 生物 / 历史 / 地理 / 思想政治 / 信息技术 | ✅ 已完成：扩展 `SubjectId`、学科徽章配色、`/grade` 主题与排序、`build-data` 学科表 |
| 13 | **多出版社教材体系**（沪教版 / 北师大版 / 苏教版 / 外研版 / 译林版 / 浙教版…） | ✅ 已完成：`packages/core/src/publishers.ts` 出版社注册表 + publisher-aware bookId + 10 本多版本互动课程（与真实教材目录对齐，各版本单元主题/知识点不同）+ 年级页/换书弹层/教材中心出版社徽标与筛选 |
| 14 | **「选完学段 → 按科目选教材版本」UI** | ✅ 已完成：`/stage/[stage]/versions` 版本选择页（按科目展示有互动课程的出版社版本，偏好持久化在 progress store `subjectVersions`）；`/stage/[stage]` 顶部版本卡片 + `/grade/[grade]` 学科版本快切 chips +「我的版本」徽标 + 教材中心 `?publisher=` 预设 |
| 15 | **桌面版系统托盘** | ✅ 已完成：托盘图标 + 菜单（显示 / 浏览器打开 / 日志 / 退出）+ 左键唤出 + 关闭最小化到托盘 + 退出回收 AI 子进程 |
| 16 | **子进程静默启动**（不弹 node.exe 黑窗） | ✅ 已完成：`main.rs` 全部 spawn 走 `quiet_command()`（Windows `CREATE_NO_WINDOW = 0x0800_0000`）；实测运行期 node 进程 `MainWindowHandle = 0`，有窗口的 node 进程数 0 |
| 17 | **TTS 只用项目自己的音源** | ✅ 已完成：移除浏览器 `speechSynthesis`（产物中出现 0 次），两级音源 = 预生成 opus + `/api/ai/tts`；两级都不可用时静默 |
| 18 | **年级 × 学科覆盖补齐** | ✅ 已完成：新增 `scripts/gen-coverage-content.mjs`，按课标补齐小学道法 1-6 年级、八年级全科（语文/英语/道法/生物/历史下/地理下）、九年级全科（语文/英语/道法/历史/物理下）、高中高二全科（语文选必、英语选必、化学/生物/历史/地理/政治选必）、语文必修下册、英语必修二，**54 本教材 / 114 单元 / 904 道题** |
| 19 | **多版本互动课程扩充** | ✅ 已完成：多版本从 10 本扩到 **20 本**，新增初中英语八上（沪教/外研/译林）、初中数学八上（北师大/浙教/苏教）、小学英语三下（沪教/外研/译林/北师大）、高中英语必修一（外研/北师大/译林） |
| 20 | **学段只选一次**（不再每次点学习都重选） | ✅ 已完成：`ChangeGradeButton` 不再清 `selectedStage`；首页三级自愈 `selectedStage → lastStage → stageOfGrade(grade)`；store v15 新增 `lastStage` 兜底字段（迁移时还会从 `selectedGrade` 反推治愈老档）；`GradePicker` 提供显式「切换学段」入口 |

> 当前数据规模：**148 本教材 / 2820 节课程 / 7946 道题**（小学 64 本 · 初中 50 本 · 高中 29 本 · 大学 5 本；其中多版本书 20 本）。

### 7.2 上游 `wuwangzhang1216/ChinaTextbookStudyFree` 未完成项 → 本次处理

上游 README 的路线图中有 6 项未完成（`[ ]`）。本工程在其基础上推进如下：

| 上游未完成项 | 本次处理 | 状态 |
| --- | --- | --- |
| 道德与法治内容 | 新增 `moral` 学科：年级选择器、学段感知、`/grade/[grade]` 主题（紫色「德」标）、`build-data` 已注入 `道德与法治` 学科；**并已生成初中七年级上册互动课程**（3 单元 / 7 节小课，含单元挑战）。 | ✅ 学科 + 互动题均已就绪 |
| 持续教师复核、补齐知识讲解与题量 | 新增学段内容均带 `knowledge_summary`（核心概念 / 公式 / 常见错误 / 提示）与单元挑战；1,498 课缺讲解、1,183 课仅 1 题的审计见上游记录，仍需教师复核补齐。 | 🟡 新增内容已带讲解；上游存量待复核 |
| **离线版 / 校园内网部署包** | `scripts/package-offline.sh` / `scripts/package-offline.ps1`：组合 `apps/web/out` + `apps/server/dist` 为 `offline-bundle/`（含 `start.sh`/`start.ps1`/`README.md`）。**已生成并验证**：`/api/health` 返回 200、未配 Key 时 `llm/tts/image=false` 优雅降级、`/textbooks/` 等深链 SPA 回退 200。 | ✅ 已生成并验证 |
| 云端学习记录与跨设备同步 | `apps/server` 已具备托管静态与 AI 接口能力，可扩展为记录后端；当前 `progress` 仍存浏览器 localStorage，跨设备同步需加 DB（见第八节）。 | ⬜ 待后端 + 存储 |
| 老师端与班级学习报告 | 依赖后端账号体系与班级数据聚合，框架预留 `/profile` 等页面；完整端待后端实现。 | ⬜ 待后端 |
| 多端 App | **桌面（Tauri）与安卓（Capacitor）均已实际构建出可运行软件**：`release/desktop/`（exe + 内嵌 Node + 启动脚本）与 `release/android/聪聪学堂-安卓-debug.apk`；iOS 工程已生成，归档需 macOS。 | ✅ 桌面 / 安卓已产出 · 🟡 iOS 需 macOS |

> 本次「搞定」的不仅是框架：**桌面版与安卓版已是可分发软件**（桌面版含系统托盘）；**互动课程已从小学扩展到初中/高中/大学**（含物理/化学/生物/历史/地理/思想政治/信息技术 7 个新学科）；**教材支持多出版社版本**（沪教版英语等 5 本已产出互动课程，教材中心可按版本筛选 65+ 个版本）；**离线包已生成并冒烟验证**。仍需你自有环境完成：iOS 归档、Docker 镜像构建。（Docker 与 iOS 的具体步骤见第八节。）

---

## 八、本环境验证范围说明（重要）

本机（Windows）完成了 **Web 构建、AI 后端编译与运行、教材目录抓取、学段/教材中心前端、初中/高中/大学互动课程生成、桌面端 Tauri 构建与打包、安卓 APK 构建、离线包生成** 的验证。以下两项因工具链限制**需在你自己的机器上执行**（配置均已就绪）：

### 8.1 Docker 镜像（本机无 Docker 守护进程）

```bash
# 在已安装 Docker 的主机（项目根目录执行）
docker build -f docker/Dockerfile -t china-study-free:latest .
docker run -p 8787:8787 -e OPENAI_API_KEY=sk-xxx china-study-free:latest
# 或
docker compose -f docker/docker-compose.yml up --build
```

镜像内已串联 `build:data → build:web → build:server`，并托管静态站与 AI 接口；未配置 Key 时 AI 接口返回 501 优雅降级（不影响课程学习）。

### 8.2 iOS 归档（需 macOS + Xcode）

```bash
cd apps/mobile && npm run sync:ios        # 同步 Web 资源到 ios/App/App/public
npx cap open ios                          # 用 Xcode 打开，配置签名后 Archive 导出 IPA
```

> 说明：Windows 上无法运行 `xcodebuild` / CocoaPods，故 iOS 只能产出「工程 + 资源」。
> 另：安卓版当前为 **debug 签名** APK（可直接侧载测试）；正式上架请在 `apps/mobile/android` 配置 release keystore 后执行 `./gradlew assembleRelease`。

---

## 九、许可证

本项目以 **MIT 许可证** 开源（见 [LICENSE](LICENSE)）—— 允许自由使用、修改和分发（含商业用途），唯需保留版权与许可声明。

- 前端改编基于 [ChinaStudyFree](https://github.com/caiyanqi/ChinaStudyFree)（请遵循其许可证）。
- 教材数据来自 [TapXWorld/ChinaTextbook](https://github.com/TapXWorld/ChinaTextbook)（开源教材库，仅供学习使用）。
- 免费语音兜底使用微软 Edge 朗读公共服务（edge-tts 方案），仅供学习交流，请遵守微软服务条款。

---

## 十、打赏支持 ☕

聪聪学堂是**完全免费、无广告、无内购**的公益项目（MIT 开源，四端 + 四学段全部可用）。
如果它对你的孩子或学生有帮助，欢迎**自愿**打赏一杯咖啡 —— 打赏完全不影响任何功能，不设任何付费门槛。

<p align="center">
  <img src="docs/donate-wechat.png" width="260" alt="微信打赏二维码" />
</p>
<p align="center"><sub>微信扫码 · 自愿打赏 · 感谢每一份心意 ❤️</sub></p>

应用内同样可以打赏：打开 **我的主页 → 打赏支持**（桌面版 / 安卓版 / Web 版均已内置）。
