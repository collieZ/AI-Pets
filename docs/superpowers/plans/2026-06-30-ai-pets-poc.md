# AI-Pets POC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 AI-Pets POC：自定义可扩展宠物协议、Codex/yibao 兼容适配、Web 渲染验证器、项目内宠物创建 skill、中文文档和 `task.JSON`。

**Architecture:** 使用 TypeScript monorepo。`pet-protocol` 负责协议类型与校验，`codex-pet-adapter` 负责把 Codex/yibao 包归一化为 `PetPackage`，`pet-renderer` 负责基于宠物包声明的状态动态计算动画帧，`apps/web-poc` 负责中文 Web 验证台。所有可触发状态都来自宠物包 manifest，不在 UI 中写死动作集合。

**Tech Stack:** Node.js、pnpm workspaces、TypeScript、Vite、React、Canvas/DOM sprite 渲染、JSON manifest、项目内 Codex skill。

---

## 文件结构

实现结束后应包含：

```text
AI-Pets/
  .gitignore
  package.json
  pnpm-workspace.yaml
  tsconfig.base.json
  task.JSON
  apps/web-poc/
    index.html
    package.json
    src/App.tsx
    src/main.tsx
    src/styles.css
    src/petCatalog.ts
    public/pets/example-buddy/manifest.json
    public/pets/example-buddy/spritesheet.svg
    public/pets/yibao-codex/pet.json
    public/pets/yibao-codex/spritesheet.webp
  packages/pet-protocol/
    package.json
    src/index.ts
    src/types.ts
    src/validate.ts
  packages/codex-pet-adapter/
    package.json
    src/index.ts
    src/codexStates.ts
  packages/pet-renderer/
    package.json
    src/index.ts
    src/frameMath.ts
  scripts/import-yibao.mjs
  skills/ai-pet-creator/SKILL.md
  docs/protocol/ai-pet-protocol-v0.md
  docs/poc/web-poc.md
  docs/adapters/codex-pet-compatibility.md
  docs/skills/ai-pet-creator.md
  docs/roadmap/mvp-desktop.md
  docs/roadmap/hardware-product.md
```

## Task 1: 初始化 TypeScript monorepo

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `apps/web-poc/package.json`
- Create: `apps/web-poc/index.html`
- Create: `packages/pet-protocol/package.json`
- Create: `packages/pet-renderer/package.json`
- Create: `packages/codex-pet-adapter/package.json`

- [ ] **Step 1: 创建根目录配置**

`package.json`:

```json
{
  "name": "ai-pets",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "pnpm --filter @ai-pets/web-poc dev",
    "build": "pnpm -r build",
    "typecheck": "pnpm -r typecheck",
    "import:yibao": "node scripts/import-yibao.mjs"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^5.0.0",
    "typescript": "^5.5.0",
    "vite": "^7.0.0"
  }
}
```

`pnpm-workspace.yaml`:

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

`tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx"
  }
}
```

`.gitignore`:

```gitignore
node_modules/
dist/
.vite/
*.log
```

- [ ] **Step 2: 创建 package manifests**

`apps/web-poc/package.json`:

```json
{
  "name": "@ai-pets/web-poc",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite --host 127.0.0.1",
    "build": "vite build",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@ai-pets/codex-pet-adapter": "workspace:*",
    "@ai-pets/pet-protocol": "workspace:*",
    "@ai-pets/pet-renderer": "workspace:*",
    "@vitejs/plugin-react": "^5.0.0",
    "vite": "^7.0.0",
    "typescript": "^5.5.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {}
}
```

Each package should use this shape with its own name:

```json
{
  "name": "@ai-pets/pet-protocol",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "main": "src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json --noEmit",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  }
}
```

Use package names `@ai-pets/pet-renderer` and `@ai-pets/codex-pet-adapter` for the other two package manifests.

- [ ] **Step 3: 创建 TypeScript package tsconfig**

Create `tsconfig.json` in each app/package directory:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src"]
}
```

For `apps/web-poc`, include Vite files:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src", "vite.config.ts"]
}
```

- [ ] **Step 4: 安装依赖**

Run:

```powershell
pnpm install
```

Expected: creates `pnpm-lock.yaml` and installs workspace dependencies.

- [ ] **Step 5: 提交初始化**

```powershell
git add .gitignore package.json pnpm-workspace.yaml tsconfig.base.json apps packages pnpm-lock.yaml
git commit -m "chore: scaffold AI-Pets monorepo"
```

## Task 2: 实现 AI Pet Protocol v0

**Files:**
- Create: `packages/pet-protocol/src/types.ts`
- Create: `packages/pet-protocol/src/validate.ts`
- Create: `packages/pet-protocol/src/index.ts`

- [ ] **Step 1: 定义协议类型**

`packages/pet-protocol/src/types.ts`:

```ts
export type SemanticRole =
  | "idle"
  | "moveRight"
  | "moveLeft"
  | "greet"
  | "jump"
  | "error"
  | "waiting"
  | "working"
  | "reviewing"
  | "thinking"
  | string;

export interface AtlasAsset {
  path: string;
  type: "spritesheet";
  cellWidth: number;
  cellHeight: number;
  columns: number;
  rows: number;
}

export interface AnimationDefinition {
  row: number;
  frames: number;
  fps: number;
}

export interface PetStateDefinition {
  label: string;
  animation: string;
  semanticRole?: SemanticRole;
  loop: boolean;
  custom?: boolean;
}

export interface PetInteraction {
  state?: string;
  semanticRole?: SemanticRole;
  say?: string;
}

export interface PetPackage {
  protocolVersion: string;
  petId: string;
  displayName: string;
  description: string;
  sourceFormat?: "ai-pet-protocol" | "codex-pet";
  assets: {
    atlas: AtlasAsset;
  };
  states: Record<string, PetStateDefinition>;
  animationSets: {
    default: {
      animations: Record<string, AnimationDefinition>;
    };
  };
  interactions: Record<string, PetInteraction>;
  capabilities: Record<string, boolean>;
  compatibility?: Record<string, unknown>;
}

export interface ValidationIssue {
  path: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}
```

