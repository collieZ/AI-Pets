# AI-Pets POC 设计

## 目标

构建 AI-Pets 的第一版概念验证。AI-Pets 是一个可扩展的 AI 宠物产品，后续既可以作为 Windows/macOS 上的独立桌面宠物运行，也可以演进到带显示屏和交互能力的硬件形态，并通过大模型获得表达、陪伴、反馈和任务状态呈现能力。

本 POC 要验证共同底座：

- 一套不依赖 Codex 的自定义 AI Pet Protocol。
- 一个项目内 `ai-pet-creator` skill，用于创建适配该协议的宠物包。
- 一个 Codex 宠物兼容适配层，可以解析 Codex 风格宠物资源并转换为统一协议模型。
- 一个 Web 端渲染和交互验证器，用于快速验证宠物状态、动画、事件和交互。
- 一个 `task.JSON` 阶段计划，以及面向后续迭代的完整中文文档。

按照初始要求，POC 阶段可以不落自动化测试。实现仍然需要保留可手动验证的示例资源、运行方式和验证记录。

## 语言约定

- 项目文档默认使用中文，包括协议说明、POC 使用说明、适配器说明、skill 说明、路线图和验收记录。
- `task.JSON` 中面向人阅读的字段默认使用中文，例如 `title`、`description`、`deliverables`、`acceptanceCriteria`。
- 代码标识符、包名、协议字段名、文件名、命令和 npm script 保持英文，避免破坏工程生态和跨平台兼容性。
- 面向 AI 或 Codex 使用的 skill 文档默认中文撰写，但协议字段、命令示例和目录路径保持英文。
- UI 文案在 POC 阶段默认中文，必要的调试字段可以保留英文 key。

## 范围

### 包含

- 定义 `AI Pet Protocol v0` 作为内部宠物包格式。
- 支持 spritesheet/atlas 动画，包括 Codex 风格的行、帧数和状态。
- 实现 Web POC：加载示例宠物包、渲染动画状态、支持基础交互。
- 实现 Codex 兼容适配器：把 `pet.json + spritesheet.webp/png` 映射为统一的 `PetPackage`。
- 创建项目内 `ai-pet-creator` skill 模板，指导 Codex 生成兼容 AI Pet Protocol 的宠物包。
- 提供一个或多个轻量示例宠物包，用于验证协议和渲染器。
- 创建中文文档，覆盖协议、适配器行为、POC 使用方式、MVP 桌面端计划、硬件阶段方向和任务规划。

### 不包含

- 原生 Windows/macOS 悬浮桌面宠物应用。
- 真实硬件固件或设备驱动。
- 生产级大模型集成。
- 市场、账号、计费或云同步系统。
- 完整自动化测试覆盖。
- 与 `hatch-pet` 完全等价的图像生成流水线。

## 推荐方案

采用“协议优先 + Web POC”的路线。

Web 应用不直接渲染 Codex 宠物格式。所有来源格式先归一化为共享的 `PetPackage` 模型，再交给渲染器：

```text
Codex pet.json + spritesheet -> codex-pet-adapter -> PetPackage -> pet-renderer -> Web POC
AI Pet Protocol package      -> pet-protocol      -> PetPackage -> pet-renderer -> Web POC
```

这样 Codex 兼容性只是一个适配器，而不是产品核心格式。后续桌面端和硬件端可以复用协议和渲染概念，不需要继承 Codex 当前格式的所有假设。

## 架构

### 仓库结构

```text
AI-Pets/
  apps/
    web-poc/
      src/
      public/
      package.json
  packages/
    pet-protocol/
      src/
    pet-renderer/
      src/
    codex-pet-adapter/
      src/
  skills/
    ai-pet-creator/
      SKILL.md
      references/
      scripts/
  pets/
    examples/
  docs/
    protocol/
    poc/
    adapters/
    skills/
    roadmap/
    superpowers/specs/
  task.JSON
  package.json
```

### 模块职责

`packages/pet-protocol`

- 负责协议 schema、TypeScript 类型、校验逻辑和版本信息。
- 导出统一的 `PetPackage` 类型，供渲染器和适配器使用。
- 保留迁移入口，即使 v0 暂时没有真实迁移逻辑。

`packages/pet-renderer`

- 负责 atlas 帧选择、动画计时、状态切换和渲染辅助逻辑。
- 尽量保持与具体 UI 框架解耦，Web POC 可以提供 DOM/canvas 实现。
- 不直接了解 Codex 的 `pet.json` 文件格式。

`packages/codex-pet-adapter`

- 读取 Codex 风格 manifest，例如 `pet.json`。
- 将 Codex 状态和 atlas 几何信息映射为 `PetPackage`。
- 文档中明确兼容假设、警告和失败场景。

