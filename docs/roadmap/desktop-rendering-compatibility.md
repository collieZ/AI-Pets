# 桌面端透明窗口渲染兼容记录

本文记录桌面端宠物窗口在 macOS 和 Windows 上的透明渲染差异、已验证的问题根因，以及当前采用的实现方案。后续调整桌面宠物渲染时，应优先参考本文，避免重新引入残影问题。

## 问题现象

在 macOS 桌面端透明窗口中，宠物切换动作后可能出现旧画面残留：

- 上一个动作的人物轮廓残留在当前动作后面。
- 曾经显示过的 `正在加载宠物` 提示框残留在人物背后。
- 通过设置窗口中的“动作状态”或“模拟 AI 事件”切换状态时更容易复现。
- 鼠标 hover/click/drag 的交互链路有时不明显，因为它会更连续地触发重绘。

同一份 spritesheet 在 Windows 上表现正常，因此问题不应优先归因于 WebP 资源损坏。

## 根因判断

根因是 macOS 上 Electron 透明 `BrowserWindow` 的合成和清屏行为。

之前宠物窗口满足以下条件：

- Electron 窗口使用 `transparent: true`。
- 窗口背景是完全透明的 `#00000000`。
- 页面根节点、body、宠物容器也是完全透明背景。
- DOM 中混合渲染气泡、加载提示、人物 spritesheet。
- 动画切换时，大量像素从不透明变为全透明。

在 macOS 的 CoreAnimation/GPU 合成路径中，全 alpha=0 的区域可能没有可靠覆盖旧像素。旧的 DOM 图层或上一帧人物像素会被保留下来，看起来像“不同动作的虚影”。Windows 的 DWM 合成路径不同，同样资源和类似代码不一定触发该问题。

这类问题不是普通缓存问题。缓存通常表现为资源未更新；这里表现为同一窗口中旧 DOM 和旧帧像素残留。

## 当前最小验证方案

### Electron 主进程

macOS 下禁用硬件加速：

```js
if (process.platform === "darwin") {
  app.disableHardwareAcceleration();
}
```

宠物窗口继续使用真正全透明背景，不再使用极低 alpha 的伪清屏底色：

```js
backgroundColor: "#00000000";
```

窗口级别补充以下约束：

- `hasShadow: false`，避免 macOS 给透明无边框窗口生成额外阴影缓存。
- `webPreferences.backgroundThrottling: false`，避免设置窗口打开后宠物窗口处于后台时动画和提交帧被节流。
- canvas 绘制完成后通过 IPC 调用 `BrowserWindow.invalidateShadow()`，主动让 macOS 重新计算透明窗口的合成缓存。
- 退出时销毁 tray，并在 `app.quit()` 后保留 `app.exit(0)` 兜底，避免 Dock 中残留应用进程。

### 渲染层

宠物窗口不再用 DOM 背景图裁切 spritesheet，也不再用可见 DOM 渲染气泡。

当前做法：

- `.pet-zone` 内放置一张覆盖整个宠物区域的 canvas。
- 每一帧先 `clearRect` 清空整个 canvas。
- canvas 绘制气泡背景和文字。
- canvas 从 spritesheet 中按当前 frame 坐标绘制宠物。
- DOM 中只保留不可见布局占位和可交互 hitbox。

这样可以保证宠物窗口里真正产生像素的内容都来自同一个 canvas，避免 DOM 气泡、加载提示、CSS 背景图等不同合成层互相残留。

### CSS 约束

宠物窗口根容器必须保持真正透明：

```css
.pet-app {
  background: transparent;
}
```

人物 hitbox 不再添加视觉效果：

- 不使用 `filter: drop-shadow(...)`。
- 不使用 hover 上浮动画。
- 不使用 CSS `background-position` 裁切 spritesheet。
- 不使用可见 DOM 图片平移。

这些效果本身不一定是根因，但它们会增加 macOS 独立合成层和透明区域重绘的不确定性。

## 系统兼容注意事项

### macOS

macOS 对 Electron 透明窗口更敏感。以下写法容易触发残影：

