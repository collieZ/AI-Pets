const fs = require("node:fs/promises");
const path = require("node:path");

const INDEX_VERSION = 1;
const IMPORTED_PETS_DIR = "imported-pets";
const PET_ID_PATTERN = /^[a-zA-Z0-9._-]+$/;

function createEmptyIndex() {
  return {
    version: INDEX_VERSION,
    pets: []
  };
}

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

function assertSafePetId(petId) {
  if (!isNonEmptyString(petId) || !PET_ID_PATTERN.test(petId)) {
    throw new Error("petId 必须是非空 URL-safe 字符串，仅支持字母、数字、点、下划线和短横线。");
  }
}

function assertSafeRelativePath(relativePath, fieldName) {
  if (!isNonEmptyString(relativePath)) {
    throw new Error(`${fieldName} 必须是非空字符串。`);
  }

  const normalized = path.normalize(relativePath);
  if (path.isAbsolute(normalized) || normalized === ".." || normalized.startsWith(`..${path.sep}`)) {
    throw new Error(`${fieldName} 不能指向导入文件夹之外。`);
  }

  return normalized;
}

function assertPathInsideRoot(rootPath, candidatePath) {
  const relativePath = path.relative(rootPath, candidatePath);
  if (!relativePath || relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error("不能访问导入宠物目录之外的资源。");
  }
}