`apps/web-poc`

- 提供第一版验证界面。
- 从 `pets/examples` 加载内置示例。
- 支持状态切换、点击/触摸、浏览器舞台内拖拽，以及模拟 AI 事件。
- 显示当前状态、帧索引、协议版本、来源格式等调试信息。

`skills/ai-pet-creator`

- v0 阶段作为项目内 Codex skill 模板，不默认安装到全局 Codex skills 目录。
- 指导 Codex 创建兼容 AI Pet Protocol 的宠物包。
- 引用 AI Pet Protocol 中文文档，并可说明如何借鉴或复用 `hatch-pet` 的资产生成思路。
- 输出可被 Web POC 加载的宠物包文件。

## Protocol v0

### 设计原则

- 协议拥有稳定、可移植的状态语义。
- Codex 兼容信息放在 `compatibility` 中，不让所有未来客户端都被 Codex 格式绑定。
- 资产路径相对宠物包根目录声明，避免环境相关绝对路径。
- `capabilities` 描述宠物能做什么，`interactions` 描述外部事件如何触发行为。
- 版本字段必须明确，为未来迁移保留空间。

### Manifest 示例

```json
{
  "protocolVersion": "0.1.0",
  "petId": "example-buddy",
  "displayName": "示例伙伴",
  "description": "一个用于 POC 验证的紧凑型动画 AI 宠物。",
  "assets": {
    "atlas": {
      "path": "spritesheet.png",
      "type": "spritesheet",
      "cellWidth": 192,
      "cellHeight": 208,
      "columns": 8,
      "rows": 9
    }
  },
  "states": {
    "idle": { "animation": "idle", "loop": true },
    "moveRight": { "animation": "running-right", "loop": true },
    "moveLeft": { "animation": "running-left", "loop": true },
    "greet": { "animation": "waving", "loop": false },
    "jump": { "animation": "jumping", "loop": false },
    "error": { "animation": "failed", "loop": false },
    "waiting": { "animation": "waiting", "loop": true },
    "working": { "animation": "running", "loop": true },
    "reviewing": { "animation": "review", "loop": true }
  },
  "animationSets": {
    "default": {
      "animations": {
        "idle": { "row": 0, "frames": 6, "fps": 8 },
        "running-right": { "row": 1, "frames": 8, "fps": 12 },
        "running-left": { "row": 2, "frames": 8, "fps": 12 },
        "waving": { "row": 3, "frames": 6, "fps": 8 },
        "jumping": { "row": 4, "frames": 8, "fps": 12 },
        "failed": { "row": 5, "frames": 6, "fps": 8 },
        "waiting": { "row": 6, "frames": 6, "fps": 8 },
        "running": { "row": 7, "frames": 8, "fps": 12 },
        "review": { "row": 8, "frames": 6, "fps": 8 }
      }
    }
  },
  "interactions": {
    "click": { "state": "greet", "say": "你好！" },
    "dragStart": { "state": "moveRight" },
    "aiWorking": { "state": "working", "say": "正在处理..." },
    "aiNeedsInput": { "state": "waiting", "say": "需要你的确认。" },
    "aiError": { "state": "error", "say": "出了点问题。" },
    "aiReview": { "state": "reviewing", "say": "正在检查结果。" }
  },
  "capabilities": {
    "speechBubble": true,
    "drag": true,
    "stateMachine": true,
    "externalEvents": true
  },
  "compatibility": {
    "codexPet": {
      "supported": true,
      "stateRows": "codex-9-row-atlas"
    }
  }
}
```

实现阶段可以细化 schema，但这些顶层概念在 v0 中应保持稳定。

## Codex 兼容性

POC 应支持 Codex 风格宠物作为导入来源，默认假设如下：

- Manifest 文件：`pet.json`。
- Sprite 资产：`spritesheet.webp` 或 `spritesheet.png`。
- Atlas 单元格尺寸：`192x208`。
- Atlas 总尺寸：`1536x1872`。
- 行状态：`idle`、`running-right`、`running-left`、`waving`、`jumping`、`failed`、`waiting`、`running`、`review`。

适配器应按以下规则归一化状态：

```text
idle          -> idle
running-right -> moveRight
running-left  -> moveLeft
waving        -> greet
jumping       -> jump
failed        -> error
waiting       -> waiting
running       -> working
review        -> reviewing
```

如果缺失 sprite 资产、atlas 几何信息未知、行/帧定义不合法，或 Codex manifest 中存在会改变运行时行为但当前不支持的字段，适配器应明确报错或给出警告。

## Web POC 体验

