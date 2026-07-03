---
name: ai-pet-creator
description: Create AI-Pets protocol-compatible pet packages inside this project, including custom action states, Codex pet wrapping, manifest generation, and Web POC validation. Use when creating or adapting pets for AI-Pets.
---

# AI Pet Creator

使用本 skill 创建或适配 AI-Pets 项目内的宠物包。开始前先阅读 `docs/protocol/ai-pet-protocol-v0.md`，确认当前协议字段、状态定义、动画定义和兼容约定。

## 输出位置

默认输出到 `pets/examples/<pet-id>/`。除非任务明确要求写入 Web POC 静态目录或其他路径，宠物源包、manifest、atlas、预览素材和说明都应放在该目录下。

## 创建 AI Pet Protocol 宠物

每个宠物包需要包含 AI Pet Protocol manifest，并声明：

- `protocolVersion`
- `petId`
- `displayName`
- `description`
- `assets.atlas`
- `states`
- `animationSets.default.animations`
- `interactions`
- `capabilities`
- 可选 `compatibility`

自定义动作状态需要提供状态 id、中文 label、animation id、row、frames、fps、loop、可选 `semanticRole`、默认触发事件和气泡文本。状态 id 用于程序引用，中文 label 用于 Web POC 按钮和界面展示，animation id 必须能在 `animationSets.default.animations` 中找到。

## 适配 Codex 宠物包

适配 Codex 包时保留原文件，不覆盖原始 `pet.json`、spritesheet 或其他源素材；在同一输出目录中创建 AI Pet Protocol manifest，把 Codex 的 9 状态映射为协议状态和动画。`compatibility.codexPet` 中记录来源、原始状态名和适配信息，方便后续回溯。

如果需要从角色图、品牌线索或参考图生成 Codex 兼容 8x9 atlas，先使用全局 `hatch-pet` workflow 生成 Codex 兼容包，再包装成 AI Pet Protocol。也就是说，`hatch-pet` 负责产出 Codex 生态可识别的 atlas 与 `pet.json`，本 skill 负责在项目内生成协议 manifest、补充自定义状态和运行 Web POC 验证。

## Web POC 验证

完成 manifest 后，需要用 Web POC 验证状态按钮是否动态出现。至少检查：

- 宠物能被加载。
- `states` 中每个状态都出现在界面状态按钮中。
- 自定义状态的按钮使用中文 label。
- 点击状态按钮后 atlas 行、帧数和 fps 表现符合 manifest。
- `interactions` 事件能触发预期状态和气泡文本。

## 安装范围

该 skill 位于项目内，不默认安装全局。其他 Codex 会话不会自动发现它；需要在本仓库上下文中读取或按项目文档手动引用。
