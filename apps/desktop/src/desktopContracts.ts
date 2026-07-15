import type { PetCatalogItem } from "./petCatalog";

export type DesktopPlatform = "darwin" | "win32" | "linux";
export type SettingsWindowAction = "minimize" | "maximize" | "close";

export interface DesktopState {
  settingsOpen: boolean;
  petVisible: boolean;
  alwaysOnTop: boolean;
}

export interface DesktopPreferences {
  selectedPetId: string;
  playbackSpeed: number;
  petScale: number;
  petVisible: boolean;
  alwaysOnTop: boolean;
}

export interface ExternalPetEvent {
  type: "pet.event";
  interactionId?: string;
  state?: string;
  semanticRole?: string;
  say?: string;
  durationMs?: number;
  source?: string;
}

export interface ExternalAiBridgeStatus {
  running: boolean;
  host: string;
  port: number;
  endpoint: string;
  lastError?: string;
}

export type PetCommand =
  | { type: "selectPet"; selectedId: string }
  | { type: "state"; stateId: string }
  | { type: "interaction"; interactionId: string }
  | { type: "say"; message: string }
  | { type: "playbackSpeed"; value: number }
  | { type: "petScale"; value: number }
  | { type: "externalEvent"; event: ExternalPetEvent }
  | { type: "idle" };

export type ImportedPetErrorReason =
  | "invalid-package"
  | "unsafe-path"
  | "resource-limit"
  | "library-full"
  | "already-exists"
  | "preview-expired"
  | "transaction-failed"
  | "recovery-required";

export interface PetImportPreview {
  token: string;
  petId: string;
  label: string;
  sourceType: PetCatalogItem["sourceType"];
  manifestFileName: string;
  assetPath: string;
  actionCount: number;
  alreadyExists: boolean;
  expiresAt: string;
}

export type SelectImportPetFolderResult =
  | { ok: true; preview: PetImportPreview }
  | { ok: false; reason: "cancelled" | ImportedPetErrorReason; message?: string };

export type ImportPetFolderResult =
  | { ok: true; pet: PetCatalogItem }
  | { ok: false; reason: ImportedPetErrorReason; message: string };

export type DeleteImportedPetResult =
  | { ok: true; petId: string }
  | { ok: false; reason: "not-found" | "transaction-failed"; petId: string; message?: string };

export type OpenPetDataDirectoryResult = { ok: true } | { ok: false; message: string };

export interface RecoverySummary {
  recoveredTransaction: boolean;
  quarantinedPetIds: string[];
  migrated: boolean;
}

export interface DesktopApi {
  getWindowPosition(): Promise<{ x: number; y: number }>;
  moveWindow(position: { x: number; y: number }): Promise<void>;
  setSettingsOpen(open: boolean): Promise<void>;
  setPetVisible(visible: boolean): Promise<void>;
  setAlwaysOnTop(enabled: boolean): Promise<void>;
  getDesktopState(): Promise<DesktopState>;
  getPreferences(): Promise<DesktopPreferences>;
  resetPreferences(): Promise<DesktopPreferences>;
  dispatchPetCommand(command: PetCommand): Promise<void>;
  listImportedPets(): Promise<PetCatalogItem[]>;
  selectImportPetFolder(): Promise<SelectImportPetFolderResult>;
  confirmImportPetFolder(token: string): Promise<ImportPetFolderResult>;
  cancelImportPetFolder(token?: string): Promise<void>;
  deleteImportedPet(petId: string): Promise<DeleteImportedPetResult>;
  openPetDataDirectory(): Promise<OpenPetDataDirectoryResult>;
  openPetQuarantineDirectory(): Promise<OpenPetDataDirectoryResult>;
  getRecoverySummary(): Promise<RecoverySummary | null>;
  getExternalAiBridgeStatus(): Promise<ExternalAiBridgeStatus>;
  showContextMenu(): Promise<void>;
  invalidatePetWindow(): Promise<void>;
  getPlatform(): Promise<DesktopPlatform>;
  controlSettingsWindow(action: SettingsWindowAction): Promise<void>;
  onDesktopState(callback: (state: DesktopState) => void): () => void;
  onPetCommand(callback: (command: PetCommand) => void): () => void;
  onImportedPetsChanged(callback: () => void): () => void;
}

declare global {
  interface Window {
    aiPetsDesktop?: DesktopApi;
  }
}
