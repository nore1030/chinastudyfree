/**
 * build.mjs —— 把 AI 服务端打包成「单文件、零依赖」产物（dist/index.js）
 *
 * 为什么不用裸 tsc：
 *   内嵌到桌面版时，安装包/便携包里不能保证带上 server/node_modules，
 *   而 tsc 输出会 `import "express"` / `import "dotenv"`（运行时找不到模块，
 *   实测报 ERR_MODULE_NOT_FOUND: dotenv）。用 esbuild 把 express/dotenv
 *   全部内联进一个文件，任何环境（安装版 / 便携版 / Docker / 机房）都能直接跑。
 *
 * banner 说明：express/dotenv 是 CJS，esbuild 在 ESM 输出里用 `__require` 代理，
 * 而 Node 的 ESM 没有全局 require，会抛 "Dynamic require of fs is not supported"。
 * 因此在文件头注入 createRequire 生成的 require，让 CJS 依赖正常工作。
 */
import { build } from "esbuild";

await build({
  entryPoints: ["src/index.ts"],
  outfile: "dist/index.js",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  // ws 的两个可选原生依赖（bufferutil / utf-8-validate）未安装；ws 内部已用
  // try/catch 包裹，缺失时自动降级为纯 JS 实现，故标记为 external 避免打包报错。
  external: ["bufferutil", "utf-8-validate"],
  sourcemap: false,
  logLevel: "info",
  banner: {
    js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);',
  },
});