- [ ] **Step 2: 实现协议校验**

`packages/pet-protocol/src/validate.ts`:

```ts
import type { PetPackage, ValidationIssue, ValidationResult } from "./types";

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function validatePetPackage(pkg: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (!isObject(pkg)) {
    return { ok: false, issues: [{ path: "$", message: "宠物包必须是对象。" }] };
  }

  const candidate = pkg as Partial<PetPackage>;
  if (candidate.protocolVersion !== "0.1.0") {
    issues.push({ path: "protocolVersion", message: "POC 仅支持 protocolVersion 0.1.0。" });
  }

  for (const field of ["petId", "displayName", "description"] as const) {
    if (typeof candidate[field] !== "string" || candidate[field]?.trim() === "") {
      issues.push({ path: field, message: `${field} 必须是非空字符串。` });
    }
  }

  const atlas = candidate.assets?.atlas;
  if (!atlas) {
    issues.push({ path: "assets.atlas", message: "必须声明 spritesheet atlas 资产。" });
  } else {
    if (typeof atlas.path !== "string" || atlas.path.trim() === "") {
      issues.push({ path: "assets.atlas.path", message: "atlas.path 必须是非空字符串。" });
    }
    for (const field of ["cellWidth", "cellHeight", "columns", "rows"] as const) {
      if (!Number.isInteger(atlas[field]) || atlas[field] <= 0) {
        issues.push({ path: `assets.atlas.${field}`, message: `${field} 必须是正整数。` });
      }
    }
  }

  const states = candidate.states;
  if (!states || Object.keys(states).length === 0) {
    issues.push({ path: "states", message: "宠物包必须至少声明一个可渲染状态。" });
  }

  const animations = candidate.animationSets?.default?.animations;
  if (!animations || Object.keys(animations).length === 0) {
    issues.push({ path: "animationSets.default.animations", message: "必须声明默认动画集合。" });
  }

  if (states && animations) {
    for (const [stateId, state] of Object.entries(states)) {
      if (!state.label) {
        issues.push({ path: `states.${stateId}.label`, message: "状态必须有中文 label。" });
      }
      if (!animations[state.animation]) {
        issues.push({
          path: `states.${stateId}.animation`,
          message: `状态引用的动画 ${state.animation} 不存在。`
        });
      }
    }
  }

  return { ok: issues.length === 0, issues };
}
```

- [ ] **Step 3: 导出公共 API**

`packages/pet-protocol/src/index.ts`:

```ts
export type {
  AnimationDefinition,
  AtlasAsset,
  PetInteraction,
  PetPackage,
  PetStateDefinition,
  SemanticRole,
  ValidationIssue,
  ValidationResult
} from "./types";
export { validatePetPackage } from "./validate";
```

- [ ] **Step 4: 运行类型检查**

Run:

```powershell
pnpm --filter @ai-pets/pet-protocol typecheck
```

Expected: exits with code 0.

- [ ] **Step 5: 提交协议包**

```powershell
git add packages/pet-protocol
git commit -m "feat: define AI Pet protocol v0"
```

## Task 3: 实现 Codex/yibao 兼容适配器

**Files:**
- Create: `packages/codex-pet-adapter/src/codexStates.ts`
- Create: `packages/codex-pet-adapter/src/index.ts`
- Create: `scripts/import-yibao.mjs`

- [ ] **Step 1: 定义 Codex 状态兼容表**

`packages/codex-pet-adapter/src/codexStates.ts`:

```ts
import type { PetStateDefinition } from "@ai-pets/pet-protocol";

export const CODEX_ANIMATION_ROWS: Record<string, { row: number; frames: number; fps: number }> = {
  idle: { row: 0, frames: 6, fps: 8 },
  "running-right": { row: 1, frames: 8, fps: 12 },
  "running-left": { row: 2, frames: 8, fps: 12 },
  waving: { row: 3, frames: 6, fps: 8 },
  jumping: { row: 4, frames: 8, fps: 12 },
  failed: { row: 5, frames: 6, fps: 8 },
  waiting: { row: 6, frames: 6, fps: 8 },
  running: { row: 7, frames: 8, fps: 12 },
  review: { row: 8, frames: 6, fps: 8 }
};

export const CODEX_STATE_PRESETS: Record<string, PetStateDefinition> = {
  idle: { label: "待机", animation: "idle", semanticRole: "idle", loop: true },
  "running-right": { label: "向右移动", animation: "running-right", semanticRole: "moveRight", loop: true },
  "running-left": { label: "向左移动", animation: "running-left", semanticRole: "moveLeft", loop: true },
  waving: { label: "打招呼", animation: "waving", semanticRole: "greet", loop: false },
  jumping: { label: "跳跃", animation: "jumping", semanticRole: "jump", loop: false },
  failed: { label: "失败", animation: "failed", semanticRole: "error", loop: false },
  waiting: { label: "等待输入", animation: "waiting", semanticRole: "waiting", loop: true },
  running: { label: "工作中", animation: "running", semanticRole: "working", loop: true },
  review: { label: "检查结果", animation: "review", semanticRole: "reviewing", loop: true }
};
```

- [ ] **Step 2: 实现适配函数**

`packages/codex-pet-adapter/src/index.ts`:

