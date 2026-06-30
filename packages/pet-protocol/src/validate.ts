import type { ValidationIssue, ValidationResult } from "./types";

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim() !== "";

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value > 0;

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
    if (!isNonEmptyString(atlas.path)) {
      issues.push({ path: "assets.atlas.path", message: "atlas.path 必须是非空字符串。" });
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

  if (isObject(states)) {
    for (const [stateId, state] of Object.entries(states)) {
      if (!isObject(state)) {
        issues.push({ path: `states.${stateId}`, message: "状态必须是对象。" });
        continue;
      }

      if (!isNonEmptyString(state.label)) {
        issues.push({ path: `states.${stateId}.label`, message: "状态必须有 label。" });
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
