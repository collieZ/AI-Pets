---
name: ai-pet-creator
description: Create full AI-Pets project-compatible desktop pet packages from concepts, screenshots, generated images, or existing Codex pets. Use when creating, hatching, adapting, importing, or validating pets for AI-Pets, including Codex 8x9 atlas generation, AI Pet Protocol manifest generation, Codex pet.json compatibility, Web POC registration, and desktop import compatibility.
---

# AI Pet Creator

使用本 skill 创建或适配 AI-Pets 项目内的宠物包。默认目标不是占位验证包，而是接近全局 `hatch-pet` 的完整宠物孵化效果：真实逐行动作生成、Codex 兼容 atlas、QA 产物、AI Pet Protocol manifest、Web POC 和桌面导入兼容。

## 必读上下文

开始前必须读取：

- `docs/protocol/ai-pet-protocol-v0.md`：确认 AI Pet Protocol 字段、状态、动画和交互约定。
- `${CODEX_HOME:-$HOME/.codex}/skills/hatch-pet/SKILL.md`：完整遵守 Codex 宠物孵化流程、图像生成边界、subagent 规则和 QA 标准。

如果任务涉及图像生成，还必须按 `hatch-pet` 要求读取并遵守：

- `${CODEX_HOME:-$HOME/.codex}/skills/.system/imagegen/SKILL.md`

## 核心原则

- 以 `hatch-pet` 为视觉生成底座，本 skill 只增加 AI-Pets 项目的协议、目录、兼容和验证规则。
- 正常创建新宠物时，必须完成 `hatch-pet` 的真实流程：base 形象 + 行级动作生成 + deterministic finalize + QA review。
- 不要用本地 Python/Pillow、SVG、canvas、CSS、平移、缩放、翻转或贴图脚本伪造缺失的视觉动作行。唯一例外是 `hatch-pet` 明确允许且经过视觉确认的 `running-left` 镜像派生。
- 如果无法使用 `$imagegen`、无法使用 `hatch-pet` 脚本、无法使用 subagents 生成动作行，停止并向用户说明阻塞点，不要静默降级成占位 spritesheet。
- 只有用户明确要求“快速验证包”“占位包”“协议 smoke test”时，才允许创建非完整视觉包；最终回复必须明确标注它不是正式 hatch-pet 质量。

## 输出位置

默认输出三类位置，按用户要求选择：

- Codex 兼容包：`${CODEX_HOME:-$HOME/.codex}/pets/<pet-id>/`
- 项目源包：`pets/examples/<pet-id>/`
- Web POC 静态包：`apps/web-poc/public/pets/<pet-id>/`

每个 AI-Pets 项目包至少包含：

- `pet.json`：Codex 兼容描述。
- `manifest.json`：AI Pet Protocol manifest。
- `spritesheet.webp`：Codex 兼容 8x9 atlas。
- `source.json`：来源、生成方式和适配信息。
- QA 产物：至少保留 `qa/contact-sheet.png` 或等价检查图；有视频预览时一并保留。

## 完整创建流程

### 1. 准备

确认或推断：

- `pet-id`：小写字母、数字和短横线优先。
- `displayName`：中文展示名。
- 描述：一句话说明宠物身份和参考来源。
- 输出范围：Codex 目录、项目 examples、Web POC、桌面导入测试目录中的哪些位置。
- 参考图片或文字设定。

### 2. 执行 hatch-pet

按全局 `hatch-pet` 执行完整流程：

1. 运行 `prepare_pet_run.py` 创建 run 目录和 imagegen jobs。
2. 生成并记录 base 形象。
3. 使用 subagents 生成行级动作，至少先生成 `idle` 和 `running-right` 做身份一致性检查。
4. 仅在视觉确认安全时镜像 `running-left`，否则正常生成。
5. 对所有非派生行使用 `$imagegen`，并附带 `imagegen-jobs.json` 中列出的 grounding images 和 layout guide。
6. 使用 `record_imagegen_result.py` 记录真实生成输出。
7. 运行 `finalize_pet_run.py`，生成 `spritesheet.webp`、`pet.json`、contact sheet、review 和 preview。
8. 如果 QA 失败，使用 `queue_pet_repairs.py` 修复最小失败范围。

不得手动修改 `imagegen-jobs.json` 来伪造完成状态。

### 3. 包装 AI Pet Protocol