```ts
import type { PetPackage, PetStateDefinition } from "@ai-pets/pet-protocol";
import { validatePetPackage } from "@ai-pets/pet-protocol";
import { CODEX_ANIMATION_ROWS, CODEX_STATE_PRESETS } from "./codexStates";

export interface CodexPetManifest {
  id: string;
  displayName?: string;
  description?: string;
  spritesheetPath?: string;
  interactions?: string[];
  nicknameForUser?: string;
  style?: string;
}

const fallbackInteractions = Object.keys(CODEX_STATE_PRESETS);

export function adaptCodexPet(manifest: CodexPetManifest): PetPackage {
  const interactionIds = manifest.interactions?.length ? manifest.interactions : fallbackInteractions;
  const states: Record<string, PetStateDefinition> = {};

  for (const stateId of interactionIds) {
    const preset = CODEX_STATE_PRESETS[stateId];
    states[stateId] = preset ?? {
      label: stateId,
      animation: stateId,
      loop: true,
      custom: true
    };
  }

  const animations = Object.fromEntries(
    Object.entries(CODEX_ANIMATION_ROWS).filter(([animationId]) => states[animationId])
  );

  const pkg: PetPackage = {
    protocolVersion: "0.1.0",
    petId: manifest.id,
    displayName: manifest.displayName ?? manifest.id,
    description: manifest.description ?? "从 Codex 宠物包适配的 AI-Pets 宠物。",
    sourceFormat: "codex-pet",
    assets: {
      atlas: {
        path: manifest.spritesheetPath ?? "spritesheet.webp",
        type: "spritesheet",
        cellWidth: 192,
        cellHeight: 208,
        columns: 8,
        rows: 9
      }
    },
    states,
    animationSets: { default: { animations } },
    interactions: {
      click: { state: states.waving ? "waving" : interactionIds[0], say: "你好！" },
      aiWorking: { semanticRole: "working", say: "正在处理..." },
      aiNeedsInput: { semanticRole: "waiting", say: "需要你的确认。" },
      aiReview: { semanticRole: "reviewing", say: "正在检查结果。" },
      aiError: { semanticRole: "error", say: "出了点问题。" }
    },
    capabilities: {
      speechBubble: true,
      drag: true,
      stateMachine: true,
      externalEvents: true,
      customStates: true
    },
    compatibility: {
      codexPet: {
        supported: true,
        sourceInteractions: interactionIds
      }
    }
  };

  const result = validatePetPackage(pkg);
  if (!result.ok) {
    throw new Error(`Codex 宠物适配失败：${result.issues.map((issue) => issue.message).join("；")}`);
  }

  return pkg;
}
```

- [ ] **Step 3: 创建 yibao 导入脚本**

`scripts/import-yibao.mjs`:

```js
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = "C:\\Users\\collieZhou\\.codex\\pets\\yibao";
const target = join(root, "apps", "web-poc", "public", "pets", "yibao-codex");

await mkdir(target, { recursive: true });
await copyFile(join(source, "pet.json"), join(target, "pet.json"));
await copyFile(join(source, "spritesheet.webp"), join(target, "spritesheet.webp"));

const manifest = JSON.parse(await readFile(join(target, "pet.json"), "utf8"));
await writeFile(join(target, "source.json"), JSON.stringify({
  sourceType: "codex-pet",
  sourcePath: source,
  petJson: "pet.json"
}, null, 2));

console.log(`已导入 Codex 宠物 ${manifest.id} 到 ${target}`);
```

- [ ] **Step 4: 运行 yibao 导入**

Run:

```powershell
pnpm import:yibao
```

Expected: `apps/web-poc/public/pets/yibao-codex/pet.json` and `spritesheet.webp` exist.

- [ ] **Step 5: 运行类型检查并提交**

```powershell
pnpm --filter @ai-pets/codex-pet-adapter typecheck
git add packages/codex-pet-adapter scripts/import-yibao.mjs apps/web-poc/public/pets/yibao-codex
git commit -m "feat: adapt Codex pet packages"
```

## Task 4: 实现动态状态渲染器

**Files:**
- Create: `packages/pet-renderer/src/frameMath.ts`
- Create: `packages/pet-renderer/src/index.ts`

- [ ] **Step 1: 实现帧计算**

`packages/pet-renderer/src/frameMath.ts`:

```ts
import type { AnimationDefinition, AtlasAsset } from "@ai-pets/pet-protocol";

export interface SpriteFrame {
  x: number;
  y: number;
  width: number;
  height: number;
  frameIndex: number;
}

export function getFrameAtTime(
  atlas: AtlasAsset,
  animation: AnimationDefinition,
  elapsedMs: number
): SpriteFrame {
  const frameDuration = 1000 / animation.fps;
  const frameIndex = Math.floor(elapsedMs / frameDuration) % animation.frames;
  return {
    x: frameIndex * atlas.cellWidth,
    y: animation.row * atlas.cellHeight,
    width: atlas.cellWidth,
    height: atlas.cellHeight,
    frameIndex
  };
}
```

- [ ] **Step 2: 导出动态状态工具**

`packages/pet-renderer/src/index.ts`:

