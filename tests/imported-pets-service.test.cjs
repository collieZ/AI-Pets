const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { createImportedPetStore, resolveImportedPetAssetPath } = require("../apps/desktop/electron/importedPets.cjs");

async function createTempUserData() {
  return fs.mkdtemp(path.join(os.tmpdir(), "ai-pets-import-test-"));
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function createProtocolPetFolder(root, petId = "forest-buddy") {
  const folder = path.join(root, petId);
  await writeJson(path.join(folder, "manifest.json"), {
    protocolVersion: "0.1.0",
    petId,
    displayName: "森林伙伴",
    description: "用于测试导入的宠物。",
    assets: {
      atlas: {
        path: "spritesheet.webp",
        type: "spritesheet",
        cellWidth: 192,
        cellHeight: 208,
        columns: 8,
        rows: 1
      }
    },
    states: {
      idle: { label: "待机", animation: "idle", loop: true }
    },
    animationSets: {
      default: {
        animations: {
          idle: { row: 0, frames: 1, fps: 4 }
        }
      }
    },
    interactions: {},
    capabilities: {}
  });
  await fs.writeFile(path.join(folder, "spritesheet.webp"), "fake image bytes");
  return folder;
}

test("imported pet store initializes an empty index", async () => {
  const userDataPath = await createTempUserData();
  const store = createImportedPetStore({ userDataPath });

  assert.deepEqual(await store.readIndex(), {
    version: 1,
    pets: []
  });
});

test("importPetFolder copies a protocol pet into user data and records catalog urls", async () => {
  const userDataPath = await createTempUserData();
  const sourceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ai-pets-source-"));
  const sourceFolder = await createProtocolPetFolder(sourceRoot);
  const store = createImportedPetStore({ userDataPath });

  const result = await store.importPetFolder(sourceFolder);

  assert.equal(result.ok, true);
  assert.equal(result.pet.id, "forest-buddy");
  assert.equal(result.pet.label, "森林伙伴");
  assert.equal(result.pet.sourceType, "ai-pet-protocol");
  assert.equal(result.pet.manifestUrl, "ai-pets://imported-pets/forest-buddy/manifest.json");
  assert.equal(result.pet.assetBaseUrl, "ai-pets://imported-pets/forest-buddy/");
  assert.equal(await fs.readFile(path.join(userDataPath, "imported-pets", "forest-buddy", "manifest.json"), "utf8").then(Boolean), true);
  assert.equal(await fs.readFile(path.join(userDataPath, "imported-pets", "forest-buddy", "spritesheet.webp"), "utf8"), "fake image bytes");

  const index = await store.readIndex();
  assert.equal(index.pets.length, 1);
  assert.equal(index.pets[0].id, "forest-buddy");
});

test("importPetFolder requires overwrite for an existing pet id", async () => {
  const userDataPath = await createTempUserData();
  const sourceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ai-pets-source-"));
  const firstFolder = await createProtocolPetFolder(path.join(sourceRoot, "first"), "forest-buddy");
  const secondFolder = await createProtocolPetFolder(path.join(sourceRoot, "second"), "forest-buddy");
  const store = createImportedPetStore({ userDataPath });

  await store.importPetFolder(firstFolder);
  const duplicate = await store.importPetFolder(secondFolder);

  assert.deepEqual(duplicate, {
    ok: false,
    reason: "already-exists",
    petId: "forest-buddy"
  });
});

test("importPetFolder overwrites an existing pet only after validation succeeds", async () => {
  const userDataPath = await createTempUserData();
  const sourceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ai-pets-source-"));
  const firstFolder = await createProtocolPetFolder(path.join(sourceRoot, "first"), "forest-buddy");
  const invalidFolder = path.join(sourceRoot, "invalid");
  await writeJson(path.join(invalidFolder, "manifest.json"), { petId: "forest-buddy" });
  const store = createImportedPetStore({ userDataPath });

  await store.importPetFolder(firstFolder);
  await assert.rejects(() => store.importPetFolder(invalidFolder, { overwrite: true }));

  assert.equal(
    await fs.readFile(path.join(userDataPath, "imported-pets", "forest-buddy", "spritesheet.webp"), "utf8"),
    "fake image bytes"
  );
});

test("resolveImportedPetAssetPath maps imported pet protocol urls inside the store root", async () => {
  const userDataPath = await createTempUserData();
  const store = createImportedPetStore({ userDataPath });

  assert.equal(
    resolveImportedPetAssetPath(store.getImportedPetsRoot(), "ai-pets://imported-pets/forest-buddy/spritesheet.webp"),
    path.join(userDataPath, "imported-pets", "forest-buddy", "spritesheet.webp")
  );
});

test("resolveImportedPetAssetPath rejects protocol urls outside imported pets", async () => {
  const userDataPath = await createTempUserData();
  const store = createImportedPetStore({ userDataPath });

  assert.throws(
    () => resolveImportedPetAssetPath(store.getImportedPetsRoot(), "ai-pets://imported-pets/forest-buddy/%252e%252e/secret.txt"),
    /不能访问导入宠物目录之外/
  );
});

test("resolveImportedPetAssetPath rejects unsupported protocol hosts", async () => {
  const userDataPath = await createTempUserData();
  const store = createImportedPetStore({ userDataPath });

  assert.throws(
    () => resolveImportedPetAssetPath(store.getImportedPetsRoot(), "ai-pets://bundle/forest-buddy/spritesheet.webp"),
    /不支持的 ai-pets 协议地址/
  );
});

test("deleteImportedPet removes the copied pet folder and index entry", async () => {
  const userDataPath = await createTempUserData();
  const sourceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ai-pets-source-"));
  const sourceFolder = await createProtocolPetFolder(sourceRoot);
  const store = createImportedPetStore({ userDataPath });

  await store.importPetFolder(sourceFolder);
  const result = await store.deleteImportedPet("forest-buddy");

  assert.deepEqual(result, { ok: true, petId: "forest-buddy" });
  assert.deepEqual(await store.readIndex(), {
    version: 1,
    pets: []
  });
  await assert.rejects(
    () => fs.access(path.join(userDataPath, "imported-pets", "forest-buddy")),
    /ENOENT/
  );
});
