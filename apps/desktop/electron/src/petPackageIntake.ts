import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { adaptCodexPet } from "@ai-pets/codex-pet-adapter";
import { validatePetPackage, type PetPackage } from "@ai-pets/pet-protocol";

export type PetPackageSource = "ai-pet-protocol" | "codex-pet";

export interface PetPackageInspection {
  petId: string;
  label: string;
  sourceType: PetPackageSource;
  manifestFileName: "manifest.json" | "pet.json";
  assetPath: string;
  actionCount: number;
  canonicalPackage: PetPackage;
  declaredAssets: string[];
}

export class PetPackageIntakeError extends Error {
  readonly reason: "invalid-package" | "unsafe-path";

  constructor(reason: "invalid-package" | "unsafe-path", message: string) {
    super(message);
    this.name = "PetPackageIntakeError";
    this.reason = reason;
  }
}

const PET_ID_PATTERN = /^[a-zA-Z0-9._-]+$/;
const WINDOWS_RESERVED_NAME_PATTERN = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;
const RESERVED_PET_IDS = new Set(["index.json"]);

export function isSafePetId(petId: unknown): petId is string {
  return typeof petId === "string" && PET_ID_PATTERN.test(petId) && !petId.startsWith(".") && !petId.endsWith(".") && !RESERVED_PET_IDS.has(petId.toLowerCase()) && !WINDOWS_RESERVED_NAME_PATTERN.test(petId);
}

export function getPetIdKey(petId: string) {
  return petId.toLocaleLowerCase("en-US");
}

function assertSafePetId(petId: string) {
  if (!isSafePetId(petId)) {
    throw new PetPackageIntakeError("unsafe-path", "petId 不是安全的跨平台目录名称。");
  }
}

function normalizeAssetPath(assetPath: string) {
  const normalized = assetPath.replaceAll("\\", "/");
  if (
    path.posix.isAbsolute(normalized) ||
    normalized.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    throw new PetPackageIntakeError("unsafe-path", "宠物资源必须使用安全的相对路径。");
  }
  return normalized;
}

async function readJson(filePath: string) {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as unknown;
  } catch (error) {
    throw new PetPackageIntakeError(
      "invalid-package",
      `无法读取 ${path.basename(filePath)}：${error instanceof Error ? error.message : String(error)}`
    );
  }
}

async function findManifest(folderPath: string) {
  for (const manifestFileName of ["manifest.json", "pet.json"] as const) {
    const manifestPath = path.join(folderPath, manifestFileName);
    try {
      const manifestStat = await stat(manifestPath);
      if (manifestStat.isFile()) {
        return { manifestFileName, rawManifest: await readJson(manifestPath) };
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }
  throw new PetPackageIntakeError("invalid-package", "宠物包必须包含 manifest.json 或 pet.json。");
}

export async function inspectPetPackage(folderPath: string): Promise<PetPackageInspection> {
  const { manifestFileName, rawManifest } = await findManifest(folderPath);
  let canonicalPackage: PetPackage;
  let sourceType: PetPackageSource;

  try {
    canonicalPackage = manifestFileName === "pet.json" ? adaptCodexPet(rawManifest) : rawManifest as PetPackage;
    sourceType = manifestFileName === "pet.json" ? "codex-pet" : "ai-pet-protocol";
  } catch (error) {
    throw new PetPackageIntakeError(
      "invalid-package",
      error instanceof Error ? error.message : "宠物包格式无效。"
    );
  }

  const validation = validatePetPackage(canonicalPackage);
  if (!validation.ok) {
    throw new PetPackageIntakeError(
      "invalid-package",
      validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join("；")
    );
  }

  assertSafePetId(canonicalPackage.petId);
  const assetPath = normalizeAssetPath(canonicalPackage.assets.atlas.path);
  const assetFile = path.join(folderPath, ...assetPath.split("/"));
  const assetStat = await stat(assetFile).catch(() => undefined);
  if (!assetStat?.isFile() || assetStat.size === 0) {
    throw new PetPackageIntakeError("invalid-package", `宠物资源不存在或为空：${assetPath}`);
  }
  if (![".webp", ".png"].includes(path.extname(assetPath).toLowerCase())) {
    throw new PetPackageIntakeError("invalid-package", `雪碧图仅支持 WebP 或 PNG：${assetPath}`);
  }

  return {
    petId: canonicalPackage.petId,
    label: canonicalPackage.displayName,
    sourceType,
    manifestFileName,
    assetPath,
    actionCount: Object.keys(canonicalPackage.states).length,
    canonicalPackage,
    declaredAssets: [manifestFileName, assetPath]
  };
}
