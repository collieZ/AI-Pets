export type KnownSemanticRole =
  | "idle"
  | "moveRight"
  | "moveLeft"
  | "greet"
  | "jump"
  | "error"
  | "waiting"
  | "working"
  | "reviewing"
  | "thinking";

export type SemanticRole = KnownSemanticRole | (string & {});

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
