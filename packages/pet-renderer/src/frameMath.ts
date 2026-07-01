import type { AnimationDefinition, AtlasAsset } from "@ai-pets/pet-protocol";

export interface SpriteFrame {
  x: number;
  y: number;
  width: number;
  height: number;
  frameIndex: number;
}

export interface FramePlaybackOptions {
  loop?: boolean;
}

export function getAnimationDurationMs(animation: AnimationDefinition): number {
  if (!Number.isInteger(animation.frames) || animation.frames <= 0) {
    throw new Error(`无法计算动画时长：animation.frames 必须是正整数，当前值为 ${animation.frames}。`);
  }

  if (!Number.isFinite(animation.fps) || animation.fps <= 0) {
    throw new Error(`无法计算动画时长：animation.fps 必须是正有限数字，当前值为 ${animation.fps}。`);
  }

  return (animation.frames / animation.fps) * 1000;
}

export function getFrameAtTime(
  atlas: AtlasAsset,
  animation: AnimationDefinition,
  elapsedMs: number,
  options: FramePlaybackOptions = {}
): SpriteFrame {
  if (!Number.isInteger(animation.frames) || animation.frames <= 0) {
    throw new Error(`无法计算精灵帧：animation.frames 必须是正整数，当前值为 ${animation.frames}。`);
  }

  if (!Number.isFinite(animation.fps) || animation.fps <= 0) {
    throw new Error(`无法计算精灵帧：animation.fps 必须是正有限数字，当前值为 ${animation.fps}。`);
  }

  if (!Number.isFinite(elapsedMs)) {
    throw new Error(`无法计算精灵帧：elapsedMs 必须是有限数字，当前值为 ${elapsedMs}。`);
  }

  const safeElapsedMs = Math.max(0, elapsedMs);
  const frameDuration = 1000 / animation.fps;
  const rawFrameIndex = Math.floor(safeElapsedMs / frameDuration);
  const frameIndex =
    options.loop === false
      ? Math.min(animation.frames - 1, rawFrameIndex)
      : rawFrameIndex % animation.frames;

  return {
    x: frameIndex * atlas.cellWidth,
    y: animation.row * atlas.cellHeight,
    width: atlas.cellWidth,
    height: atlas.cellHeight,
    frameIndex
  };
}