```ts
import type { PetPackage, PetStateDefinition } from "@ai-pets/pet-protocol";
import { getFrameAtTime, type SpriteFrame } from "./frameMath";

export interface RenderableState {
  id: string;
  label: string;
  semanticRole?: string;
  custom: boolean;
  state: PetStateDefinition;
}

export function listRenderableStates(pkg: PetPackage): RenderableState[] {
  return Object.entries(pkg.states)
    .filter(([, state]) => Boolean(pkg.animationSets.default.animations[state.animation]))
    .map(([id, state]) => ({
      id,
      label: state.label,
      semanticRole: state.semanticRole,
      custom: Boolean(state.custom),
      state
    }));
}

export function resolveInteractionState(pkg: PetPackage, interactionId: string): string | undefined {
  const interaction = pkg.interactions[interactionId];
  if (!interaction) return undefined;
  if (interaction.state && pkg.states[interaction.state]) return interaction.state;
  if (interaction.semanticRole) {
    return Object.entries(pkg.states).find(([, state]) => state.semanticRole === interaction.semanticRole)?.[0];
  }
  return undefined;
}

export function getCurrentFrame(pkg: PetPackage, stateId: string, elapsedMs: number): SpriteFrame {
  const state = pkg.states[stateId];
  const animation = pkg.animationSets.default.animations[state.animation];
  return getFrameAtTime(pkg.assets.atlas, animation, elapsedMs);
}

export { getFrameAtTime, type SpriteFrame };
```

- [ ] **Step 3: 运行类型检查并提交**

```powershell
pnpm --filter @ai-pets/pet-renderer typecheck
git add packages/pet-renderer
git commit -m "feat: render dynamic pet states"
```

## Task 5: 创建 Web POC 验证台

**Files:**
- Create: `apps/web-poc/src/main.tsx`
- Create: `apps/web-poc/src/App.tsx`
- Create: `apps/web-poc/src/petCatalog.ts`
- Create: `apps/web-poc/src/styles.css`
- Modify: `apps/web-poc/index.html`
- Create: `apps/web-poc/public/pets/example-buddy/manifest.json`
- Create: `apps/web-poc/public/pets/example-buddy/spritesheet.svg`

- [ ] **Step 1: 创建示例 AI Pet Protocol 包**

`apps/web-poc/public/pets/example-buddy/manifest.json`:

```json
{
  "protocolVersion": "0.1.0",
  "petId": "example-buddy",
  "displayName": "示例伙伴",
  "description": "用于验证 AI Pet Protocol 的简洁示例宠物，包含自定义 thinking 状态。",
  "sourceFormat": "ai-pet-protocol",
  "assets": {
    "atlas": {
      "path": "spritesheet.svg",
      "type": "spritesheet",
      "cellWidth": 192,
      "cellHeight": 208,
      "columns": 8,
      "rows": 4
    }
  },
  "states": {
    "idle": { "label": "待机", "animation": "idle", "semanticRole": "idle", "loop": true },
    "greet": { "label": "打招呼", "animation": "greet", "semanticRole": "greet", "loop": false },
    "working": { "label": "工作中", "animation": "working", "semanticRole": "working", "loop": true },
    "thinking": { "label": "思考中", "animation": "thinking", "semanticRole": "thinking", "loop": true, "custom": true }
  },
  "animationSets": {
    "default": {
      "animations": {
        "idle": { "row": 0, "frames": 8, "fps": 6 },
        "greet": { "row": 1, "frames": 8, "fps": 8 },
        "working": { "row": 2, "frames": 8, "fps": 10 },
        "thinking": { "row": 3, "frames": 8, "fps": 5 }
      }
    }
  },
  "interactions": {
    "click": { "state": "greet", "say": "你好，我是示例伙伴。" },
    "aiWorking": { "semanticRole": "working", "say": "正在处理任务..." },
    "aiThinking": { "state": "thinking", "say": "我想一想。" },
    "aiDone": { "state": "idle", "say": "完成啦。" }
  },
  "capabilities": {
    "speechBubble": true,
    "drag": true,
    "stateMachine": true,
    "externalEvents": true,
    "customStates": true
  },
  "compatibility": {
    "codexPet": { "supported": false }
  }
}
```

`apps/web-poc/public/pets/example-buddy/spritesheet.svg` should be a deterministic 1536x832 SVG sprite sheet. Use this exact structure and repeat the `<g>` cell pattern for each row/frame with different `cx`, `cy`, and fill values:

