import type { PetPackage } from "@ai-pets/pet-protocol";
import { listRenderableStates, resolveInteractionState } from "@ai-pets/pet-renderer";
import type { ExternalPetEvent } from "./desktopContracts";

export interface ResolvedExternalPetEvent {
  stateId?: string;
  say?: string;
  durationMs?: number;
}

export function resolveExternalPetEvent(
  pkg: PetPackage,
  event: ExternalPetEvent
): ResolvedExternalPetEvent {
  const interaction = event.interactionId ? pkg.interactions[event.interactionId] : undefined;
  const interactionState = event.interactionId
    ? resolveInteractionState(pkg, event.interactionId)
    : undefined;
  const renderableStates = listRenderableStates(pkg);
  const semanticState = event.semanticRole
    ? renderableStates.find((state) => state.semanticRole === event.semanticRole)
    : undefined;
  const directState = event.state
    ? renderableStates.find((state) => state.id === event.state)
    : undefined;

  return {
    stateId: (interactionState ?? semanticState ?? directState)?.id,
    say: event.say ?? interaction?.say,
    durationMs: event.durationMs
  };
}
