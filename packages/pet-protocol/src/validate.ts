import type { ValidationIssue, ValidationResult } from "./types.js";

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim() !== "";

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value > 0;

const isNonNegativeInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

const isPositiveNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

const isSafeRelativeAssetPath = (value: string) => {
  const normalized = value.replaceAll("\\", "/");
  return !normalized.startsWith("/") && !normalized.split("/").some((segment) => segment === ".." || segment === "");
};

export function validatePetPackage(pkg: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (!isObject(pkg)) {
    return { ok: false, issues: [{ path: "$", message: "宠物包必须是对象。" }] };
  }

  if (pkg.protocolVersion !== "0.1.0") {
    issues.push({ path: "protocolVersion", message: "POC 仅支持 protocolVersion 0.1.0。" });
  }

  for (const field of ["petId", "displayName", "description"] as const) {
    if (!isNonEmptyString(pkg[field])) {
      issues.push({ path: field, message: `${field} 必须是非空字符串。` });
    }
  }

  const assets = pkg.assets;
  const atlas = isObject(assets) ? assets.atlas : undefined;
  if (!isObject(atlas)) {
    issues.push({ path: "assets.atlas", message: "必须声明 spritesheet atlas 资产。" });
  } else {
    if (atlas.type !== "spritesheet") {
      issues.push({ path: "assets.atlas.type", message: "atlas.type 必须是 spritesheet。" });
    }

    if (!isNonEmptyString(atlas.path)) {
      issues.push({ path: "assets.atlas.path", message: "atlas.path 必须是非空字符串。" });
    } else if (!isSafeRelativeAssetPath(atlas.path)) {
      issues.push({ path: "assets.atlas.path", message: "atlas.path 必须是安全的相对路径。" });
    }

    for (const field of ["cellWidth", "cellHeight", "columns", "rows"] as const) {
      if (!isPositiveInteger(atlas[field])) {
        issues.push({ path: `assets.atlas.${field}`, message: `${field} 必须是正整数。` });
      }
    }
  }

  const states = pkg.states;
  if (!isObject(states) || Object.keys(states).length === 0) {
    issues.push({ path: "states", message: "宠物包必须至少声明一个可渲染状态。" });
  }

  const animationSets = pkg.animationSets;
  const defaultAnimationSet = isObject(animationSets) ? animationSets.default : undefined;
  const animations = isObject(defaultAnimationSet) ? defaultAnimationSet.animations : undefined;
  if (!isObject(animations) || Object.keys(animations).length === 0) {
    issues.push({ path: "animationSets.default.animations", message: "必须声明默认动画集合。" });
  }

  if (isObject(animations)) {
    for (const [animationId, animation] of Object.entries(animations)) {
      if (!isObject(animation)) {
        issues.push({
          path: `animationSets.default.animations.${animationId}`,
          message: "动画定义必须是对象。"
        });
        continue;
      }

      if (!isNonNegativeInteger(animation.row)) {
        issues.push({
          path: `animationSets.default.animations.${animationId}.row`,
          message: "row 必须是 0 或更大的整数。"
        });
      }

      if (isNonNegativeInteger(animation.row) && isObject(atlas) && isPositiveInteger(atlas.rows) && animation.row >= atlas.rows) {
        issues.push({
          path: `animationSets.default.animations.${animationId}.row`,
          message: "row 不能超出 atlas.rows。"
        });
      }

      if (!isPositiveInteger(animation.frames)) {
        issues.push({
          path: `animationSets.default.animations.${animationId}.frames`,
          message: "frames 必须是大于 0 的整数。"
        });
      }


      if (isPositiveInteger(animation.frames) && isObject(atlas) && isPositiveInteger(atlas.columns) && animation.frames > atlas.columns) {
        issues.push({
          path: `animationSets.default.animations.${animationId}.frames`,
          message: "frames 不能超出 atlas.columns。"
        });
      }

      if (!isPositiveNumber(animation.fps)) {
        issues.push({
          path: `animationSets.default.animations.${animationId}.fps`,
          message: "fps 必须是大于 0 的数字。"
        });
      }
    }
  }

  if (!isObject(pkg.interactions)) {
    issues.push({ path: "interactions", message: "interactions 必须是对象。" });
  } else {
    for (const [interactionId, interaction] of Object.entries(pkg.interactions)) {
      if (!isObject(interaction)) {
        issues.push({ path: `interactions.${interactionId}`, message: "交互定义必须是对象。" });
        continue;
      }
      if (interaction.state !== undefined && (!isNonEmptyString(interaction.state) || !isObject(states) || !Object.hasOwn(states, interaction.state))) {
        issues.push({ path: `interactions.${interactionId}.state`, message: "交互引用的状态不存在。" });
      }
    }
  }

  if (!isObject(pkg.capabilities)) {
    issues.push({ path: "capabilities", message: "capabilities 必须是对象。" });
  } else {
    for (const [capabilityId, enabled] of Object.entries(pkg.capabilities)) {
      if (typeof enabled !== "boolean") {
        issues.push({ path: `capabilities.${capabilityId}`, message: "capability 值必须是布尔值。" });
      }
    }
  }

  if (isObject(states)) {
    for (const [stateId, state] of Object.entries(states)) {
      if (!isObject(state)) {
        issues.push({ path: `states.${stateId}`, message: "状态必须是对象。" });
        continue;
      }

      if (!isNonEmptyString(state.label)) {
        issues.push({ path: `states.${stateId}.label`, message: "状态必须有 label。" });
      }


      if (typeof state.loop !== "boolean") {
        issues.push({ path: `states.${stateId}.loop`, message: "loop 必须是布尔值。" });
      }

      if (isObject(animations) && (!isNonEmptyString(state.animation) || !Object.hasOwn(animations, state.animation))) {
        issues.push({
          path: `states.${stateId}.animation`,
          message: `状态引用的动画 ${String(state.animation)} 不存在。`
        });
      }
    }
  }

  return { ok: issues.length === 0, issues };
}