```xml
<svg xmlns="http://www.w3.org/2000/svg" width="1536" height="832" viewBox="0 0 1536 832">
  <rect width="1536" height="832" fill="transparent"/>
  <defs>
    <style>
      .body{stroke:#253047;stroke-width:6}
      .eye{fill:#253047}
    </style>
  </defs>
  <g transform="translate(0 0)"><circle class="body" cx="96" cy="104" r="58" fill="#8dd7ff"/><circle class="eye" cx="78" cy="92" r="6"/><circle class="eye" cx="114" cy="92" r="6"/></g>
  <g transform="translate(192 0)"><circle class="body" cx="96" cy="100" r="58" fill="#8dd7ff"/><circle class="eye" cx="78" cy="88" r="6"/><circle class="eye" cx="114" cy="88" r="6"/></g>
  <g transform="translate(384 0)"><circle class="body" cx="96" cy="104" r="58" fill="#8dd7ff"/><circle class="eye" cx="78" cy="92" r="6"/><circle class="eye" cx="114" cy="92" r="6"/></g>
  <g transform="translate(576 0)"><circle class="body" cx="96" cy="108" r="58" fill="#8dd7ff"/><circle class="eye" cx="78" cy="96" r="6"/><circle class="eye" cx="114" cy="96" r="6"/></g>
  <g transform="translate(768 0)"><circle class="body" cx="96" cy="104" r="58" fill="#8dd7ff"/><circle class="eye" cx="78" cy="92" r="6"/><circle class="eye" cx="114" cy="92" r="6"/></g>
  <g transform="translate(960 0)"><circle class="body" cx="96" cy="100" r="58" fill="#8dd7ff"/><circle class="eye" cx="78" cy="88" r="6"/><circle class="eye" cx="114" cy="88" r="6"/></g>
  <g transform="translate(1152 0)"><circle class="body" cx="96" cy="104" r="58" fill="#8dd7ff"/><circle class="eye" cx="78" cy="92" r="6"/><circle class="eye" cx="114" cy="92" r="6"/></g>
  <g transform="translate(1344 0)"><circle class="body" cx="96" cy="108" r="58" fill="#8dd7ff"/><circle class="eye" cx="78" cy="96" r="6"/><circle class="eye" cx="114" cy="96" r="6"/></g>
  <g transform="translate(0 208)"><circle class="body" cx="96" cy="104" r="58" fill="#ffd166"/><path d="M124 82 L154 58" stroke="#253047" stroke-width="8" stroke-linecap="round"/></g>
  <g transform="translate(192 208)"><circle class="body" cx="96" cy="104" r="58" fill="#ffd166"/><path d="M124 82 L160 72" stroke="#253047" stroke-width="8" stroke-linecap="round"/></g>
  <g transform="translate(384 208)"><circle class="body" cx="96" cy="104" r="58" fill="#ffd166"/><path d="M124 82 L154 58" stroke="#253047" stroke-width="8" stroke-linecap="round"/></g>
  <g transform="translate(576 208)"><circle class="body" cx="96" cy="104" r="58" fill="#ffd166"/><path d="M124 82 L160 72" stroke="#253047" stroke-width="8" stroke-linecap="round"/></g>
  <g transform="translate(768 208)"><circle class="body" cx="96" cy="104" r="58" fill="#ffd166"/><path d="M124 82 L154 58" stroke="#253047" stroke-width="8" stroke-linecap="round"/></g>
  <g transform="translate(960 208)"><circle class="body" cx="96" cy="104" r="58" fill="#ffd166"/><path d="M124 82 L160 72" stroke="#253047" stroke-width="8" stroke-linecap="round"/></g>
  <g transform="translate(1152 208)"><circle class="body" cx="96" cy="104" r="58" fill="#ffd166"/><path d="M124 82 L154 58" stroke="#253047" stroke-width="8" stroke-linecap="round"/></g>
  <g transform="translate(1344 208)"><circle class="body" cx="96" cy="104" r="58" fill="#ffd166"/><path d="M124 82 L160 72" stroke="#253047" stroke-width="8" stroke-linecap="round"/></g>
  <g transform="translate(0 416)"><rect class="body" x="48" y="48" width="96" height="112" rx="32" fill="#95f2c8"/></g>
  <g transform="translate(192 416)"><rect class="body" x="52" y="44" width="96" height="112" rx="32" fill="#95f2c8"/></g>
  <g transform="translate(384 416)"><rect class="body" x="56" y="48" width="96" height="112" rx="32" fill="#95f2c8"/></g>
  <g transform="translate(576 416)"><rect class="body" x="52" y="52" width="96" height="112" rx="32" fill="#95f2c8"/></g>
  <g transform="translate(768 416)"><rect class="body" x="48" y="48" width="96" height="112" rx="32" fill="#95f2c8"/></g>
  <g transform="translate(960 416)"><rect class="body" x="52" y="44" width="96" height="112" rx="32" fill="#95f2c8"/></g>
  <g transform="translate(1152 416)"><rect class="body" x="56" y="48" width="96" height="112" rx="32" fill="#95f2c8"/></g>
  <g transform="translate(1344 416)"><rect class="body" x="52" y="52" width="96" height="112" rx="32" fill="#95f2c8"/></g>
  <g transform="translate(0 624)"><circle class="body" cx="96" cy="104" r="54" fill="#cdb4ff"/><text x="96" y="122" text-anchor="middle" font-size="48" fill="#253047">?</text></g>
  <g transform="translate(192 624)"><circle class="body" cx="96" cy="104" r="54" fill="#cdb4ff"/><text x="96" y="122" text-anchor="middle" font-size="48" fill="#253047">?</text></g>
  <g transform="translate(384 624)"><circle class="body" cx="96" cy="104" r="54" fill="#cdb4ff"/><text x="96" y="122" text-anchor="middle" font-size="48" fill="#253047">?</text></g>
  <g transform="translate(576 624)"><circle class="body" cx="96" cy="104" r="54" fill="#cdb4ff"/><text x="96" y="122" text-anchor="middle" font-size="48" fill="#253047">?</text></g>
  <g transform="translate(768 624)"><circle class="body" cx="96" cy="104" r="54" fill="#cdb4ff"/><text x="96" y="122" text-anchor="middle" font-size="48" fill="#253047">?</text></g>
  <g transform="translate(960 624)"><circle class="body" cx="96" cy="104" r="54" fill="#cdb4ff"/><text x="96" y="122" text-anchor="middle" font-size="48" fill="#253047">?</text></g>
  <g transform="translate(1152 624)"><circle class="body" cx="96" cy="104" r="54" fill="#cdb4ff"/><text x="96" y="122" text-anchor="middle" font-size="48" fill="#253047">?</text></g>
  <g transform="translate(1344 624)"><circle class="body" cx="96" cy="104" r="54" fill="#cdb4ff"/><text x="96" y="122" text-anchor="middle" font-size="48" fill="#253047">?</text></g>
</svg>
```

- [ ] **Step 2: 创建宠物目录**

`apps/web-poc/src/petCatalog.ts`:

