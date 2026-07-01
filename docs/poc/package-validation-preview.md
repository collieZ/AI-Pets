# 宠物包校验与预览流程

本文档定义 POC 阶段的轻量导入检查流程。目标是功能优先，避免过早做复杂工具，但让每个宠物包在进入桌面端前至少能被快速确认。

## 输入

一个可加载宠物包至少包含：

- `manifest.json` 或经适配器生成的 AI Pet Protocol manifest。
- `assets.atlas.path` 指向的 spritesheet 图片。
- `states`、`animationSets.default.animations`、`interactions`、`capabilities`。

Codex 旧包可以先保留原始 `pet.json` 和 `spritesheet.webp`，再通过适配器包装为 AI Pet Protocol。

## 最小校验

导入或预览前先确认：

1. `protocolVersion` 是当前支持的 `"0.1.0"`。
2. `assets.atlas` 的 `path`、`cellWidth`、`cellHeight`、`columns`、`rows` 完整。
3. 至少有一个状态可以渲染。
4. 每个状态的 `animation` 都能在默认动画集合里找到。
5. 每个 animation 的 `row`、`frames`、`fps` 合法。
6. `frames` 不应包含透明空帧；如果行尾是空白格，手动把有效帧数写小。
7. `interactions` 和 `capabilities` 即使为空也要保留对象结构。

## Web POC 预览

当前最快预览路径：

```powershell
pnpm import:yibao
pnpm dev
```

打开 Web POC 后检查：

- 宠物包能出现在下拉框。
- 状态按钮来自 manifest，而不是代码写死。
- 每个循环状态能持续播放，不闪烁。
- 每个非循环状态播完能回到待机。
- interaction 按钮能切状态并更新气泡文本。
- 播放速度调整后动作节奏有变化。
- 调试面板显示的状态、帧号、来源格式和语义角色符合预期。

## 失败处理

- 如果宠物完全不显示，先看协议校验错误，再检查 atlas 路径和单帧尺寸。
- 如果出现空白闪烁，优先检查 `frames` 是否包含透明空帧。
- 如果状态按钮缺失，检查状态引用的 animation 是否存在。
- 如果外部事件无法触发，检查 `interactions` 的 `state` 或 `semanticRole` 是否能找到可渲染状态。

