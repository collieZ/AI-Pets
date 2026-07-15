import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, rename, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createImportedPetTransaction,
  ImportedPetTransactionError,
  SimulatedProcessCrash
} from "../apps/desktop/electron/src/importedPets/transaction.ts";

async function createPet(root: string, petId: string, image = "first") {
  const folder = path.join(root, `${petId}-${Math.random()}`);
  await mkdir(folder, { recursive: true });
  await writeFile(path.join(folder, "spritesheet.webp"), image);
  await writeFile(path.join(folder, "manifest.json"), JSON.stringify({
    protocolVersion: "0.1.0",
    petId,
    displayName: petId,
    description: "test",
    assets: { atlas: { path: "spritesheet.webp", type: "spritesheet", cellWidth: 16, cellHeight: 16, columns: 1, rows: 1 } },
    states: { idle: { label: "待机", animation: "idle", loop: true } },
    animationSets: { default: { animations: { idle: { row: 0, frames: 1, fps: 4 } } } },
    interactions: {},
    capabilities: {}
  }));
  return folder;
}

async function tempRoot(prefix: string) {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

test("confirmed import consumes the immutable selection-time snapshot", async () => {
  const userDataPath = await tempRoot("ai-pets-transaction-");
  const sourceRoot = await tempRoot("ai-pets-source-");
  const source = await createPet(sourceRoot, "snapshot-pet", "snapshot content");
  const transaction = createImportedPetTransaction({ userDataPath });
  await transaction.initialize();

  const preview = await transaction.prepareImport(source);
  await writeFile(path.join(source, "spritesheet.webp"), "mutated source");
  const imported = await transaction.confirmImport(preview.token);

  assert.equal(imported.id, "snapshot-pet");
  assert.equal(await readFile(path.join(userDataPath, "imported-pets", "snapshot-pet", "spritesheet.webp"), "utf8"), "snapshot content");
});

test("failed overwrite restores the previous directory and index", async () => {
  const userDataPath = await tempRoot("ai-pets-transaction-");
  const sourceRoot = await tempRoot("ai-pets-source-");
  const first = await createPet(sourceRoot, "stable-pet", "old content");
  let failurePoint: string | undefined;
  const transaction = createImportedPetTransaction({
    userDataPath,
    faultInjector(point) {
      if (point === failurePoint) throw new Error(`injected failure at ${point}`);
    }
  });
  await transaction.initialize();
  await transaction.confirmImport((await transaction.prepareImport(first)).token);
  const replacement = await createPet(sourceRoot, "stable-pet", "new content");
  const preview = await transaction.prepareImport(replacement);
  failurePoint = "after-swap";

  await assert.rejects(
    () => transaction.confirmImport(preview.token),
    (error) => error instanceof ImportedPetTransactionError && error.reason === "transaction-failed"
  );
  assert.equal(await readFile(path.join(userDataPath, "imported-pets", "stable-pet", "spritesheet.webp"), "utf8"), "old content");
  assert.equal((await transaction.listPets()).length, 1);

  failurePoint = undefined;
  const beforeBackup = await createPet(sourceRoot, "stable-pet", "third content");
  const beforeBackupPreview = await transaction.prepareImport(beforeBackup);
  failurePoint = "after-record";
  await assert.rejects(() => transaction.confirmImport(beforeBackupPreview.token), /injected failure at after-record/);
  assert.equal(await readFile(path.join(userDataPath, "imported-pets", "stable-pet", "spritesheet.webp"), "utf8"), "old content");
  assert.deepEqual(await readdir(path.join(userDataPath, "imported-pets", ".snapshots")), []);
});

test("custom protocol authorizes only manifest and declared assets", async () => {
  const userDataPath = await tempRoot("ai-pets-transaction-");
  const sourceRoot = await tempRoot("ai-pets-source-");
  const source = await createPet(sourceRoot, "authorized-pet");
  await writeFile(path.join(source, "secret.txt"), "not declared");
  const transaction = createImportedPetTransaction({ userDataPath });
  await transaction.initialize();
  await transaction.confirmImport((await transaction.prepareImport(source)).token);

  const assetPath = await transaction.resolveAuthorizedAssetPath("ai-pets://imported-pets/authorized-pet/spritesheet.webp");
  assert.equal(path.basename(assetPath), "spritesheet.webp");
  await assert.rejects(
    () => transaction.resolveAuthorizedAssetPath("ai-pets://imported-pets/authorized-pet/secret.txt"),
    /未在 manifest 中声明/
  );
});

test("initialize rolls back an import interrupted by a process crash", async () => {
  const userDataPath = await tempRoot("ai-pets-recovery-");
  const sourceRoot = await tempRoot("ai-pets-source-");
  const source = await createPet(sourceRoot, "crashed-pet");
  const crashingTransaction = createImportedPetTransaction({
    userDataPath,
    faultInjector(point) {
      if (point === "after-swap") throw new SimulatedProcessCrash("simulated crash");
    }
  });
  await crashingTransaction.initialize();
  const preview = await crashingTransaction.prepareImport(source);
  await assert.rejects(() => crashingTransaction.confirmImport(preview.token), SimulatedProcessCrash);

  const restartedTransaction = createImportedPetTransaction({ userDataPath });
  const summary = await restartedTransaction.initialize();

  assert.equal(summary.recoveredTransaction, true);
  assert.deepEqual(await restartedTransaction.listPets(), []);
  await assert.rejects(() => readFile(path.join(userDataPath, "imported-pets", "crashed-pet", "manifest.json")), /ENOENT/);
});

test("library limit rejects a new id but still permits overwriting an existing id", async () => {
  const userDataPath = await tempRoot("ai-pets-limit-");
  const sourceRoot = await tempRoot("ai-pets-source-");
  const transaction = createImportedPetTransaction({ userDataPath });
  await transaction.initialize();
  for (let index = 0; index < 30; index += 1) {
    const source = await createPet(sourceRoot, `pet-${index}`);
    await transaction.confirmImport((await transaction.prepareImport(source)).token);
  }

  const extra = await createPet(sourceRoot, "pet-extra");
  await assert.rejects(
    async () => transaction.confirmImport((await transaction.prepareImport(extra)).token),
    (error) => error instanceof ImportedPetTransactionError && error.reason === "library-full"
  );
  const replacement = await createPet(sourceRoot, "pet-0", "replacement");
  await transaction.confirmImport((await transaction.prepareImport(replacement)).token);
  assert.equal((await transaction.listPets()).length, 30);
});

test("initialize migrates valid legacy pets and quarantines unsafe or orphaned folders", async () => {
  const userDataPath = await tempRoot("ai-pets-migration-");
  const sourceRoot = await tempRoot("ai-pets-source-");
  const importedRoot = path.join(userDataPath, "imported-pets");
  await mkdir(importedRoot, { recursive: true });
  await rename(await createPet(sourceRoot, "valid-legacy"), path.join(importedRoot, "valid-legacy"));
  await rename(await createPet(sourceRoot, "unsafe-legacy"), path.join(importedRoot, "unsafe-legacy"));
  await symlink(path.join(sourceRoot, "outside"), path.join(importedRoot, "unsafe-legacy", "linked-file"));
  await rename(await createPet(sourceRoot, "orphan-pet"), path.join(importedRoot, "orphan-pet"));
  await writeFile(path.join(importedRoot, "index.json"), JSON.stringify({
    version: 1,
    pets: [{ id: "valid-legacy" }, { id: "unsafe-legacy" }]
  }));
  const transaction = createImportedPetTransaction({ userDataPath, tokenFactory: () => Math.random().toString(36).slice(2) });

  const summary = await transaction.initialize();

  assert.equal(summary.migrated, true);
  assert.equal(summary.quarantinedPetIds.includes("unsafe-legacy"), true);
  assert.equal(summary.quarantinedPetIds.includes("orphan-pet"), true);
  assert.deepEqual((await transaction.listPets()).map((pet) => pet.id), ["valid-legacy"]);
});

test("prepareImport rejects unreferenced symlinks before creating a preview", async () => {
  const userDataPath = await tempRoot("ai-pets-symlink-");
  const sourceRoot = await tempRoot("ai-pets-source-");
  const source = await createPet(sourceRoot, "symlink-pet");
  await symlink(path.join(sourceRoot, "outside.txt"), path.join(source, "unused-link"));
  const transaction = createImportedPetTransaction({ userDataPath });
  await transaction.initialize();

  await assert.rejects(
    () => transaction.prepareImport(source),
    (error) => error instanceof ImportedPetTransactionError && error.reason === "unsafe-path"
  );
  assert.deepEqual(await transaction.listPets(), []);
});

test("failed deletion keeps the pet directory and catalog entry", async () => {
  const userDataPath = await tempRoot("ai-pets-delete-");
  const sourceRoot = await tempRoot("ai-pets-source-");
  let failurePoint: string | undefined;
  const transaction = createImportedPetTransaction({
    userDataPath,
    faultInjector(point) {
      if (point === failurePoint) throw new Error(`injected delete failure at ${point}`);
    }
  });
  await transaction.initialize();
  await transaction.confirmImport((await transaction.prepareImport(await createPet(sourceRoot, "kept-pet"))).token);
  failurePoint = "after-index";

  await assert.rejects(() => transaction.deleteImportedPet("kept-pet"), /injected delete failure/);
  assert.deepEqual((await transaction.listPets()).map((pet) => pet.id), ["kept-pet"]);
  assert.equal(await readFile(path.join(userDataPath, "imported-pets", "kept-pet", "spritesheet.webp"), "utf8"), "first");

  failurePoint = "after-record";
  await assert.rejects(() => transaction.deleteImportedPet("kept-pet"), /after-record/);
  assert.deepEqual((await transaction.listPets()).map((pet) => pet.id), ["kept-pet"]);
  assert.equal(await readFile(path.join(userDataPath, "imported-pets", "kept-pet", "spritesheet.webp"), "utf8"), "first");
});

test("pending snapshot expires and is removed without another user action", async () => {
  const userDataPath = await tempRoot("ai-pets-expiry-");
  const sourceRoot = await tempRoot("ai-pets-source-");
  const transaction = createImportedPetTransaction({ userDataPath, snapshotTtlMs: 10 });
  await transaction.initialize();
  const preview = await transaction.prepareImport(await createPet(sourceRoot, "expiring-pet"));
  await new Promise((resolve) => setTimeout(resolve, 30));

  await assert.rejects(
    () => transaction.confirmImport(preview.token),
    (error) => error instanceof ImportedPetTransactionError && error.reason === "preview-expired"
  );
  assert.deepEqual(await readdir(path.join(userDataPath, "imported-pets", ".snapshots")), []);
});

test("case-only pet id collision is rejected before touching the existing directory", async () => {
  const userDataPath = await tempRoot("ai-pets-case-");
  const sourceRoot = await tempRoot("ai-pets-source-");
  const transaction = createImportedPetTransaction({ userDataPath });
  await transaction.initialize();
  await transaction.confirmImport((await transaction.prepareImport(await createPet(sourceRoot, "Pet", "original"))).token);
  const collision = await transaction.prepareImport(await createPet(sourceRoot, "pet", "collision"));

  await assert.rejects(
    () => transaction.confirmImport(collision.token),
    (error) => error instanceof ImportedPetTransactionError && error.reason === "already-exists"
  );
  assert.equal(await readFile(path.join(userDataPath, "imported-pets", "Pet", "spritesheet.webp"), "utf8"), "original");
  assert.deepEqual((await transaction.listPets()).map((pet) => pet.id), ["Pet"]);
});

test("catalog and custom protocol preserve special characters in declared asset names", async () => {
  const userDataPath = await tempRoot("ai-pets-url-");
  const sourceRoot = await tempRoot("ai-pets-source-");
  const source = await createPet(sourceRoot, "url-pet");
  const manifestPath = path.join(source, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.assets.atlas.path = "sprites#1.webp";
  await rename(path.join(source, "spritesheet.webp"), path.join(source, "sprites#1.webp"));
  await writeFile(manifestPath, JSON.stringify(manifest));
  const transaction = createImportedPetTransaction({ userDataPath });
  await transaction.initialize();
  const imported = await transaction.confirmImport((await transaction.prepareImport(source)).token);

  assert.equal(imported.assetBaseUrl, "ai-pets://imported-pets/url-pet/");
  const assetPath = await transaction.resolveAuthorizedAssetPath("ai-pets://imported-pets/url-pet/sprites%231.webp");
  assert.equal(path.basename(assetPath), "sprites#1.webp");
});

test("migration preserves the original bytes of a corrupt legacy index", async () => {
  const userDataPath = await tempRoot("ai-pets-corrupt-index-");
  const importedRoot = path.join(userDataPath, "imported-pets");
  await mkdir(importedRoot, { recursive: true });
  await writeFile(path.join(importedRoot, "index.json"), "{broken legacy index");
  const transaction = createImportedPetTransaction({ userDataPath });

  const summary = await transaction.initialize();

  assert.equal(summary.migrated, true);
  assert.equal(await readFile(path.join(importedRoot, "index.json.v1.backup"), "utf8"), "{broken legacy index");
  assert.deepEqual(await transaction.listPets(), []);
});

test("rollback never deletes an unowned directory that appears before swap", async () => {
  const userDataPath = await tempRoot("ai-pets-unowned-");
  const sourceRoot = await tempRoot("ai-pets-source-");
  const destination = path.join(userDataPath, "imported-pets", "unowned-pet");
  const transaction = createImportedPetTransaction({
    userDataPath,
    async faultInjector(point) {
      if (point === "after-record") {
        await mkdir(destination, { recursive: true });
        await writeFile(path.join(destination, "unknown.txt"), "must survive");
        throw new Error("stop before swap");
      }
    }
  });
  await transaction.initialize();
  const preview = await transaction.prepareImport(await createPet(sourceRoot, "unowned-pet"));

  await assert.rejects(() => transaction.confirmImport(preview.token), /stop before swap/);
  assert.equal(await readFile(path.join(destination, "unknown.txt"), "utf8"), "must survive");
});