```ts
export type PetCatalogItem =
  | { id: string; label: string; sourceType: "ai-pet-protocol"; manifestUrl: string; assetBaseUrl: string }
  | { id: string; label: string; sourceType: "codex-pet"; manifestUrl: string; assetBaseUrl: string };

export const petCatalog: PetCatalogItem[] = [
  {
    id: "example-buddy",
    label: "示例伙伴（AI Pet Protocol）",
    sourceType: "ai-pet-protocol",
    manifestUrl: "/pets/example-buddy/manifest.json",
    assetBaseUrl: "/pets/example-buddy/"
  },
  {
    id: "yibao-codex",
    label: "怡宝（Codex 兼容）",
    sourceType: "codex-pet",
    manifestUrl: "/pets/yibao-codex/pet.json",
    assetBaseUrl: "/pets/yibao-codex/"
  }
];
```

- [ ] **Step 3: 实现 React 入口**

`apps/web-poc/src/main.tsx`:

```tsx
import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 4: 实现 App**

`apps/web-poc/src/App.tsx` must:

```tsx
import { useEffect, useMemo, useState } from "react";
import { adaptCodexPet } from "@ai-pets/codex-pet-adapter";
import { validatePetPackage, type PetPackage } from "@ai-pets/pet-protocol";
import { getCurrentFrame, listRenderableStates, resolveInteractionState } from "@ai-pets/pet-renderer";
import { petCatalog } from "./petCatalog";

type LoadState = "loading" | "ready" | "error";

