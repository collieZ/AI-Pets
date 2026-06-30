import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = "C:\\Users\\collieZhou\\.codex\\pets\\yibao";
const target = join(root, "apps", "web-poc", "public", "pets", "yibao-codex");

await mkdir(target, { recursive: true });
await copyFile(join(source, "pet.json"), join(target, "pet.json"));
await copyFile(join(source, "spritesheet.webp"), join(target, "spritesheet.webp"));

const manifest = JSON.parse(await readFile(join(target, "pet.json"), "utf8"));
await writeFile(
  join(target, "source.json"),
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
