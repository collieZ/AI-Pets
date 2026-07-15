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

export interface PetImportDiagnostic {
  code: string;
  title: string;
  detail: string;
  path?: string;
  suggestion: string;
}

export class PetPackageIntakeError extends Error {
  readonly reason: "invalid-package" | "unsafe-path";
  readonly diagnostics: PetImportDiagnostic[];

  constructor(
    reason: "invalid-package" | "unsafe-path",
    message: string,
    diagnostics: PetImportDiagnostic[] = []
  ) {
    super(message);
    this.name = "PetPackageIntakeError";
    this.reason = reason;
    this.diagnostics = diagnostics;
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
    throw new PetPackageIntakeError("unsafe-path", "petId 不是安全的跨平台目录名称。", [{
      code: "unsafe-pet-id",
      title: "宠物 ID 不安全",
      path: "petId",
      detail: "只允许英文字母、数字、点、下划线和连字符，并且不能使用 Windows 保留名称。",
      suggestion: "将 petId 改为类似 simba、my-pet 或 pet_01 的跨平台目录名称。"
    }]);
  }
}

function normalizeAssetPath(assetPath: string) {
  const normalized = assetPath.replaceAll("\\", "/");
  if (
    path.posix.isAbsolute(normalized) ||
    normalized.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    throw new PetPackageIntakeError("unsafe-path", "宠物资源必须使用安全的相对路径。", [{
      code: "unsafe-asset-path",
      title: "资源路径不安全",
      path: "assets.atlas.path",
      detail: "资源必须位于宠物包目录内，不能使用绝对路径、空路径或 ../ 跨目录引用。",
      suggestion: "改用类似 spritesheet.webp 或 assets/spritesheet.webp 的相对路径。"
    }]);
  }
  return normalized;
}

async function readJson(filePath: string) {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as unknown;
  } catch (error) {
    const fileName = path.basename(filePath);
    throw new PetPackageIntakeError(
      "invalid-package",
      `无法读取 ${fileName}：${error instanceof Error ? error.message : String(error)}`,
      [{
        code: "manifest-json-invalid",
        title: "配置文件无法解析",
        path: fileName,
        detail: error instanceof Error ? error.message : String(error),
        suggestion: "检查 JSON 语法、文件编码、引号和末尾逗号后重新导入。"
      }]
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
  throw new PetPackageIntakeError("invalid-package", "宠物包必须包含 manifest.json 或 pet.json。", [{
    code: "manifest-missing",
    title: "缺少宠物配置文件",
    detail: "所选目录中没有找到 manifest.json 或 pet.json。",
    suggestion: "确认选择的是宠物包根目录，并在根目录放置 manifest.json 或 pet.json。"
  }]);
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
      error instanceof Error ? error.message : "宠物包格式无效。",
      [{
        code: "adapter-failed",
        title: "Codex 宠物格式转换失败",
        path: manifestFileName,
        detail: error instanceof Error ? error.message : "宠物包格式无效。",
        suggestion: "检查 pet.json 的 id、spritesheetPath 和动作定义是否符合 Codex 宠物格式。"
      }]
    );
  }

  const validation = validatePetPackage(canonicalPackage);
  if (!validation.ok) {
    throw new PetPackageIntakeError(
      "invalid-package",
      validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join("；"),
      validation.issues.map((issue) => ({
        code: "protocol-validation",
        title: "协议字段校验失败",
        path: issue.path,
        detail: issue.message,
        suggestion: "按照 AI-Pets manifest 协议修正该字段，并确认引用的状态和动画真实存在。"
      }))
    );
  }

  assertSafePetId(canonicalPackage.petId);
  const assetPath = normalizeAssetPath(canonicalPackage.assets.atlas.path);
  const assetFile = path.join(folderPath, ...assetPath.split("/"));
  const assetStat = await stat(assetFile).catch(() => undefined);
  if (!assetStat?.isFile() || assetStat.size === 0) {
    throw new PetPackageIntakeError("invalid-package", `宠物资源不存在或为空：${assetPath}`, [{
      code: "atlas-missing",
      title: "雪碧图资源缺失",
      path: assetPath,
      detail: "manifest 声明的雪碧图不存在、不是普通文件或内容为空。",
      suggestion: "将对应图片放入宠物包，或修正 assets.atlas.path。"
    }]);
  }
  if (![".webp", ".png"].includes(path.extname(assetPath).toLowerCase())) {
    throw new PetPackageIntakeError("invalid-package", `雪碧图仅支持 WebP 或 PNG：${assetPath}`, [{
      code: "atlas-format-unsupported",
      title: "雪碧图格式不支持",
      path: assetPath,
      detail: "桌面端当前只支持 WebP 和 PNG 雪碧图。",
      suggestion: "将图片转换为带透明通道的 WebP 或 PNG，并同步修改 manifest。"
    }]);
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
