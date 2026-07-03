# 桌面窗口与设置面板优化

本文记录桌面端当前窗口形态和交互优化结果。

## 窗口形态

桌面端现在拆成两个 Electron 窗口：

1. 宠物窗口
   - 透明背景
   - 无边框
   - 默认置顶
   - 只显示宠物和气泡
   - 支持独立拖拽移动

2. 设置窗口
   - 普通桌面窗口
   - 可独立移动、关闭和重新打开
   - 通过托盘菜单或宠物右键菜单打开
   - 不再和宠物窗口粘在一起

## 宠物交互

宠物窗口支持以下交互：

- hover：优先触发宠物包声明的 `hover` interaction。
- click：触发宠物包声明的 `click` interaction。
- drag：拖动窗口时，根据水平移动方向优先触发 `moveLeft` 或 `moveRight` 语义状态。
- drag end：拖动结束后回到 idle 状态。

交互仍遵循 AI Pet Protocol：应用不硬编码固定动作列表，宠物包声明了哪些状态和 interaction，桌面端就尽量暴露和触发哪些能力。

## 设置面板

设置窗口当前分为三个页面：

1. 基础设置
   - 显示/隐藏宠物
   - 窗口置顶
   - 播放速度
   - 发送气泡文本

2. 宠物包
   - 选择当前内置宠物包
   - 预留导入宠物包入口

3. 测试工具
   - 手动触发动作状态
   - 手动触发 AI 事件
   - 查看基础调试信息

当前测试功能被集中放到“测试工具”页，避免和正式设置混在一起。

## 托盘图标修复

之前托盘图标使用 `nativeImage.createFromDataURL(svg)` 临时创建。Windows 托盘对这种方式不够稳定，可能导致右下角隐藏图标区看不到图标。

现在已改为真实图标资源：

```text
apps/desktop/assets/tray.ico
apps/desktop/assets/tray.png
```

打包后图标会被复制到：

```text
apps/desktop/release/win-unpacked/resources/assets/
```

Electron 主进程会优先从 `process.resourcesPath/assets` 读取图标，开发环境再回退到源码目录下的 `assets`。

## 当前未做

1. 正式品牌图标设计。
2. 真正导入本地宠物包目录或压缩包。
3. 设置项持久化。
4. 多显示器窗口位置记忆。
5. macOS 菜单栏图标实际验证。