第一屏应直接是可操作的宠物验证台，而不是营销页。

必需控件：

- 宠物包选择器。
- 所有归一化状态的切换按钮。
- 模拟 AI 事件按钮：工作中、需要输入、检查结果、错误、完成。
- 气泡文本输入或预设话术。
- 浏览器舞台内的拖拽交互。
- 调试面板，展示来源格式、协议版本、当前状态、动画帧、FPS 和资产信息。

必需状态：

- 正在加载宠物包。
- 宠物包校验失败。
- 资产缺失。
- 示例列表为空。
- 正常渲染。

视觉风格应实用、清晰、克制。POC 的目标是验证协议和交互闭环，装饰性优先级低于可读性和可调试性。

## Skill 设计

`ai-pet-creator` skill 在 v0 阶段只服务项目内宠物包创建：

- 生成宠物前先阅读协议文档。
- 在 `pets/examples` 或用户指定目录下创建宠物包。
- 输出协议 manifest、sprite 资产引用、元数据，以及必要时的简短使用说明。
- 优先使用用户提供或已生成的 sprite 资产。
- 如果从 Codex 宠物适配，应保留原始文件，并创建引用这些文件的 AI Pet Protocol manifest。

该 skill 在 v0 阶段不追求替代 `hatch-pet`。它应说明何时使用 `hatch-pet` 生成 Codex 兼容 atlas 资产，再将这些资产包装为 AI Pet Protocol 宠物包。

## 文档计划

实现阶段需要创建以下中文文档：

- `docs/protocol/ai-pet-protocol-v0.md`
- `docs/poc/web-poc.md`
- `docs/adapters/codex-pet-compatibility.md`
- `docs/skills/ai-pet-creator.md`
- `docs/roadmap/mvp-desktop.md`
- `docs/roadmap/hardware-product.md`

这些文档需要明确后续兼容性原则：

- 桌面端应用消费协议包，不依赖 Web POC 内部实现。
- 硬件端可以使用裁剪后的渲染器，但应保留 manifest 和状态语义。
- AI 集成应发送语义化宠物事件，而不是直接控制动画帧。

## Roadmap 和 task.JSON

`task.JSON` 至少跟踪三个阶段：

1. `poc`
   - Protocol v0。
   - Web 渲染器和验证台。
   - Codex 适配器。
   - 项目内 pet creator skill。
   - 示例宠物包和中文文档。

2. `mvp-desktop`
   - Windows/macOS 独立桌面宠物应用。
   - 透明、置顶的宠物窗口。
   - 宠物包导入。
   - 本地设置。
   - 外部 AI 应用事件桥接。

3. `hardware-product`
   - 硬件显示架构。
   - 受限设备运行格式。
   - 输入传感器和交互模型。
   - 大模型连接方案。
   - OTA 和内容更新策略。

每个任务至少包含 `id`、`title`、`phase`、`status`、`priority`、`dependencies`、`deliverables` 和 `acceptanceCriteria`。其中 `id`、`phase`、`status`、`priority`、`dependencies` 保持英文结构化值，`title`、`deliverables`、`acceptanceCriteria` 使用中文。

## 实现说明

- 协议和渲染器包优先使用 TypeScript。
- POC 优先使用轻量 Vite Web 应用，除非实现阶段发现更强的本地理由。
- 尽量减少依赖。
- 协议校验应确定性执行，并与 UI 分离。
- 示例资产可以简洁，先验证协议闭环，后续再提升视觉质量。
- POC 完成不要求自动化测试，但项目结构要为后续测试覆盖留好位置。

## 验收标准

POC 完成时应满足：

- 仓库包含计划中的协议、渲染器、适配器、Web POC、skill、中文文档、示例宠物包和 `task.JSON`。
- Web POC 能加载至少一个 AI Pet Protocol 宠物包。
- Web POC 能渲染所有 v0 状态并在状态之间切换。
- Web POC 能模拟 AI 事件并显示宠物气泡文本。
- Codex 适配器能把 Codex 风格宠物包归一化为共享协议模型。
- `ai-pet-creator` 作为项目内 skill 存在，并有清晰的中文使用说明。
- 文档用中文解释协议 v0、Codex 兼容性、Web POC 使用方式、MVP 桌面端方向、硬件方向和阶段任务。
- 最终回复中记录手动验证结果。

## 待后续决策

- 项目内 skill 后续是否安装到用户全局 Codex skills 目录。
- 原生桌面端使用 Tauri、Electron 还是其他壳。
- 硬件端渲染完整 spritesheet，还是使用编译后的二进制/资源格式。
- MVP 阶段优先接入哪些外部 AI 应用。

