import type { AnimationDefinition, PetStateDefinition } from "@ai-pets/pet-protocol";

export const CODEX_ANIMATION_ROWS: Record<string, AnimationDefinition> = {
  idle: { row: 0, frames: 6, fps: 5 },
  "running-right": { row: 1, frames: 8, fps: 7 },
  "running-left": { row: 2, frames: 8, fps: 7 },
  waving: { row: 3, frames: 4, fps: 5 },
  jumping: { row: 4, frames: 5, fps: 7 },
  failed: { row: 5, frames: 8, fps: 5 },
  waiting: { row: 6, frames: 6, fps: 5 },
  running: { row: 7, frames: 6, fps: 5 },
  review: { row: 8, frames: 6, fps: 5 }
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
