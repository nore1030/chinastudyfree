# 桌面版图标

Tauri 打包需要图标文件。请准备一张 1024×1024 的 PNG 作为源，然后在本目录执行：

```bash
npx tauri icon path/to/logo.png
```

该命令会生成 `icon.png`、`icon.ico`、`icon.icns` 等 Tauri 所需全部图标。
生成后 `tauri.conf.json` 中的 `bundle.icon` 引用才会生效。
