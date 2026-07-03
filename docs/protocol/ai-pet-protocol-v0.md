# AI Pet Protocol v0

本文档描述 AI-Pets POC 使用的宠物包协议。当前版本面向 Web POC 和 Codex 宠物包适配，目标是让宠物动作、语义状态、交互事件和渲染资源都能用一个 manifest 表达。

## 基本结构

AI Pet Protocol manifest 是一个 JSON 对象。POC 当前要求 `protocolVersion` 为 `"0.1.0"`。

```json
{
  "protocolVersion": "0.1.0",
  "petId": "example-buddy",
  "displayName": "示例伙伴",
  "description": "用于验证 AI Pet Protocol 的示例宠物。",
  "sourceFormat": "ai-pet-protocol",
  "assets": {},
  "states": {},
  "animationSets": {},
  "interactions": {},
  "capabilities": {},
  "compatibility": {}
}
```

- `petId`：项目内唯一 id，建议使用小写字母、数字和连字符。
- `displayName`：中文或本地化展示名称。
- `description`：宠物说明。
- `sourceFormat`：可选，常见值为 `"ai-pet-protocol"` 或 `"codex-pet"`。

## assets.atlas

`assets.atlas` 描述 spritesheet 资源。POC 当前支持 `type: "spritesheet"`。

```json
{
  "assets": {
    "atlas": {
      "path": "spritesheet.webp",
      "type": "spritesheet",
      "cellWidth": 192,
      "cellHeight": 208,
      "columns": 8,
      "rows": 9
    }
  }
}
```

- `path`：相对 manifest 所在目录的图片路径。
- `cellWidth` / `cellHeight`：单帧尺寸。
- `columns` / `rows`：atlas 网格列数和行数。

## states

`states` 是状态 id 到状态定义的映射。Web POC 会基于这里的条目动态生成状态按钮。

```json
{
  "states": {
    "thinking": {
      "label": "思考中",
      "animation": "thinking",
      "semanticRole": "thinking",
      "loop": true,
      "custom": true
    }
  }
}
```

- 状态 id：程序触发状态时使用的稳定 key。
- `label`：中文展示名。
- `animation`：引用 `animationSets.default.animations` 中的 animation id。
- `semanticRole`：可选语义角色，用于外部事件按意图触发状态。
- `loop`：是否循环播放。
- `custom`：可选，标记该状态不是兼容预设的一部分。

## semanticRole

`semanticRole` 表示状态的通用语义，不要求和状态 id 相同。已知语义包括：

- `idle`
- `moveRight`
- `moveLeft`
- `greet`
- `jump`
- `error`
- `waiting`
- `working`
- `reviewing`
- `thinking`

适配器或宿主可以优先按 `semanticRole` 查找合适状态。例如外部 AI 发出 `aiWorking` 时，可以触发任意标记为 `working` 的状态，而不必知道具体状态 id。

## animationSets.default.animations

`animationSets.default.animations` 定义 animation id 到 atlas 行和播放参数的映射。

```json
{
  "animationSets": {
    "default": {
      "animations": {
        "thinking": {
          "row": 3,
          "frames": 8,
          "fps": 5
        }
      }
    }
  }
}
```

- `row`：从 0 开始的 atlas 行号。
- `frames`：该动画使用的帧数。
- `fps`：播放帧率。

状态的 `animation` 必须引用这里存在的 animation id。`loop` 放在状态层，因为同一个动画在不同状态中可能有不同播放策略。

## 播放与回退约定

POC 约定宿主按以下规则播放动画：

- `fps` 是宠物包声明的默认播放频率，宿主可以提供倍率调节，但不应修改 manifest。
- `frames` 必须只包含有效帧。spritesheet 行尾如果是透明占位格，不应计入 `frames`。
- `loop: true` 的状态持续循环播放，适合待机、工作中、等待输入、检查结果等长时间状态。
- `loop: false` 的状态只播放一轮。播放结束后，宿主应回到 `semanticRole: "idle"` 的状态；如果没有 idle，则回到第一个可渲染状态。
- 宿主不应在动作结束时显示空白帧，也不应因为动作结束清空当前状态。

