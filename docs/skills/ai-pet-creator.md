# ai-pet-creator Skill 使用说明

`ai-pet-creator` 是 AI-Pets 项目内 skill，用于创建或适配符合 AI Pet Protocol 的宠物包。它放在 `skills/ai-pet-creator/SKILL.md`，不会默认安装到全局 Codex skill 目录。

## 适用场景

- 从零创建一个 AI Pet Protocol 宠物包。
- 为现有 spritesheet 编写 manifest。
- 把 Codex 宠物包包装成 AI Pet Protocol。
- 为宠物添加自定义动作状态和外部 AI 事件。
- 用 Web POC 验证状态按钮和 interaction 行为。

## 使用流程

1. 先阅读 `docs/protocol/ai-pet-protocol-v0.md`。
2. 确定 `petId`、展示名称、输出目录和 atlas 尺寸。
3. 默认输出到 `pets/examples/<pet-id>/`。
4. 编写或生成 AI Pet Protocol manifest。
5. 为每个状态补齐中文 label、animation id、row、frames、fps 和 loop。
6. 为自定义状态补齐默认触发事件、气泡文本和可选 `semanticRole`。
7. 如果来源是 Codex 包，保留原始文件，并在 manifest 的 `compatibility` 中记录适配信息。
8. 在 Web POC 中加载宠物，确认状态按钮动态出现并能触发动画。

## 与 hatch-pet 的关系

当任务需要从角色图、参考图或品牌概念生成 Codex 兼容 atlas 时，先使用 `hatch-pet` 产出 Codex 兼容宠物包。随后使用 `ai-pet-creator` 在本项目内生成 AI Pet Protocol manifest，并补充自定义状态、interaction 和 POC 验证记录。

## 输出要求

输出目录至少应包含：

- AI Pet Protocol manifest。
- atlas 图片或对原始 atlas 的相对引用。
- 原始 Codex 文件，适配 Codex 包时必须保留。
- 必要的验证说明或示例 interaction。

新增状态不需要修改 Web POC 源码。只要 manifest 的 `states` 和 `animationSets.default.animations` 完整，Web POC 应能自动显示对应按钮。
