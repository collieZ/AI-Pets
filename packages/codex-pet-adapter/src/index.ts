import type { AnimationDefinition, PetPackage, PetStateDefinition } from "@ai-pets/pet-protocol";
import { validatePetPackage } from "@ai-pets/pet-protocol";
import { CODEX_ANIMATION_ROWS, CODEX_STATE_PRESETS } from "./codexStates";

export interface CodexPetManifest {
  id: string;
  displayName?: string;
  description?: string;
  spritesheetPath?: string;
  interactions?: string[];
}

const fallbackInteractions = Object.keys(CODEX_STATE_PRESETS);

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function assertOptionalString(
  manifest: Record<string, unknown>,
  field: "displayName" | "description" | "spritesheetPath"
) {
  const value = manifest[field];
  if (value !== undefined && typeof value !== "string") {
    throw new Error(`Codex 宠物适配失败：${field} 存在时必须是字符串。`);
  }
}

function parseCodexPetManifest(rawManifest: unknown): CodexPetManifest {
  if (!isObject(rawManifest)) {
    throw new Error("Codex 宠物适配失败：manifest 必须是对象。");
  }

  if (typeof rawManifest.id !== "string" || rawManifest.id.trim() === "") {
    throw new Error("Codex 宠物适配失败：id 必须是非空字符串。");
  }

  assertOptionalString(rawManifest, "displayName");
  assertOptionalString(rawManifest, "description");
  assertOptionalString(rawManifest, "spritesheetPath");

  if (
    rawManifest.interactions !== undefined &&
    (!Array.isArray(rawManifest.interactions) ||
      !rawManifest.interactions.every((interaction) => typeof interaction === "string"))
  ) {
    throw new Error("Codex 宠物适配失败：interactions 存在时必须是字符串数组。");
  }

  const displayName = rawManifest.displayName as string | undefined;
  const description = rawManifest.description as string | undefined;
  const spritesheetPath = rawManifest.spritesheetPath as string | undefined;
  const interactions = rawManifest.interactions as string[] | undefined;

  return {
    id: rawManifest.id,
    displayName,
    description,
    spritesheetPath,
    interactions
  };
}

function buildRenderableStates(interactionIds: string[]) {
  const states: Record<string, PetStateDefinition> = {};
  const skippedStateIds: string[] = [];

  for (const stateId of interactionIds) {
    const preset = CODEX_STATE_PRESETS[stateId];
    if (preset) {
      states[stateId] = preset;
      continue;
    }

    if (CODEX_ANIMATION_ROWS[stateId]) {
      states[stateId] = {
        label: stateId,
        animation: stateId,
        loop: true,
        custom: true
      };
      continue;
    }

    skippedStateIds.push(stateId);
  }

  return { states, skippedStateIds };
}

function buildAnimations(states: Record<string, PetStateDefinition>) {
  const animations: Record<string, AnimationDefinition> = {};

  for (const state of Object.values(states)) {
    const animation = CODEX_ANIMATION_ROWS[state.animation];
    if (animation) {
      animations[state.animation] = animation;
    }
  }

  return animations;
}

export function adaptCodexPet(rawManifest: unknown): PetPackage {
  const manifest = parseCodexPetManifest(rawManifest);
  const interactionIds = manifest.interactions?.length ? manifest.interactions : fallbackInteractions;
  const { states, skippedStateIds } = buildRenderableStates(interactionIds);

  if (Object.keys(states).length === 0) {
    states.idle = CODEX_STATE_PRESETS.idle;
  }

  const animations = buildAnimations(states);

  const firstStateId = Object.keys(states)[0] ?? "idle";
  const clickState = states.waving ? "waving" : firstStateId;

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
      click: { state: clickState, say: "你好！" },
      aiWorking: { semanticRole: "working", say: "正在处理..." },
      aiNeedsInput: { semanticRole: "waiting", say: "需要你的确认。" },
      aiReview: { semanticRole: "reviewing", say: "正在检查结果。" },
      aiError: { semanticRole: "error", say: "出了一点问题。" }
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
        sourceInteractions: interactionIds,
        skippedStateIds
      }
    }
  };

  const result = validatePetPackage(pkg);
  if (!result.ok) {
    throw new Error(`Codex 宠物适配失败：${result.issues.map((issue) => issue.message).join("；")}`);
  }

  return pkg;
}

export { CODEX_ANIMATION_ROWS, CODEX_STATE_PRESETS } from "./codexStates";