export function App() {
  const [selectedId, setSelectedId] = useState(petCatalog[0]?.id ?? "");
  const [pkg, setPkg] = useState<PetPackage | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [error, setError] = useState("");
  const [activeState, setActiveState] = useState("");
  const [message, setMessage] = useState("你好，我是 AI 宠物。");
  const [elapsed, setElapsed] = useState(0);

  const selected = petCatalog.find((item) => item.id === selectedId);
  const states = useMemo(() => (pkg ? listRenderableStates(pkg) : []), [pkg]);
  const frame = pkg && activeState ? getCurrentFrame(pkg, activeState, elapsed) : null;

  useEffect(() => {
    let cancelled = false;
    async function loadPet() {
      if (!selected) return;
      setLoadState("loading");
      setError("");
      try {
        const raw = await fetch(selected.manifestUrl).then((response) => response.json());
        const nextPkg = selected.sourceType === "codex-pet" ? adaptCodexPet(raw) : raw;
        const result = validatePetPackage(nextPkg);
        if (!result.ok) throw new Error(result.issues.map((issue) => issue.message).join("；"));
        if (!cancelled) {
          setPkg(nextPkg);
          const firstState = listRenderableStates(nextPkg)[0]?.id ?? "";
          setActiveState(firstState);
          setLoadState("ready");
        }
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : String(caught));
          setLoadState("error");
        }
      }
    }
    loadPet();
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  useEffect(() => {
    const started = performance.now();
    let raf = 0;
    const tick = () => {
      setElapsed(performance.now() - started);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [activeState]);

  const trigger = (interactionId: string) => {
    if (!pkg) return;
    const nextState = resolveInteractionState(pkg, interactionId);
    if (nextState) setActiveState(nextState);
    const say = pkg.interactions[interactionId]?.say;
    if (say) setMessage(say);
  };

  return (
    <main className="app">
      <section className="stage">
        <div className="pet-shell">
          {loadState === "loading" && <p>正在加载宠物包...</p>}
          {loadState === "error" && <p className="error">加载失败：{error}</p>}
          {loadState === "ready" && pkg && frame && selected && (
            <>
              <div className="speech">{message}</div>
              <div
                className="sprite"
                style={{
                  width: pkg.assets.atlas.cellWidth,
                  height: pkg.assets.atlas.cellHeight,
                  backgroundImage: `url(${selected.assetBaseUrl}${pkg.assets.atlas.path})`,
                  backgroundPosition: `-${frame.x}px -${frame.y}px`
                }}
              />
            </>
          )}
        </div>
      </section>
      <aside className="panel">
        <label>
          宠物包
          <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
            {petCatalog.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <h2>动作状态</h2>
        <div className="button-grid">
          {states.map((state) => (
            <button key={state.id} onClick={() => setActiveState(state.id)}>
              {state.label}{state.custom ? "（自定义）" : ""}
            </button>
          ))}
        </div>
        <h2>模拟 AI 事件</h2>
        <div className="button-grid">
          {pkg && Object.keys(pkg.interactions).map((id) => (
            <button key={id} onClick={() => trigger(id)}>{id}</button>
          ))}
        </div>
        <label>
          气泡文本
          <input value={message} onChange={(event) => setMessage(event.target.value)} />
        </label>
        <pre>{JSON.stringify({ state: activeState, frame: frame?.frameIndex, source: pkg?.sourceFormat }, null, 2)}</pre>
      </aside>
    </main>
  );
}
```

- [ ] **Step 5: 实现 CSS**

`apps/web-poc/src/styles.css`:

```css
:root {
  color: #172033;
  background: #f5f7fb;
  font-family: "Microsoft YaHei", "PingFang SC", system-ui, sans-serif;
}

body {
  margin: 0;
}

button,
input,
select {
  font: inherit;
}

.app {
  min-height: 100vh;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 360px;
}

.stage {
  display: grid;
  place-items: center;
  padding: 32px;
  background: linear-gradient(180deg, #eef5ff, #f8fbff);
}

.pet-shell {
  min-width: 320px;
  min-height: 360px;
  display: grid;
  place-items: center;
  gap: 16px;
}

.speech {
  max-width: 320px;
  padding: 10px 14px;
  border: 1px solid #d8e1ef;
  border-radius: 8px;
  background: white;
  box-shadow: 0 8px 24px rgb(34 50 84 / 10%);
}

.sprite {
  background-repeat: no-repeat;
  image-rendering: auto;
  cursor: grab;
}

.panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 24px;
  border-left: 1px solid #d8e1ef;
  background: white;
  overflow: auto;
}

.panel label {
  display: grid;
  gap: 6px;
  font-weight: 600;
}

.panel select,
.panel input {
  padding: 8px 10px;
  border: 1px solid #ccd6e5;
  border-radius: 6px;
}

.panel h2 {
  margin: 4px 0 0;
  font-size: 16px;
}

.button-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.button-grid button {
  padding: 8px 10px;
  border: 1px solid #ccd6e5;
  border-radius: 6px;
  background: #f7faff;
  cursor: pointer;
}

.button-grid button:hover {
  background: #eaf2ff;
}

.error {
  color: #9b1c1c;
  background: #fff1f1;
  border: 1px solid #ffd1d1;
  padding: 12px;
  border-radius: 8px;
}

pre {
  white-space: pre-wrap;
  padding: 12px;
  border-radius: 8px;
  background: #101828;
  color: #e6edf8;
}
```

- [ ] **Step 6: 运行 Web POC**

Run:

```powershell
pnpm dev
```

Expected: Vite prints a local URL. Open it and manually verify `example-buddy` and `yibao-codex` load.

- [ ] **Step 7: 提交 Web POC**

```powershell
git add apps/web-poc
git commit -m "feat: add AI pet web POC"
```

## Task 6: 创建项目内 ai-pet-creator skill 和中文文档

**Files:**
- Create: `skills/ai-pet-creator/SKILL.md`
- Create: `docs/protocol/ai-pet-protocol-v0.md`
- Create: `docs/poc/web-poc.md`
- Create: `docs/adapters/codex-pet-compatibility.md`
- Create: `docs/skills/ai-pet-creator.md`
- Create: `docs/roadmap/mvp-desktop.md`
- Create: `docs/roadmap/hardware-product.md`

- [ ] **Step 1: 写项目内 skill**

`skills/ai-pet-creator/SKILL.md` must have YAML frontmatter:

```yaml
---
name: ai-pet-creator
description: Create AI-Pets protocol-compatible pet packages inside this project, including custom action states, Codex pet wrapping, manifest generation, and Web POC validation. Use when creating or adapting pets for AI-Pets.
---
```

The body must be Chinese and include:

- 先阅读 `docs/protocol/ai-pet-protocol-v0.md`。
- 默认输出到 `pets/examples/<pet-id>/`。
- 自定义动作状态需要状态 id、中文 label、animation id、row、frames、fps、loop、可选 semanticRole、默认触发事件和气泡文本。
- Codex 包适配时保留原文件，并创建 AI Pet Protocol manifest。
- 需要用 Web POC 验证状态按钮是否动态出现。

- [ ] **Step 2: 写中文协议文档**

`docs/protocol/ai-pet-protocol-v0.md` must document:

- `protocolVersion`
- `assets.atlas`
- `states`
- `semanticRole`
- `animationSets.default.animations`
- `interactions`
- `capabilities`
- `compatibility`
- 自定义状态示例
- Codex 9 状态只是兼容预设

- [ ] **Step 3: 写中文 POC 和适配器文档**

`docs/poc/web-poc.md` 写入这些固定章节：`环境准备`、`安装依赖`、`导入 yibao`、`启动 Web POC`、`界面控件说明`、`手动验证清单`。命令必须包含 `pnpm install`、`pnpm import:yibao`、`pnpm dev`。

`docs/adapters/codex-pet-compatibility.md` 写入这些固定章节：`验证宠物包`、`适配规则`、`interactions 优先级`、`Codex 9 状态回退`、`已知限制`。验证路径必须写明 `C:\Users\collieZhou\.codex\pets\yibao`。

- [ ] **Step 4: 写路线图文档**

`docs/roadmap/mvp-desktop.md` must describe Windows/macOS app direction, package import, transparent window, external AI event bridge.

`docs/roadmap/hardware-product.md` must describe display/runtime architecture, constrained renderer, sensors, LLM connection, OTA/content update strategy.

- [ ] **Step 5: 提交 skill 和文档**

```powershell
git add skills docs/protocol docs/poc docs/adapters docs/skills docs/roadmap
git commit -m "docs: add AI-Pets Chinese documentation and skill"
```

## Task 7: 创建 task.JSON 和最终验证

**Files:**
- Create: `task.JSON`

- [ ] **Step 1: 创建阶段任务文件**

`task.JSON` must be valid JSON with this content:

```json
{
  "project": "AI-Pets",
  "language": "zh-CN",
  "phases": [
    {
      "id": "poc",
      "title": "POC 验证阶段",
      "status": "in_progress",
      "tasks": [
        {
          "id": "poc-protocol-v0",
          "title": "定义 AI Pet Protocol v0",
          "status": "planned",
          "priority": "high",
          "dependencies": [],
          "deliverables": ["协议类型", "校验逻辑", "中文协议文档"],
          "acceptanceCriteria": ["支持自定义动作状态", "状态入口从宠物包动态生成"]
        },
        {
          "id": "poc-renderer",
          "title": "实现动态状态渲染器",
          "status": "planned",
          "priority": "high",
          "dependencies": ["poc-protocol-v0"],
          "deliverables": ["帧计算工具", "可渲染状态列表", "交互事件解析"],
          "acceptanceCriteria": ["渲染器不写死 Codex 9 状态", "可根据 manifest states 输出状态列表"]
        },
        {
          "id": "poc-codex-yibao-adapter",
          "title": "适配 Codex 宠物和 yibao 验证包",
          "status": "planned",
          "priority": "high",
          "dependencies": ["poc-protocol-v0"],
          "deliverables": ["Codex 状态映射", "yibao 导入脚本", "yibao 静态验证资源"],
          "acceptanceCriteria": ["优先读取 interactions 字段", "缺失 interactions 时回退 Codex 9 状态"]
        },
        {
          "id": "poc-web-playground",
          "title": "实现 Web POC 验证台",
          "status": "planned",
          "priority": "high",
          "dependencies": ["poc-protocol-v0", "poc-renderer", "poc-codex-yibao-adapter"],
          "deliverables": ["宠物包选择器", "动态状态按钮", "AI 事件按钮", "气泡文本", "调试面板"],
          "acceptanceCriteria": ["example-buddy 可加载", "yibao-codex 可加载", "自定义 thinking 状态可触发"]
        },
        {
          "id": "poc-skill-docs",
          "title": "创建项目内 skill 和中文文档",
          "status": "planned",
          "priority": "medium",
          "dependencies": ["poc-protocol-v0", "poc-web-playground"],
          "deliverables": ["skills/ai-pet-creator/SKILL.md", "协议文档", "POC 文档", "适配器文档", "路线图文档"],
          "acceptanceCriteria": ["skill 位于项目内", "中文文档解释自定义动作状态", "文档包含 yibao 验证方式"]
        },
        {
          "id": "poc-manual-verification",
          "title": "执行 POC 手动验证",
          "status": "planned",
          "priority": "medium",
          "dependencies": ["poc-web-playground", "poc-skill-docs"],
          "deliverables": ["类型检查结果", "构建结果", "Web POC 手动验证记录"],
          "acceptanceCriteria": ["pnpm typecheck 通过", "pnpm build 通过", "最终回复记录验证结果"]
        }
      ]
    },
    {
      "id": "mvp-desktop",
      "title": "桌面 MVP 阶段",
      "status": "planned",
      "tasks": [
        {
          "id": "mvp-desktop-shell",
          "title": "实现 Windows/macOS 独立桌面宠物壳",
          "status": "planned",
          "priority": "high",
          "dependencies": ["poc"],
          "deliverables": ["透明置顶窗口", "宠物包导入", "本地设置"],
          "acceptanceCriteria": ["桌面端消费 AI Pet Protocol 包", "不依赖 Web POC 内部实现"]
        },
        {
          "id": "mvp-ai-event-bridge",
          "title": "实现外部 AI 应用事件桥接",
          "status": "planned",
          "priority": "medium",
          "dependencies": ["mvp-desktop-shell"],
          "deliverables": ["本地事件 API", "状态触发协议", "气泡文本接口"],
          "acceptanceCriteria": ["外部应用能通过状态 id 或 semanticRole 驱动宠物"]
        }
      ]
    },
    {
      "id": "hardware-product",
      "title": "硬件产品阶段",
      "status": "planned",
      "tasks": [
        {
          "id": "hardware-runtime-architecture",
          "title": "设计硬件显示运行架构",
          "status": "planned",
          "priority": "medium",
          "dependencies": ["poc"],
          "deliverables": ["显示渲染方案", "受限设备资源格式", "输入传感器方案"],
          "acceptanceCriteria": ["硬件端保留 manifest 和状态语义", "明确 spritesheet 或编译资源格式取舍"]
        },
        {
          "id": "hardware-llm-connectivity",
          "title": "设计硬件大模型连接和内容更新方案",
          "status": "planned",
          "priority": "medium",
          "dependencies": ["hardware-runtime-architecture"],
          "deliverables": ["LLM 连接方案", "OTA 策略", "内容更新策略"],
          "acceptanceCriteria": ["支持语义化宠物事件", "说明离线和联网能力边界"]
        }
      ]
    }
  ]
}
```

- [ ] **Step 2: 运行静态验证**

Run:

```powershell
pnpm typecheck
pnpm build
node -e "JSON.parse(require('fs').readFileSync('task.JSON','utf8')); console.log('task.JSON ok')"
```

Expected:

- `pnpm typecheck` exits with code 0.
- `pnpm build` exits with code 0.
- JSON command prints `task.JSON ok`.

- [ ] **Step 3: 运行手动验证**

Run:

```powershell
pnpm import:yibao
pnpm dev
```

Manual checks:

- `example-buddy` loads.
- `example-buddy` shows a custom `thinking` state button.
- `yibao-codex` loads from copied Codex package assets.
- `yibao-codex` exposes states from `interactions`.
- AI event buttons change state and speech bubble.
- Debug panel shows current state, frame, source format.

- [ ] **Step 4: 提交 task.JSON 和验证修复**

```powershell
git add task.JSON package.json pnpm-lock.yaml apps packages scripts docs skills
git commit -m "chore: add AI-Pets roadmap tasks and verification"
```

## 自检清单

- [ ] Spec 要求“文档中文”：Task 6 覆盖。
- [ ] Spec 要求“自定义动作状态”：Task 2、Task 4、Task 5、Task 6、Task 7 覆盖。
- [ ] Spec 要求“根据宠物包状态动态暴露”：Task 4、Task 5 覆盖。
- [ ] Spec 要求“yibao 验证”：Task 3、Task 5、Task 7 覆盖。
- [ ] Spec 要求“skill 先放项目内”：Task 6 覆盖。
- [ ] Spec 要求“task.JSON”：Task 7 覆盖。
- [ ] Spec 要求“POC 可以不落测试”：计划使用 typecheck/build/manual verification，不引入完整测试框架。

## 执行建议

推荐按 Task 1 到 Task 7 顺序执行，每个 Task 完成后提交一次。若执行中发现 Vite/React 版本或 pnpm 环境与本机不兼容，只允许做最小依赖调整，并在提交信息或最终回复中说明。
