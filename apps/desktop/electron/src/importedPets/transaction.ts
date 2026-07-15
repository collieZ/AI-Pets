import { randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, readdir, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { getPetIdKey, inspectPetPackage, isSafePetId, PetPackageIntakeError, type PetPackageInspection } from "../petPackageIntake.js";
import { assertImportFolderTreeSafe, copyImportFolderSnapshot, defaultImportResourceLimits, ImportResourceError, type ImportResourceLimits } from "./resourceBudget.js";
import {
  emptyImportedPetIndex,
  readImportedPetIndex,
  writeImportedPetIndex,
  type ImportedPetIdentity,
  type ImportedPetIndex
} from "./indexRepository.js";

const IMPORTED_PETS_DIR = "imported-pets";
const SNAPSHOTS_DIR = ".snapshots";
const BACKUPS_DIR = ".backups";
const QUARANTINE_DIR = "imported-pets-quarantine";
const TRANSACTION_FILE = ".transaction.json";
const TRANSACTION_MARKER_FILE = ".ai-pets-transaction";
const DEFAULT_SNAPSHOT_TTL_MS = 30 * 60 * 1000;
const MAX_IMPORTED_PETS = 30;

export type ImportedPetErrorReason =
  | "invalid-package"
  | "unsafe-path"
  | "resource-limit"
  | "library-full"
  | "already-exists"
  | "preview-expired"
  | "transaction-failed"
  | "recovery-required";

export class ImportedPetTransactionError extends Error {
  readonly reason: ImportedPetErrorReason;

  constructor(reason: ImportedPetErrorReason, message: string) {
    super(message);
    this.name = "ImportedPetTransactionError";
    this.reason = reason;
  }
}

export class SimulatedProcessCrash extends Error {}

export interface ImportedPetCatalogItem {
  id: string;
  label: string;
  sourceType: "ai-pet-protocol" | "codex-pet";
  manifestUrl: string;
  assetBaseUrl: string;
  importedAt: string;
  updatedAt: string;
}

export interface ImportPreview {
  token: string;
  petId: string;
  label: string;
  sourceType: "ai-pet-protocol" | "codex-pet";
  manifestFileName: string;
  assetPath: string;
  actionCount: number;
  alreadyExists: boolean;
  expiresAt: string;
}

interface PendingSnapshot {
  token: string;
  folderPath: string;
  inspection: PetPackageInspection;
  expiresAtMs: number;
}

interface TransactionRecord {
  operation: "import" | "delete";
  transactionId: string;
  petId: string;
  backupName: string;
  previousIndex: ImportedPetIndex;
}

export interface RecoverySummary {
  recoveredTransaction: boolean;
  quarantinedPetIds: string[];
  migrated: boolean;
}

export interface ImportedPetTransactionOptions {
  userDataPath: string;
  now?: () => number;
  tokenFactory?: () => string;
  snapshotTtlMs?: number;
  limits?: ImportResourceLimits;
  faultInjector?: (point: "after-record" | "after-backup" | "after-swap" | "after-index") => void | Promise<void>;
}

function catalogUrl(petId: string, asset = "") {
  const base = new URL(`ai-pets://${IMPORTED_PETS_DIR}/${encodeURIComponent(petId)}/`);
  const encodedAsset = asset.split("/").filter(Boolean).map(encodeURIComponent).join("/");
  return new URL(encodedAsset, base).toString();
}

function toCatalogItem(pet: ImportedPetIdentity): ImportedPetCatalogItem {
  return {
    id: pet.id,
    label: pet.label,
    sourceType: pet.sourceType,
    manifestUrl: catalogUrl(pet.id, pet.manifestFileName),
    assetBaseUrl: catalogUrl(pet.id),
    importedAt: pet.importedAt,
    updatedAt: pet.updatedAt
  };
}

function mapImportError(error: unknown): ImportedPetTransactionError {
  if (error instanceof ImportedPetTransactionError) return error;
  if (error instanceof PetPackageIntakeError) return new ImportedPetTransactionError(error.reason, error.message);
  if (error instanceof ImportResourceError) return new ImportedPetTransactionError(error.reason, error.message);
  return new ImportedPetTransactionError("transaction-failed", error instanceof Error ? error.message : String(error));
}

export function createImportedPetTransaction(options: ImportedPetTransactionOptions) {
  const now = options.now ?? Date.now;
  const tokenFactory = options.tokenFactory ?? randomUUID;
  const snapshotTtlMs = options.snapshotTtlMs ?? DEFAULT_SNAPSHOT_TTL_MS;
  const limits = options.limits ?? defaultImportResourceLimits;
  const root = path.join(options.userDataPath, IMPORTED_PETS_DIR);
  const snapshotsRoot = path.join(root, SNAPSHOTS_DIR);
  const backupsRoot = path.join(root, BACKUPS_DIR);
  const quarantineRoot = path.join(options.userDataPath, QUARANTINE_DIR);
  const indexPath = path.join(root, "index.json");
  const transactionPath = path.join(root, TRANSACTION_FILE);
  let pendingSnapshot: PendingSnapshot | undefined;
  let pendingSnapshotTimer: ReturnType<typeof setTimeout> | undefined;
  let mutationQueue = Promise.resolve();

  async function commitPoint(point: "after-record" | "after-backup" | "after-swap" | "after-index") {
    await options.faultInjector?.(point);
  }

  function serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = mutationQueue.then(operation, operation);
    mutationQueue = result.then(() => undefined, () => undefined);
    return result;
  }

  async function writeRecord(record: TransactionRecord) {
    await mkdir(root, { recursive: true });
    const temporaryPath = `${transactionPath}.${process.pid}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
    await rename(temporaryPath, transactionPath);
  }

  async function rollback(record: TransactionRecord) {
    if (
      !isSafePetId(record.petId) ||
      typeof record.transactionId !== "string" ||
      record.transactionId.length === 0 ||
      path.basename(record.backupName) !== record.backupName ||
      !record.backupName.startsWith(`${record.petId}-`)
    ) {
      throw new ImportedPetTransactionError("recovery-required", "事务记录包含不安全路径。");
    }
    const destinationPath = path.join(root, record.petId);
    const backupPath = path.join(backupsRoot, record.backupName);
    let backupExists = false;
    try {
      backupExists = (await lstat(backupPath)).isDirectory();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    if (backupExists) {
      await rm(destinationPath, { recursive: true, force: true });
      await rename(backupPath, destinationPath);
    } else if (record.operation === "import" && !record.previousIndex.pets.some((pet) => pet.id === record.petId)) {
      const marker = await readFile(path.join(destinationPath, TRANSACTION_MARKER_FILE), "utf8").catch(() => undefined);
      if (marker === record.transactionId) {
        await rm(destinationPath, { recursive: true, force: true });
      }
    }
    await writeImportedPetIndex(indexPath, record.previousIndex);
    await rm(transactionPath, { force: true });
  }

  async function cancelSnapshot(token?: string) {
    if (!pendingSnapshot || (token && pendingSnapshot.token !== token)) return;
    const snapshot = pendingSnapshot;
    pendingSnapshot = undefined;
    if (pendingSnapshotTimer) clearTimeout(pendingSnapshotTimer);
    pendingSnapshotTimer = undefined;
    await rm(snapshot.folderPath, { recursive: true, force: true });
  }

  async function cancelImport(token?: string) {
    return serialize(() => cancelSnapshot(token));
  }

  async function prepareImport(sourceFolder: string): Promise<ImportPreview> {
    return serialize(async () => {
    await cancelSnapshot();
    const token = tokenFactory();
    const folderPath = path.join(snapshotsRoot, token);
    try {
      await mkdir(snapshotsRoot, { recursive: true });
      await copyImportFolderSnapshot(sourceFolder, folderPath, limits);
      const inspection = await inspectPetPackage(folderPath);
      const index = await readImportedPetIndex(indexPath);
      const expiresAtMs = now() + snapshotTtlMs;
      pendingSnapshot = { token, folderPath, inspection, expiresAtMs };
      pendingSnapshotTimer = setTimeout(() => void cancelImport(token), snapshotTtlMs);
      pendingSnapshotTimer.unref?.();
      return {
        token,
        petId: inspection.petId,
        label: inspection.label,
        sourceType: inspection.sourceType,
        manifestFileName: inspection.manifestFileName,
        assetPath: inspection.assetPath,
        actionCount: inspection.actionCount,
        alreadyExists: index.pets.some((pet) => pet.id === inspection.petId),
        expiresAt: new Date(expiresAtMs).toISOString()
      };
    } catch (error) {
      await rm(folderPath, { recursive: true, force: true });
      throw mapImportError(error);
    }
    });
  }

  async function confirmImport(token: string) {
    return serialize(async () => {
      const snapshot = pendingSnapshot;
      if (!snapshot || snapshot.token !== token || snapshot.expiresAtMs <= now()) {
        await cancelSnapshot(token);
        throw new ImportedPetTransactionError("preview-expired", "导入预览已失效，请重新选择宠物包。");
      }
      const index = await readImportedPetIndex(indexPath);
      const candidateKey = getPetIdKey(snapshot.inspection.petId);
      const existing = index.pets.find((pet) => getPetIdKey(pet.id) === candidateKey);
      if (existing && existing.id !== snapshot.inspection.petId) {
        throw new ImportedPetTransactionError("already-exists", `petId 与已有宠物仅大小写不同：${existing.id}`);
      }
      if (!existing && index.pets.length >= MAX_IMPORTED_PETS) {
        throw new ImportedPetTransactionError("library-full", `最多只能导入 ${MAX_IMPORTED_PETS} 个宠物。`);
      }
      const destinationPath = path.join(root, snapshot.inspection.petId);
      const backupPath = path.join(backupsRoot, `${snapshot.inspection.petId}-${token}`);
      const record: TransactionRecord = {
        operation: "import",
        transactionId: token,
        petId: snapshot.inspection.petId,
        backupName: path.basename(backupPath),
        previousIndex: index
      };
      try {
        await mkdir(backupsRoot, { recursive: true });
        await writeFile(path.join(snapshot.folderPath, TRANSACTION_MARKER_FILE), token, "utf8");
        await writeRecord(record);
        await commitPoint("after-record");
        if (existing) await rename(destinationPath, backupPath);
        await commitPoint("after-backup");
        await rename(snapshot.folderPath, destinationPath);
        pendingSnapshot = undefined;
        if (pendingSnapshotTimer) clearTimeout(pendingSnapshotTimer);
        pendingSnapshotTimer = undefined;
        await commitPoint("after-swap");
        const timestamp = new Date(now()).toISOString();
        const identity: ImportedPetIdentity = {
          id: snapshot.inspection.petId,
          label: snapshot.inspection.label,
          sourceType: snapshot.inspection.sourceType,
          manifestFileName: snapshot.inspection.manifestFileName,
          declaredAssets: snapshot.inspection.declaredAssets,
          importedAt: existing?.importedAt ?? timestamp,
          updatedAt: timestamp
        };
        const nextIndex: ImportedPetIndex = {
          version: 2,
          pets: index.pets.filter((pet) => pet.id !== identity.id).concat(identity)
        };
        await writeImportedPetIndex(indexPath, nextIndex);
        await commitPoint("after-index");
        await rm(path.join(destinationPath, TRANSACTION_MARKER_FILE), { force: true });
        await rm(transactionPath, { force: true });
        await rm(backupPath, { recursive: true, force: true }).catch(() => undefined);
        return toCatalogItem(identity);
      } catch (error) {
        if (error instanceof SimulatedProcessCrash) throw error;
        await rollback(record);
        pendingSnapshot = undefined;
        if (pendingSnapshotTimer) clearTimeout(pendingSnapshotTimer);
        pendingSnapshotTimer = undefined;
        await rm(snapshot.folderPath, { recursive: true, force: true });
        throw mapImportError(error);
      }
    });
  }

  async function deleteImportedPet(petId: string) {
    return serialize(async () => {
      const index = await readImportedPetIndex(indexPath);
      const existing = index.pets.find((pet) => pet.id === petId);
      if (!existing) return { ok: false as const, reason: "not-found" as const, petId };
      const destinationPath = path.join(root, petId);
      const backupPath = path.join(backupsRoot, `${petId}-${tokenFactory()}`);
      const record: TransactionRecord = { operation: "delete", transactionId: path.basename(backupPath), petId, backupName: path.basename(backupPath), previousIndex: index };
      try {
        await mkdir(backupsRoot, { recursive: true });
        await writeRecord(record);
        await commitPoint("after-record");
        await rename(destinationPath, backupPath);
        await commitPoint("after-backup");
        await writeImportedPetIndex(indexPath, { version: 2, pets: index.pets.filter((pet) => pet.id !== petId) });
        await commitPoint("after-index");
        await rm(transactionPath, { force: true });
        await rm(backupPath, { recursive: true, force: true }).catch(() => undefined);
        return { ok: true as const, petId };
      } catch (error) {
        if (error instanceof SimulatedProcessCrash) throw error;
        await rollback(record);
        throw mapImportError(error);
      }
    });
  }

  async function recoverPendingTransaction() {
    try {
      const record = JSON.parse(await readFile(transactionPath, "utf8")) as TransactionRecord;
      await rollback(record);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      await mkdir(quarantineRoot, { recursive: true });
      await rename(transactionPath, path.join(quarantineRoot, `transaction-record-${now()}.json`)).catch(() => undefined);
      for (const entry of await readdir(backupsRoot, { withFileTypes: true }).catch(() => [])) {
        await rename(path.join(backupsRoot, entry.name), path.join(quarantineRoot, `backup-${entry.name}-${now()}`)).catch(() => undefined);
      }
      return true;
    }
  }

  async function migrateLegacyIndex(): Promise<Pick<RecoverySummary, "migrated" | "quarantinedPetIds">> {
    let raw: unknown;
    let rawText: string;
    try {
      rawText = await readFile(indexPath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { migrated: false, quarantinedPetIds: [] };
      throw error;
    }
    try {
      raw = JSON.parse(rawText);
    } catch {
      raw = undefined;
    }
    if ((raw as { version?: unknown } | undefined)?.version === 2) return { migrated: false, quarantinedPetIds: [] };
    const legacyPets = Array.isArray((raw as { pets?: unknown } | undefined)?.pets)
      ? (raw as { pets: Array<{ id?: unknown; importedAt?: unknown }> }).pets
      : [];
    await mkdir(quarantineRoot, { recursive: true });
    await writeFile(`${indexPath}.v1.backup`, rawText, { flag: "wx" }).catch(() => undefined);
    const pets: ImportedPetIdentity[] = [];
    const migratedIds = new Set<string>();
    const quarantinedPetIds: string[] = [];
    for (const legacy of legacyPets) {
      if (!isSafePetId(legacy.id)) {
        if (typeof legacy.id === "string") quarantinedPetIds.push(legacy.id);
        continue;
      }
      const legacyKey = getPetIdKey(legacy.id);
      if (migratedIds.has(legacyKey)) continue;
      const folderPath = path.join(root, legacy.id);
      try {
        if (pets.length >= MAX_IMPORTED_PETS) throw new Error("宠物库数量超限。");
        await assertImportFolderTreeSafe(folderPath, limits);
        const inspection = await inspectPetPackage(folderPath);
        if (inspection.petId !== legacy.id) throw new Error("目录与 manifest 的 petId 不一致。");
        const timestamp = typeof legacy.importedAt === "string" ? legacy.importedAt : new Date(now()).toISOString();
        pets.push({
          id: inspection.petId,
          label: inspection.label,
          sourceType: inspection.sourceType,
          manifestFileName: inspection.manifestFileName,
          declaredAssets: inspection.declaredAssets,
          importedAt: timestamp,
          updatedAt: timestamp
        });
        migratedIds.add(legacyKey);
      } catch {
        quarantinedPetIds.push(legacy.id);
        await rename(folderPath, path.join(quarantineRoot, `${legacy.id}-${now()}`)).catch(() => undefined);
      }
    }
    await writeImportedPetIndex(indexPath, { version: 2, pets });
    return { migrated: true, quarantinedPetIds };
  }

  async function moveToQuarantine(petId: string, folderPath: string) {
    await mkdir(quarantineRoot, { recursive: true });
    await rename(folderPath, path.join(quarantineRoot, `${petId}-${now()}-${tokenFactory()}`));
  }

  async function reconcileImportedPets() {
    const index = await readImportedPetIndex(indexPath);
    const validPets: ImportedPetIdentity[] = [];
    const quarantinedPetIds: string[] = [];
    for (const identity of index.pets) {
      const folderPath = path.join(root, identity.id);
      try {
        if (validPets.length >= MAX_IMPORTED_PETS) throw new Error("宠物库数量超限。");
        await assertImportFolderTreeSafe(folderPath, limits);
        const inspection = await inspectPetPackage(folderPath);
        if (inspection.petId !== identity.id) throw new Error("目录与 manifest 的 petId 不一致。");
        validPets.push({
          ...identity,
          label: inspection.label,
          sourceType: inspection.sourceType,
          manifestFileName: inspection.manifestFileName,
          declaredAssets: inspection.declaredAssets
        });
      } catch {
        quarantinedPetIds.push(identity.id);
        await moveToQuarantine(identity.id, folderPath).catch(() => undefined);
      }
    }
    const knownIds = new Set(validPets.map((pet) => pet.id));
    for (const entry of await readdir(root, { withFileTypes: true })) {
      if (!entry.isDirectory() || [SNAPSHOTS_DIR, BACKUPS_DIR].includes(entry.name) || knownIds.has(entry.name)) continue;
      quarantinedPetIds.push(entry.name);
      await moveToQuarantine(entry.name, path.join(root, entry.name));
    }
    if (validPets.length !== index.pets.length || quarantinedPetIds.length > 0) {
      await writeImportedPetIndex(indexPath, { version: 2, pets: validPets });
    }
    return quarantinedPetIds;
  }

  async function initialize(): Promise<RecoverySummary> {
    await mkdir(root, { recursive: true });
    const recoveredTransaction = await recoverPendingTransaction();
    const migration = await migrateLegacyIndex();
    const reconciledQuarantine = await reconcileImportedPets();
    await rm(snapshotsRoot, { recursive: true, force: true });
    await mkdir(snapshotsRoot, { recursive: true });
    await mkdir(backupsRoot, { recursive: true });
    return {
      recoveredTransaction,
      migrated: migration.migrated,
      quarantinedPetIds: [...new Set([...migration.quarantinedPetIds, ...reconciledQuarantine])]
    };
  }

  async function listPets() {
    return (await readImportedPetIndex(indexPath)).pets.map(toCatalogItem);
  }

  async function resolveAuthorizedAssetPath(requestUrl: string) {
    const url = new URL(requestUrl);
    if (url.protocol !== "ai-pets:" || url.hostname !== IMPORTED_PETS_DIR) {
      throw new ImportedPetTransactionError("unsafe-path", "不支持的宠物资源地址。");
    }
    const segments = url.pathname.split("/").filter(Boolean).map((segment) => decodeURIComponent(segment));
    const [petId, ...assetSegments] = segments;
    if (!petId || assetSegments.length === 0 || assetSegments.some((segment) => segment === "." || segment === ".." || segment.includes("/") || segment.includes("\\"))) {
      throw new ImportedPetTransactionError("unsafe-path", "宠物资源路径不安全。");
    }
    const assetPath = assetSegments.join("/");
    const identity = (await readImportedPetIndex(indexPath)).pets.find((pet) => pet.id === petId);
    if (!identity?.declaredAssets.includes(assetPath)) {
      throw new ImportedPetTransactionError("unsafe-path", "宠物资源未在 manifest 中声明。");
    }
    const petRoot = path.join(root, petId);
    const candidate = path.join(petRoot, ...assetSegments);
    const [realPetRoot, realCandidate] = await Promise.all([realpath(petRoot), realpath(candidate)]);
    const relativePath = path.relative(realPetRoot, realCandidate);
    if (path.isAbsolute(relativePath) || relativePath.startsWith("..") || !(await lstat(realCandidate)).isFile()) {
      throw new ImportedPetTransactionError("unsafe-path", "宠物资源越出管理目录。");
    }
    return realCandidate;
  }

  return {
    initialize,
    prepareImport,
    confirmImport,
    cancelImport,
    deleteImportedPet,
    listPets,
    resolveAuthorizedAssetPath,
    getImportedPetsRoot: () => root,
    getQuarantineRoot: () => quarantineRoot
  };
}
