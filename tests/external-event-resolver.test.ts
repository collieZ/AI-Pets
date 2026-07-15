import assert from "node:assert/strict";
import test from "node:test";
import type { PetPackage } from "../packages/pet-protocol/src/types.ts";
import { resolveExternalPetEvent } from "../apps/desktop/src/externalEventResolver.ts";

const petPackage: PetPackage = {
  protocolVersion: "1.0",
  petId: "test-pet",
  displayName: "测试宠物",
  description: "外部事件解析测试",
  assets: {
    atlas: { path: "pet.webp", type: "spritesheet", cellWidth: 100, cellHeight: 100, columns: 2, rows: 3 }
  },
  states: {
    idle: { label: "待机", animation: "idle", semanticRole: "idle", loop: true },
    busy: { label: "工作", animation: "busy", semanticRole: "working", loop: true },
    wave: { label: "打招呼", animation: "wave", semanticRole: "greet", loop: false }
  },
  animationSets: {
    default: {
      animations: {
        idle: { row: 0, frames: 2, fps: 5 },
        busy: { row: 1, frames: 2, fps: 5 },
        wave: { row: 2, frames: 2, fps: 5 }
      }
    }
  },
  interactions: {
    aiWorking: { semanticRole: "working", say: "正在工作" },
    hello: { state: "wave", say: "你好" }
  },
  capabilities: {}
};

test("interactionId takes priority and supplies its default speech", () => {
  assert.deepEqual(resolveExternalPetEvent(petPackage, {
    type: "pet.event",
    interactionId: "hello",
    state: "idle",
    semanticRole: "working",
    durationMs: 3000
  }), {
    stateId: "wave",
    say: "你好",
    durationMs: 3000
  });
});

test("event speech overrides interaction speech", () => {
  assert.deepEqual(resolveExternalPetEvent(petPackage, {
    type: "pet.event",
    interactionId: "aiWorking",
    say: "正在检查代码"
  }), {
    stateId: "busy",
    say: "正在检查代码",
    durationMs: undefined
  });
});

test("semantic role precedes direct state and unknown values degrade safely", () => {
  assert.equal(resolveExternalPetEvent(petPackage, {
    type: "pet.event",
    semanticRole: "working",
    state: "wave"
  }).stateId, "busy");
  assert.deepEqual(resolveExternalPetEvent(petPackage, {
    type: "pet.event",
    state: "missing",
    say: "只显示消息"
  }), {
    stateId: undefined,
    say: "只显示消息",
    durationMs: undefined
  });
});
