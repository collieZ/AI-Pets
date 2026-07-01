# 外部 AI 驱动协议草案 v0

本文档定义外部 AI 应用如何驱动 AI-Pets 的最小事件协议。POC 阶段先固定事件语义，不急着做完整 SDK。

## 目标

- 外部应用不需要理解 spritesheet、row、frame 等渲染细节。
- 外部应用可以按状态 id、语义角色或 interaction id 驱动宠物。
- 同一协议后续能被 Web POC、桌面端和硬件端复用。

## 推荐传输方式

MVP 初版推荐先做本地 HTTP：

- 易调试，可以直接用 curl/Postman。
- 对外部应用门槛低。
- 只监听 `127.0.0.1`，默认不暴露到局域网或公网。

WebSocket 可以作为后续增强，用于连续流式消息、长任务进度和更低延迟状态同步。

## 事件格式

```json
{
  "type": "pet.event",
  "interactionId": "aiWorking",
  "state": "running",
  "semanticRole": "working",
  "say": "正在处理任务...",
  "durationMs": 3000,
  "source": "codex"
}
```

字段说明：

- `type`：事件类型，当前固定为 `pet.event`。
- `interactionId`：可选，优先按宠物包 `interactions` 查找。
- `state`：可选，直接指定 manifest 中的状态 id。
- `semanticRole`：可选，按语义角色查找状态。
- `say`：可选，覆盖或补充气泡文本。
- `durationMs`：可选，提示宿主多久后回到 idle；非循环动作仍按动画时长自然回退。
- `source`：可选，记录事件来源，便于调试。

## 解析优先级

宿主收到事件后按以下顺序解析：

1. 如果有 `interactionId`，先查 `manifest.interactions[interactionId]`。
2. interaction 中如果声明 `state`，优先切换该状态。
3. 如果没有明确 `state`，使用 interaction 或事件里的 `semanticRole` 查找状态。
4. 如果事件直接声明 `state`，并且状态存在，则切换该状态。
5. 如果仍找不到状态，但有 `say`，只更新气泡文本，不切换动作。
6. 如果状态和文本都无法处理，忽略事件并记录调试日志。

## 本地 HTTP 草案

```http
POST /api/pet/event
Content-Type: application/json
```

请求体使用上面的事件格式。

响应示例：

```json
{
  "ok": true,
  "applied": {
    "state": "running",
    "semanticRole": "working",
    "say": "正在处理任务..."
  }
}
```

错误响应示例：

```json
{
  "ok": false,
  "error": "unknown_state",
  "message": "状态 running 不存在"
}
```

## 安全边界

- 默认只监听 `127.0.0.1`。
- 初版不接受远程跨设备控制。
- 不执行外部传入的脚本、命令或文件路径。
- `say` 只作为展示文本处理，不参与系统提示词或命令执行。
- 事件频率需要节流，避免外部应用高频刷状态导致动画抖动。

