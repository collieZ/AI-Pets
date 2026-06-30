import { constants } from "node:fs";
import { access, copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const defaultSource = "C:\\Users\\collieZhou\\.codex\\pets\\yibao";
const source = resolve(process.argv[2] ?? process.env.YIBAO_PET_DIR ?? defaultSource);
const target = resolve(root, "apps", "web-poc", "public", "pets", "yibao-codex");
const expectedTarget = resolve(root, "apps", "web-poc", "public", "pets", "yibao-codex");

async function assertReadableFile(path, label) {
  try {
    const sourceStat = await stat(path);
    if (!sourceStat.isFile()) {
      throw new Error("not-file");
    }
    await access(path, constants.R_OK);
  } catch {
    throw new Error(`导入 yibao 失败：找不到、不是文件或无法读取 ${label}：${path}`);
  }
}

function assertInsideTarget(path) {
  const relation = relative(expectedTarget, path);
  if (relation === "" || (!relation.startsWith("..") && !isAbsolute(relation))) {
    return;
  }

  throw new Error(`导入 yibao 失败：目标路径越界，拒绝写入：${path}`);
}

if (target !== expectedTarget) {
  throw new Error(`导入 yibao 失败：目标目录异常，拒绝写入：${target}`);
}

const sourcePetJson = join(source, "pet.json");
const sourceSpritesheet = join(source, "spritesheet.webp");
const targetPetJson = join(target, "pet.json");
const targetSpritesheet = join(target, "spritesheet.webp");
const targetSourceJson = join(target, "source.json");

await assertReadableFile(sourcePetJson, "pet.json");
await assertReadableFile(sourceSpritesheet, "spritesheet.webp");

for (const outputPath of [targetPetJson, targetSpritesheet, targetSourceJson]) {
  assertInsideTarget(outputPath);
}

await mkdir(target, { recursive: true });
await copyFile(sourcePetJson, targetPetJson);
await copyFile(sourceSpritesheet, targetSpritesheet);

let manifest;
try {
  manifest = JSON.parse(await readFile(targetPetJson, "utf8"));
} catch (error) {
  throw new Error(`导入 yibao 失败：pet.json 不是有效 JSON：${error instanceof Error ? error.message : String(error)}`);
}

await writeFile(
  targetSourceJson,
  `${JSON.stringify(
    {
      sourceType: "codex-pet",
      sourcePath: source,
      petJson: "pet.json"
    },
    null,
    2
  )}\n`
);

console.log(`已导入 Codex 宠物 ${manifest.id} 到 ${target}`);
