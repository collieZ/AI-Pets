import type { PetPackage, PetStateDefinition, SemanticRole } from "@ai-pets/pet-protocol";
import { getAnimationDurationMs, getFrameAtTime } from "./frameMath";
import type { SpriteFrame } from "./frameMath";

export interface RenderableState {
  id: string;
  label: string;
  semanticRole?: SemanticRole;
  custom: boolean;
  state: PetStateDefinition;
}

function getDefaultAnimations(pkg: PetPackage) {
  return pkg.animationSets?.default?.animations;
}

function toRenderableState(id: string, state: PetStateDefinition): RenderableState {
  return {
    id,
    label: state.label,
    semanticRole: state.semanticRole,
    custom: Boolean(state.custom),
    state
  };
}

export function listRenderableStates(pkg: PetPackage): RenderableState[] {
  const animations = getDefaultAnimations(pkg);

  if (!animations) {
    return [];
  }

  return Object.entries(pkg.states ?? {})
    .filter(([, state]) => Object.hasOwn(animations, state.animation))
    .map(([id, state]) => toRenderableState(id, state));
}

export function resolveInteractionState(
  pkg: PetPackage,
  interactionId: string
): RenderableState | undefined {
  const interaction = pkg.interactions?.[interactionId];

  if (!interaction) {
    return undefined;
  }

  const renderableStates = listRenderableStates(pkg);

  if (interaction.state) {
    const explicitState = renderableStates.find((state) => state.id === interaction.state);

    if (explicitState) {
      return explicitState;
    }
  }

  if (interaction.semanticRole) {
    return renderableStates.find((state) => state.semanticRole === interaction.semanticRole);
  }

  return undefined;
}

export function getCurrentFrame(pkg: PetPackage, stateId: string, elapsedMs: number): SpriteFrame {
  const state = pkg.states?.[stateId];

  if (!state) {
    throw new Error(`无法渲染状态：未找到状态 ${stateId}。`);
  }

  const animation = getDefaultAnimations(pkg)?.[state.animation];

  if (!animation) {
    throw new Error(`无法渲染状态：状态 ${stateId} 引用的动画 ${state.animation} 不存在。`);
  }

  return getFrameAtTime(pkg.assets.atlas, animation, elapsedMs, { loop: state.loop });
}

export { getAnimationDurationMs, getFrameAtTime };
export type { SpriteFrame };
