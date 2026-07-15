import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { getPetIdKey, isSafePetId, type PetPackageSource } from "../petPackageIntake.js";

export const IMPORTED_PET_INDEX_VERSION = 2;

export interface ImportedPetIdentity {
  id: string;
  label: string;
  sourceType: PetPackageSource;
  manifestFileName: "manifest.json" | "pet.json";
  declaredAssets: string[];
  importedAt: string;
  updatedAt: string;
}

export interface ImportedPetIndex {
  version: 2;
  pets: ImportedPetIdentity[];
}

export function emptyImportedPetIndex(): ImportedPetIndex {
  return { version: IMPORTED_PET_INDEX_VERSION, pets: [] };
}

export async function readImportedPetIndex(indexPath: string): Promise<ImportedPetIndex> {
  try {
    const raw = JSON.parse(await readFile(indexPath, "utf8")) as Partial<ImportedPetIndex>;
    if (raw.version !== IMPORTED_PET_INDEX_VERSION || !Array.isArray(raw.pets)) {
      return emptyImportedPetIndex();
    }
    const seenIds = new Set<string>();
    return {
      version: IMPORTED_PET_INDEX_VERSION,
      pets: raw.pets.filter((pet): pet is ImportedPetIdentity => {
        const identity = pet as ImportedPetIdentity;
        const valid =
        typeof pet === "object" && pet !== null &&
        isSafePetId(identity.id) && !seenIds.has(getPetIdKey(identity.id)) &&
        typeof identity.label === "string" &&
        ["ai-pet-protocol", "codex-pet"].includes(identity.sourceType) &&
        ["manifest.json", "pet.json"].includes(identity.manifestFileName) &&
        Array.isArray(identity.declaredAssets) && identity.declaredAssets.every((asset) => typeof asset === "string");
        if (valid) seenIds.add(getPetIdKey(identity.id));
        return valid;
      })
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return emptyImportedPetIndex();
    }
    throw error;
  }
}

export async function writeImportedPetIndex(indexPath: string, index: ImportedPetIndex) {
  await mkdir(path.dirname(indexPath), { recursive: true });
  const temporaryPath = `${indexPath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
  await rename(temporaryPath, indexPath);
}
