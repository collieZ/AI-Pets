# Electron 桌面应用打包流程

本文记录当前阶段的桌面端打包方案。目标是先跑通 Windows/macOS 安装包流程，签名、公证、自动更新和品牌图标后续再补齐。

## 当前方案

桌面端使用 `electron-builder` 打包。

当前已配置：

- Windows：生成 NSIS 安装包，产物为 `.exe`。
- macOS：配置 `dmg` 和 `zip` 产物。
- 构建输出目录：`apps/desktop/release`。
- 打包内容：`apps/desktop/dist`、`apps/desktop/electron` 和桌面包 `package.json`。
- 暂不启用代码签名、自动更新和安装包图标。

## 常用命令

从项目根目录执行：

```bash
pnpm desktop:electron
```

开发验证：先构建 Vite 产物，再用 Electron 启动桌面应用。

```bash
pnpm desktop:pack
```

生成未压缩的本地应用目录，用于快速验证打包内容是否完整。

```bash
pnpm desktop:dist:win
```

在 Windows 环境生成 Windows 安装包。

```bash
pnpm desktop:dist:mac
```

在 macOS 环境生成 macOS 安装包。macOS 产物建议在真实 macOS 环境验证，后续还需要补签名和公证。

```bash
pnpm desktop:dist
```

按当前平台生成默认安装包。

## 产物位置

打包完成后查看：

```text
apps/desktop/release/
```

Windows 当前目标产物命名示例：

```text
AI-Pets-0.1.0-windows-x64.exe
```

macOS 当前目标产物命名示例：

```text
AI-Pets-0.1.0-mac-x64.dmg
AI-Pets-0.1.0-mac-x64.zip
```

实际架构名会根据打包环境变化，例如 `x64` 或 `arm64`。

## 后续需要完善

1. 增加正式应用图标。
2. 增加 Windows 代码签名。
3. 增加 macOS 签名与公证。
4. 增加自动更新策略。
5. 增加托盘图标和托盘菜单后，再验证安装包内的完整桌面体验。
