# 桌面托盘控制入口

本文记录当前 Electron 桌面壳的托盘控制能力。目标是让 AI-Pets 不只依赖宠物本体右键菜单，也能通过系统托盘完成基础控制。

## 当前能力

应用启动后会创建系统托盘图标。托盘菜单提供：

- 打开设置 / 关闭设置
- 显示宠物 / 隐藏宠物
- 窗口置顶开关
- 退出 AI-Pets

宠物本体右键菜单和托盘菜单共用同一套 Electron 主进程逻辑，避免两个入口行为不一致。

## 窗口行为

- 默认启动时显示桌面宠物窗口。
- 点击托盘图标会显示宠物窗口。
- 选择“隐藏宠物”会隐藏窗口，但应用继续驻留托盘。
- 选择“打开设置”会展开设置面板，并自动显示窗口。
- 置顶开关会调用 Electron `BrowserWindow.setAlwaysOnTop`。

## 当前取舍

当前阶段使用内置 SVG 临时生成托盘图标，先保证流程跑通。正式产品化时需要替换为品牌图标，并同步配置安装包图标。

当前未做：

1. 托盘图标品牌化。
2. 开机启动。
3. 多显示器位置记忆。
4. 退出前保存窗口位置和设置状态。
5. macOS 菜单栏图标适配验证。

## 验证方式

从项目根目录执行：

```bash
pnpm --filter @ai-pets/desktop typecheck
pnpm --filter @ai-pets/desktop build
pnpm desktop:pack
```

打包后可启动：

```text
apps/desktop/release/win-unpacked/AI-Pets.exe
```
