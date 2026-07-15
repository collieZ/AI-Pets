import assert from "node:assert/strict";
import test from "node:test";
import { CODEX_ANIMATION_ROWS } from "../packages/codex-pet-adapter/src/codexStates.js";
import { getAnimationDurationMs, getFrameAtTime } from "../packages/pet-renderer/src/frameMath.js";
import { validatePetPackage } from "../packages/pet-protocol/src/validate.js";

const atlas = {
  path: "spritesheet.webp",
  type: "spritesheet" as const,
  cellWidth: 192,
  cellHeight: 208,
  columns: 8,
  rows: 9
};

test("non-looping animations clamp to the final frame after one pass", () => {
  const frame = getFrameAtTime(atlas, { row: 3, frames: 4, fps: 2 }, 2_500, { loop: false });

  assert.equal(frame.frameIndex, 3);
  assert.equal(frame.x, 576);
  assert.equal(frame.y, 624);
});

test("animation duration is derived from frame count and fps", () => {
  assert.equal(getAnimationDurationMs({ row: 3, frames: 4, fps: 2 }), 2_000);
});

test("Codex preset avoids transparent tail frames in yibao-compatible rows", () => {
  assert.equal(CODEX_ANIMATION_ROWS.waving.frames, 4);
  assert.equal(CODEX_ANIMATION_ROWS.jumping.frames, 5);
  assert.equal(CODEX_ANIMATION_ROWS.running.frames, 6);
});

test("Codex preset uses a calmer default playback cadence", () => {
  assert.equal(CODEX_ANIMATION_ROWS.idle.fps, 5);
  assert.equal(CODEX_ANIMATION_ROWS["running-right"].fps, 7);
  assert.equal(CODEX_ANIMATION_ROWS.running.fps, 5);
});

test("pet package validation rejects unsafe assets and out-of-atlas animations", () => {
  const result = validatePetPackage({
    protocolVersion: "0.1.0",
    petId: "unsafe",
    displayName: "不安全宠物",
    description: "测试",
    assets: { atlas: { ...atlas, path: "../outside.webp", rows: 1 } },
    states: { idle: { label: "待机", animation: "idle", loop: true } },
    animationSets: { default: { animations: { idle: { row: 1, frames: 9, fps: 4 } } } },
    interactions: { click: { state: "missing" } },
    capabilities: { drag: "yes" }
  });

  assert.equal(result.ok, false);
  assert.equal(result.issues.some((issue) => issue.path === "assets.atlas.path"), true);
  assert.equal(result.issues.some((issue) => issue.path.endsWith(".row")), true);
  assert.equal(result.issues.some((issue) => issue.path.endsWith(".frames")), true);
  assert.equal(result.issues.some((issue) => issue.path === "interactions.click.state"), true);
  assert.equal(result.issues.some((issue) => issue.path === "capabilities.drag"), true);
});