function resolveImportedPetAssetPath(importedPetsRoot, requestUrl) {
  const url = new URL(requestUrl);
  if (url.protocol !== "ai-pets:" || url.hostname !== IMPORTED_PETS_DIR) {
    throw new Error("不支持的 ai-pets 协议地址。");
  }

  const pathParts = url.pathname
    .split("/")
    .filter(Boolean)
    .map((part) => {
      const decodedPart = decodeURIComponent(part);
      if (/%2e|%2f|%5c/i.test(decodedPart)) {
        throw new Error("不能访问导入宠物目录之外的资源。");
      }
      return decodedPart;
    });
  const [petId, ...assetParts] = pathParts;
  assertSafePetId(petId);
  if (assetParts.length === 0) {
    throw new Error("ai-pets 协议地址必须包含资源路径。");
  }

  const safeAssetPath = assertSafeRelativePath(assetParts.join("/"), "asset path");
  const rootPath = path.resolve(importedPetsRoot);
  const resolvedPath = path.resolve(rootPath, petId, safeAssetPath);
  assertPathInsideRoot(rootPath, resolvedPath);
  return resolvedPath;
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJsonFile(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function findManifest(sourceFolder) {
  const protocolManifestPath = path.join(sourceFolder, "manifest.json");
  if (await pathExists(protocolManifestPath)) {
    return {
      manifestFileName: "manifest.json",
      rawManifest: await readJsonFile(protocolManifestPath),
      sourceType: "ai-pet-protocol"
    };
  }

  const codexManifestPath = path.join(sourceFolder, "pet.json");
  if (await pathExists(codexManifestPath)) {
    return {
      manifestFileName: "pet.json",
      rawManifest: await readJsonFile(codexManifestPath),
      sourceType: "codex-pet"
    };
  }

  throw new Error("导入文件夹必须包含 manifest.json 或 pet.json。");
}

function readProtocolPetManifest(rawManifest) {
  if (!isObject(rawManifest)) {
    throw new Error("manifest.json 必须是对象。");
  }

  if (rawManifest.protocolVersion !== "0.1.0") {
    throw new Error("protocolVersion 必须是 0.1.0。");
  }

  const petId = rawManifest.petId;
  assertSafePetId(petId);

  if (!isNonEmptyString(rawManifest.displayName)) {
    throw new Error("displayName 必须是非空字符串。");
  }

  const atlas = isObject(rawManifest.assets) ? rawManifest.assets.atlas : undefined;
  if (!isObject(atlas)) {
    throw new Error("assets.atlas 必须是对象。");
  }

  const assetPath = assertSafeRelativePath(atlas.path, "assets.atlas.path");

  return {
    petId,
    label: rawManifest.displayName,
    assetPath
  };
}

function readCodexPetManifest(rawManifest) {
  if (!isObject(rawManifest)) {
    throw new Error("pet.json 必须是对象。");
  }

  const petId = rawManifest.id;
  assertSafePetId(petId);

  if (rawManifest.displayName !== undefined && typeof rawManifest.displayName !== "string") {
    throw new Error("displayName 存在时必须是字符串。");
  }

  const assetPath = assertSafeRelativePath(rawManifest.spritesheetPath ?? "spritesheet.webp", "spritesheetPath");

  return {
    petId,
    label: rawManifest.displayName || petId,
    assetPath
  };
}

async function readImportCandidate(sourceFolder) {
  const { manifestFileName, rawManifest, sourceType } = await findManifest(sourceFolder);
  const normalized =
    sourceType === "ai-pet-protocol" ? readProtocolPetManifest(rawManifest) : readCodexPetManifest(rawManifest);
  const assetPath = path.join(sourceFolder, normalized.assetPath);
  if (!(await pathExists(assetPath))) {
    throw new Error(`宠物资源不存在：${normalized.assetPath}`);
  }

  return {
    petId: normalized.petId,
    label: normalized.label,
    sourceType,
    manifestFileName
  };
}

function toCatalogEntry(candidate, nowIso, existingEntry) {
  const petId = candidate.petId;
  return {
    id: petId,
    label: candidate.label,
    sourceType: candidate.sourceType,
    manifestUrl: `ai-pets://imported-pets/${encodeURIComponent(petId)}/${candidate.manifestFileName}`,
    assetBaseUrl: `ai-pets://imported-pets/${encodeURIComponent(petId)}/`,
    importedAt: existingEntry?.importedAt ?? nowIso,
    updatedAt: nowIso
  };
}

function normalizeIndex(rawIndex) {
  if (!isObject(rawIndex) || rawIndex.version !== INDEX_VERSION || !Array.isArray(rawIndex.pets)) {
    return createEmptyIndex();
  }

  return {
    version: INDEX_VERSION,
    pets: rawIndex.pets.filter((pet) => isObject(pet) && isNonEmptyString(pet.id))
  };
}

function createImportedPetStore({ userDataPath }) {
  if (!isNonEmptyString(userDataPath)) {
    throw new Error("userDataPath 必须是非空字符串。");
  }

  const importedPetsRoot = path.join(userDataPath, IMPORTED_PETS_DIR);
  const indexPath = path.join(importedPetsRoot, "index.json");

  async function readIndex() {
    try {
      return normalizeIndex(await readJsonFile(indexPath));
    } catch (error) {
      if (error && error.code === "ENOENT") {
        return createEmptyIndex();
      }
      throw error;
    }
  }

  async function writeIndex(index) {
    await fs.mkdir(importedPetsRoot, { recursive: true });
    const tempPath = `${indexPath}.tmp`;
    await fs.writeFile(tempPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
    await fs.rename(tempPath, indexPath);
  }

  async function importPetFolder(sourceFolder, options = {}) {
    const candidate = await readImportCandidate(sourceFolder);
    const index = await readIndex();
    const existingEntry = index.pets.find((pet) => pet.id === candidate.petId);
    if (existingEntry && !options.overwrite) {
      return {
        ok: false,
        reason: "already-exists",
        petId: candidate.petId
      };
    }

    await fs.mkdir(importedPetsRoot, { recursive: true });
    const destinationPath = path.join(importedPetsRoot, candidate.petId);
    const stagingPath = path.join(importedPetsRoot, `.importing-${candidate.petId}-${process.pid}-${Date.now()}`);

    try {
      await fs.rm(stagingPath, { recursive: true, force: true });
      await fs.cp(sourceFolder, stagingPath, { recursive: true });
      if (existingEntry) {
        await fs.rm(destinationPath, { recursive: true, force: true });
      }
      await fs.rename(stagingPath, destinationPath);
    } catch (error) {
      await fs.rm(stagingPath, { recursive: true, force: true });
      throw error;
    }

    const nowIso = new Date().toISOString();
    const pet = toCatalogEntry(candidate, nowIso, existingEntry);
    const nextPets = index.pets.filter((item) => item.id !== candidate.petId).concat(pet);
    await writeIndex({ version: INDEX_VERSION, pets: nextPets });

    return { ok: true, pet };
  }

  return {
    getImportedPetsRoot: () => importedPetsRoot,
    getIndexPath: () => indexPath,
    readIndex,
    writeIndex,
    importPetFolder
  };
}

module.exports = {
  createImportedPetStore,
  resolveImportedPetAssetPath
};