这些规则是 Web POC、桌面端和硬件端的共同基线。硬件端可以降低帧率或缩小资源，但仍应遵守 `frames`、`fps` 和 `loop` 的语义。

## 宿主职责边界

AI Pet Protocol 只描述“宠物包能做什么”，不描述某个具体宿主的全部 UI 行为。当前边界如下：

- 协议负责：资源路径、atlas 网格、状态、动画、交互事件、能力声明和兼容来源。
- 渲染器负责：根据状态和时间计算当前帧，并处理循环/非循环帧选择。
- 宿主负责：宠物包加载、错误展示、播放速度倍率、一次性动作结束后的 idle 回退、拖拽和点击等输入行为。
- 外部 AI 应用负责：发出语义事件或状态事件，不直接操作 spritesheet 行列。

后续升级协议时，应优先保持 v0 字段兼容；新增能力放到可选字段或 `capabilities` 中，避免已有宠物包失效。

## interactions

`interactions` 描述宿主事件到状态和气泡文本的映射。
`interactions` 是必需对象；可以是空对象 `{}`，但不能省略。

```json
{
  "interactions": {
    "aiThinking": {
      "state": "thinking",
      "say": "我想一想。"
    },
    "aiWorking": {
      "semanticRole": "working",
      "say": "正在处理任务..."
    }
  }
}
```

- `state`：直接触发某个状态 id。
- `semanticRole`：按语义角色选择状态。
- `say`：可选气泡文本。

当同一 interaction 同时声明 `state` 和 `semanticRole` 时，宿主应优先使用 `state`，因为它指向明确状态。

## capabilities

`capabilities` 是布尔能力表，用于声明宠物包期望宿主支持的能力。
`capabilities` 是必需对象；可以是空对象 `{}`，但不能省略。

```json
{
  "capabilities": {
    "speechBubble": true,
    "drag": true,
    "stateMachine": true,
    "externalEvents": true,
    "customStates": true
  }
}
```

POC 不要求固定全集，但建议明确声明与体验相关的能力，方便桌面端、Web 端和硬件端按能力降级。

## compatibility

`compatibility` 存放适配来源和兼容信息，不参与基础渲染。

```json
{
  "compatibility": {
    "codexPet": {
      "supported": true,
      "sourcePath": "pet.json",
      "preset": "codex-9-state",
      "states": {
        "idle": "idle",
        "running-right": "moveRight"
      }
    }
  }
}
```

从 Codex 宠物包适配时，保留原始文件，并通过 `compatibility.codexPet` 记录原始格式、状态映射和来源路径。

## 自定义状态示例

下面示例添加一个「期待夸夸」状态。它不是 Codex 9 状态预设的一部分，但可以通过 Web POC 动态按钮和外部事件触发。

```json
{
  "states": {
    "expectingPraise": {
      "label": "期待夸夸",
      "animation": "expectingPraise",
      "semanticRole": "waiting",
      "loop": true,
      "custom": true
    }
  },
  "animationSets": {
    "default": {
      "animations": {
        "expectingPraise": {
          "row": 9,
          "frames": 8,
          "fps": 6
        }
      }
    }
  },
  "interactions": {
    "aiNeedsReview": {
      "state": "expectingPraise",
      "say": "仙贝，可以看看我做得怎么样吗？"
    }
  }
}
```

创建自定义状态时，需要同时确认状态 id、中文 label、animation id、row、frames、fps、loop、可选 `semanticRole`、默认触发事件和气泡文本。

## Codex 9 状态兼容预设

Codex 9 状态只是兼容预设，不是 AI Pet Protocol 的上限。当前适配器会把 Codex 常见状态映射为协议状态：

- `idle` -> `idle`
- `running-right` -> `moveRight`
- `running-left` -> `moveLeft`
- `waving` -> `greet`
- `jumping` -> `jump`
- `failed` -> `error`
- `waiting` -> `waiting`
- `running` -> `working`
- `review` -> `reviewing`

新宠物可以只包含少量状态，也可以包含更多自定义状态。宿主应依据 manifest 动态生成控件和状态机，而不是假设永远只有 9 个状态。