在 `hatch-pet` 产出的 Codex 包基础上生成 AI-Pets manifest。优先使用本 skill 的包装脚本：

```bash
python skills/ai-pet-creator/scripts/wrap_codex_pet.py \
  --codex-pet-dir "${CODEX_HOME:-$HOME/.codex}/pets/<pet-id>" \
  --out-dir pets/examples/<pet-id> \
  --pet-id <pet-id> \
  --display-name "<中文名>" \
  --force
```

如果需要放入 Web POC，再运行一次：

```bash
python skills/ai-pet-creator/scripts/wrap_codex_pet.py \
  --codex-pet-dir "${CODEX_HOME:-$HOME/.codex}/pets/<pet-id>" \
  --out-dir apps/web-poc/public/pets/<pet-id> \
  --pet-id <pet-id> \
  --display-name "<中文名>" \
  --force
```

包装脚本只做确定性复制和 manifest/source 生成，不生成或伪造视觉素材。

### 4. 注册 Web POC

当输出到 `apps/web-poc/public/pets/<pet-id>/` 时，更新 `apps/web-poc/src/petCatalog.ts`：

- `sourceType` 可选 `"ai-pet-protocol"`，优先指向 `manifest.json`。
- 如果需要专门验证 Codex adapter，也可以另加一项 `"codex-pet"` 指向 `pet.json`。
- label 使用中文名，并标注协议类型时保持简洁。

### 5. 验证

至少检查：

- `manifest.json` JSON 可解析，`protocolVersion` 为 `"0.1.0"`。
- `pet.json` JSON 可解析，`id` 和 `spritesheetPath` 有效。
- `spritesheet.webp` 是 `1536x1872`，基于 `192x208` cell，具备透明通道。
- `manifest.assets.atlas` 与实际 atlas 一致。
- `states` 的每个 `animation` 都存在于 `animationSets.default.animations`。
- Web POC 能加载宠物，状态按钮动态出现，中文 label 正常。
- 桌面端导入文件夹时能识别 `manifest.json`，资源通过 `ai-pets://` 加载。
- `hatch-pet` 的 `qa/review.json` 没有 error，contact sheet 经肉眼检查无身份漂移、错位、白底、残影或伪动作。

项目侧改动后，优先运行：

```bash
npm test
```

## Codex 9 状态映射

AI-Pets manifest 默认把 Codex 9 行映射为：

- `idle` -> `idle`
- `running-right` -> `moveRight`
- `running-left` -> `moveLeft`
- `waving` -> `greet`
- `jumping` -> `jump`
- `failed` -> `error`
- `waiting` -> `waiting`
- `running` -> `working`
- `review` -> `reviewing`

默认 atlas 参数：

- `cellWidth`: `192`
- `cellHeight`: `208`
- `columns`: `8`
- `rows`: `9`

## 适配已有 Codex 宠物

当用户提供已有 Codex 宠物目录时，不需要重新生成视觉素材。流程是：

1. 检查目录中存在 `pet.json` 和 `spritesheet.webp`。
2. 使用 `wrap_codex_pet.py` 复制到目标目录。
3. 生成 `manifest.json` 和 `source.json`。
4. 按需要注册 Web POC。
5. 验证协议和加载行为。

适配已有包时保留原始 Codex 文件，不删除源目录。

## 禁止的静默降级

除非用户明确要求“验证包/占位包”，否则不要：

- 只生成一张 base 图后用脚本平移/缩放出 8x9 atlas。
- 用本地绘图脚本替代 `$imagegen` 行级动作生成。
- 跳过 `hatch-pet` QA 却声称宠物已完整孵化。
- 因为生成耗时、费用或工具不可用，就自动改成协议 smoke test。

如果只能做验证包，最终回复必须写清：

- 使用了验证包路径。
- 哪些视觉动作不是逐行重绘。
- 后续需要重新跑完整 `hatch-pet` 流程才能达到正式宠物质量。

## 完成标准

完整宠物任务完成时，需要同时满足：

- Codex 包可被 Codex 识别：`pet.json` + `spritesheet.webp`。
- AI-Pets 包可被本项目识别：`manifest.json` + `spritesheet.webp`。
- Web POC 或桌面端按用户要求可以加载。
- QA 产物存在并通过检查。
- 最终回复说明输出路径、验证命令、是否使用 subagents、是否有镜像或 repair。
