import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { inspectPetPackage, PetPackageIntakeError } from "../apps/desktop/electron/src/petPackageIntake.ts";

async function tempFolder() {
  return mkdtemp(path.join(os.tmpdir(), "ai-pets-intake-"));
}

test("inspectPetPackage canonicalizes AI-Pets and Codex packages through one interface", async () => {
  const root = await tempFolder();
  const protocolFolder = path.join(root, "protocol");
  const codexFolder = path.join(root, "codex");
  await mkdir(protocolFolder);
  await mkdir(codexFolder);
  await writeFile(path.join(protocolFolder, "spritesheet.webp"), "image");
  await writeFile(path.join(codexFolder, "spritesheet.webp"), "image");
  await writeFile(path.join(protocolFolder, "manifest.json"), JSON.stringify({
    protocolVersion: "0.1.0",
    petId: "protocol-pet",
    displayName: "协议宠物",
    description: "test",
    assets: { atlas: { path: "spritesheet.webp", type: "spritesheet", cellWidth: 192, cellHeight: 208, columns: 8, rows: 1 } },
    states: { idle: { label: "待机", animation: "idle", loop: true } },
    animationSets: { default: { animations: { idle: { row: 0, frames: 1, fps: 4 } } } },
    interactions: {},
    capabilities: {}
  }));
  await writeFile(path.join(codexFolder, "pet.json"), JSON.stringify({ id: "codex-pet", displayName: "Codex 宠物" }));

  const protocol = await inspectPetPackage(protocolFolder);
  const codex = await inspectPetPackage(codexFolder);

  assert.equal(protocol.sourceType, "ai-pet-protocol");
  assert.equal(codex.sourceType, "codex-pet");
  assert.deepEqual(protocol.declaredAssets, ["manifest.json", "spritesheet.webp"]);
  assert.deepEqual(codex.declaredAssets, ["pet.json", "spritesheet.webp"]);
  assert.equal(codex.canonicalPackage.sourceFormat, "codex-pet");
});

test("inspectPetPackage rejects unsafe cross-platform pet ids", async () => {
  for (const petId of ["CON", "pet.", "index.json", ".snapshots"]) {
    const folder = await tempFolder();
    await writeFile(path.join(folder, "spritesheet.webp"), "image");
    await writeFile(path.join(folder, "pet.json"), JSON.stringify({ id: petId }));
    await assert.rejects(() => inspectPetPackage(folder), /petId/);
  }
});

test("inspectPetPackage exposes structured protocol diagnostics", async () => {
  const folder = await tempFolder();
  await writeFile(path.join(folder, "spritesheet.webp"), "image");
  await writeFile(path.join(folder, "manifest.json"), JSON.stringify({
    protocolVersion: "0.1.0",
    petId: "broken-pet",
    displayName: "损坏宠物"
  }));

  await assert.rejects(
    () => inspectPetPackage(folder),
    (error) => {
      assert.ok(error instanceof PetPackageIntakeError);
      assert.ok(error.diagnostics.length > 0);
      assert.equal(error.diagnostics[0]?.code, "protocol-validation");
      assert.ok(error.diagnostics.every((item) => item.title && item.detail && item.suggestion));
      return true;
    }
  );
});
