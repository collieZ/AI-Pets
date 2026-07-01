# AI-Pets MVP 桌面方向

桌面 MVP 目标是在 Windows 和 macOS 上运行可导入宠物包的透明桌宠，并能接收外部 AI 事件驱动状态变化。Web POC 负责验证协议和渲染基础，桌面 MVP 负责验证日常使用体验。

## Windows/macOS 桌面方向

桌面端应优先支持：

- 透明无边框窗口。
- 置顶显示和可拖拽移动。
- 多显示器位置记忆。
- 低资源占用的 spritesheet 播放。
- 本地宠物包导入和切换。
- 基础设置面板。

Windows 可以优先验证透明窗口、任务栏行为和开机启动。macOS 可以优先验证透明窗口、权限提示、菜单栏入口和多桌面行为。

## 宠物包导入

桌面端导入 AI Pet Protocol 宠物包时，应读取 manifest 并复制或引用资源目录。导入流程需要校验：

- `protocolVersion` 是否支持。
- `assets.atlas` 是否可读取。
- `states` 是否至少包含一个可播放状态。
- 每个状态引用的 animation 是否存在。
- `capabilities` 是否能被当前宿主满足或降级。
- `compatibility` 是否包含可用于提示来源的信息。

导入成功后，宠物应出现在宠物列表中。用户切换宠物时，窗口尺寸、atlas 帧尺寸和默认状态应随 manifest 更新。

## 透明窗口

透明窗口是桌面体验的关键能力。MVP 需要保证宠物区域透明、点击行为可控、拖拽手感稳定，并能在高 DPI 屏幕上保持清晰。

建议优先实现：

- 背景透明。
- 宠物贴图边缘不出现异常色块。
- 拖拽时临时进入移动状态。
- 非拖拽时保留点击触发 interaction 的能力。
- 可配置是否点击穿透。

## 外部 AI 事件桥接

桌面端需要接收外部 AI 事件，并映射到 manifest 的 `interactions`、`state` 或 `semanticRole`。

MVP 可以从本地事件桥接开始：

- 本地 HTTP 或 WebSocket 入口。
- 事件名，例如 `aiThinking`、`aiWorking`、`aiDone`、`aiError`。
- 可选气泡文本覆盖。
- 事件节流，避免状态频繁抖动。
- 空闲回退，在一次性动作结束后回到 `idle`。

桥接层不应写死 Codex 9 状态。它应优先读取 manifest 的 `interactions`，再按 `semanticRole` 回退，最后回到 `idle`。
