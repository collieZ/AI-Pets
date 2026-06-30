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
