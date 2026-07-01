# Codex 宠物包兼容说明

## 验证宠物包

本机用于 POC 的 Codex 宠物包路径为 `C:\Users\collieZhou\.codex\pets\yibao`。验证时先确认该目录存在原始 `pet.json` 和 spritesheet，再运行项目导入命令生成 AI Pet Protocol manifest。

验证重点：

- 原始 Codex 文件仍被保留。
- 生成的 manifest 能通过协议校验。
- Web POC 能加载导入后的宠物。
- 状态按钮来自 manifest 的 `states`，不是写死在页面中。

## 适配规则

Codex 宠物包通常包含 `pet.json`、spritesheet 和固定动作列表。适配器读取 Codex 元数据后生成 AI Pet Protocol manifest：

- `petId` 来自 Codex `id` 或目录名。
- `displayName` 和 `description` 来自 Codex 元数据。
- `assets.atlas.path` 指向保留的 spritesheet。
- `states` 由 Codex 动作映射生成。
- `animationSets.default.animations` 按 atlas 行生成动画定义。
- `compatibility.codexPet` 记录 Codex 来源和状态映射。

适配时不覆盖原文件。AI Pet Protocol manifest 是新增兼容层，用来让 Web POC、未来桌面端和其他宿主读取同一套结构。

## interactions 优先级

`interactions` 可以通过 `state` 或 `semanticRole` 触发宠物动作。

优先级建议如下：

1. 如果 interaction 声明 `state`，优先使用该状态 id。
2. 如果没有 `state`，但声明了 `semanticRole`，选择第一个匹配该语义角色的状态。
3. 如果语义角色没有匹配状态，回退到 `idle`。
4. 如果 interaction 包含 `say`，同时显示气泡文本。

这样可以兼容明确动作和语义动作两种调用方式。桌面端或外部 AI 桥接可以只发语义事件，具体表现由宠物包决定。

## Codex 9 状态回退

Codex 9 状态是兼容预设，不是协议限制。当前回退映射为：

- `idle`：待机。
- `running-right`：向右移动。
- `running-left`：向左移动。
- `waving`：打招呼。
- `jumping`：跳跃。
- `failed`：失败或出错。
- `waiting`：等待输入。
- `running`：处理任务。
- `review`：检查或 review。

如果 Codex 包缺少某个状态，适配器可以回退到 `idle` 或语义接近的现有状态。生成 manifest 时应保留缺失信息到 `compatibility.codexPet`，方便后续补全。

## 已知限制

- POC 当前只覆盖 spritesheet atlas，不处理骨骼动画或视频素材。
- Codex 旧包的状态名和 atlas 行约定需要适配器推断，异常包可能需要手动修正 manifest。
- `semanticRole` 只能表达通用意图，不能替代完整状态机。
- Web POC 用于验证加载、状态按钮和基础交互，不代表最终桌面透明窗口体验。
- Codex 9 状态回退能保证基础可用，但不会自动生成额外自定义动作。