- 只依赖完全透明 `BrowserWindow` 背景来清掉旧像素。
- 只依赖完全透明页面背景来覆盖旧 DOM 或旧帧。
- 多个 DOM 层混合渲染半透明内容。
- 动画中频繁让一块区域从有像素变成全透明。
- CSS filter、transform、background-position 参与动画帧切换。

建议策略：

- 优先保持真正透明窗口，不引入肉眼可见的低 alpha 底色。
- 动画主体使用单 canvas 统一绘制。
- 每帧清空完整绘制区域，而不是只更新局部 DOM。
- 尽量减少透明窗口里的可见 DOM 层。
- 对透明无边框 pet 窗口关闭 shadow 和 background throttling。
- 在状态切换、消息变化、宠物切换以及动画绘制后触发 macOS 窗口 invalidation。

低 alpha 背景曾经能降低残影概率，但会破坏“完全透明”的视觉要求，因此只能作为最后兜底或诊断手段，不应作为当前默认方案。

### Windows

Windows 当前没有复现同样残影。DWM 对透明窗口合成的处理与 macOS 不同，同样资源正常不代表 macOS 一定正常。

建议策略：

- Windows 可保持完全透明背景。
- 不要为了 macOS workaround 改坏 Windows 的窗口透明表现。
- 平台差异应尽量写在 Electron 主进程或平台条件判断中。

### Codex 宠物本体

Codex 本体宠物没有出现该残影，推测是因为其渲染管线没有落入当前项目之前的组合：

- 可能不是使用透明 Electron `BrowserWindow` + 多 DOM 层换帧。
- 可能使用单一绘制面或原生位图提交。
- 可能有等价的完整清屏策略。

因此不能只用“Codex 正常”来证明当前 Electron DOM 实现安全。它只能证明资源本身大概率没问题。

## 排查过程结论

已排除或弱化的方向：

- WebP 资源损坏：Windows 正常，且异常残影包含旧 DOM 提示框，不符合资源损坏特征。
- 普通缓存：重新构建后旧 DOM 残留仍随交互出现，不是单纯资源未更新。
- CSS 阴影：移除 `drop-shadow` 后仍有残影。
- spritesheet 背景裁切：改成 canvas 后仍发现旧 DOM 残留，说明主问题在窗口合成和透明清屏。

最终有效方向：

- macOS 禁用硬件加速。
- 保持真正透明背景，避免低 alpha 底色污染画面。
- 宠物窗口可见内容统一由 canvas 绘制。
- 移除透明窗口中的可见加载提示 DOM 和气泡 DOM。
- 宠物窗口关闭后台节流，并在 canvas 绘制后主动 invalidation。

## 验证方式

改动后需要彻底退出托盘中的旧进程，再重新启动。隐藏宠物窗口或关闭设置窗口不等于退出进程。

推荐从项目根目录执行：

```bash
pnpm desktop:electron
```

手动验证：

- 首次加载时不应残留 `正在加载宠物` 提示框。
- 点击宠物、hover、拖动后不应出现旧动作轮廓。
- 打开设置窗口，在“测试工具”里切换“动作状态”，不应出现上一动作残影。
- 点击“模拟 AI 事件”，不应出现旧动作或旧气泡残留。
- Windows 上宠物窗口透明表现不应明显变化。

代码验证：

```bash
node_modules/.bin/tsc -p apps/desktop/tsconfig.json --noEmit
node --check apps/desktop/electron/main.cjs
node --test .tmp/tests/tests/renderer.test.js .tmp/tests/tests/desktop-sprite-layout.test.js
```

## 后续维护建议

后续如果需要增强宠物窗口视觉效果，优先在 canvas 中实现，不要直接给透明窗口中的 DOM 元素添加可见效果。

可以谨慎添加：

- canvas 内绘制的气泡样式。
- canvas 内绘制的阴影。
- canvas 内绘制的缩放或位移。

应避免：

- 在 `.sprite` DOM 上使用 `filter`。
- 在透明窗口里加入新的半透明 DOM 卡片。
- 恢复 `background-position` 裁切 spritesheet。
- 依赖页面背景色或低 alpha 底色掩盖 macOS 透明窗口残影。
