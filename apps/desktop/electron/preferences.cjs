const fs = require("node:fs");
const path = require("node:path");

const PREFERENCES_VERSION = 1;
const PREFERENCES_FILE = "preferences.json";

const defaultPreferences = Object.freeze({
  version: PREFERENCES_VERSION,
  selectedPetId: "",
  playbackSpeed: 1,
  petScale: 1,
  petVisible: true,
  alwaysOnTop: true
});

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clamp(value, minimum, maximum, fallback) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(minimum, Math.min(maximum, value))
    : fallback;
}

function normalizePreferences(rawPreferences) {
  if (!isObject(rawPreferences)) {
    return { ...defaultPreferences };
  }

  return {
    version: PREFERENCES_VERSION,
    selectedPetId: typeof rawPreferences.selectedPetId === "string" ? rawPreferences.selectedPetId.trim() : "",
    playbackSpeed: clamp(rawPreferences.playbackSpeed, 0.5, 1.5, 1),
    petScale: clamp(rawPreferences.petScale, 0.65, 1.25, 1),
    petVisible: typeof rawPreferences.petVisible === "boolean" ? rawPreferences.petVisible : true,
    alwaysOnTop: typeof rawPreferences.alwaysOnTop === "boolean" ? rawPreferences.alwaysOnTop : true
  };
}

function createDesktopPreferencesStore({ userDataPath }) {
  if (typeof userDataPath !== "string" || userDataPath.trim() === "") {
    throw new Error("userDataPath 必须是非空字符串。");
  }

  const preferencesPath = path.join(userDataPath, PREFERENCES_FILE);

  function read() {
    try {
      return normalizePreferences(JSON.parse(fs.readFileSync(preferencesPath, "utf8")));
    } catch (error) {
      if (error && error.code !== "ENOENT") {
        console.warn("无法读取 AI-Pets 偏好设置，将使用默认值。", error);
      }
      return { ...defaultPreferences };
    }
  }

  function write(nextPreferences) {
    const normalizedPreferences = normalizePreferences(nextPreferences);
    fs.mkdirSync(userDataPath, { recursive: true });
    const temporaryPath = `${preferencesPath}.tmp`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify(normalizedPreferences, null, 2)}\n`, "utf8");
    fs.renameSync(temporaryPath, preferencesPath);
    return normalizedPreferences;
  }

  return {
    getPath: () => preferencesPath,
    read,
    write
  };
}

module.exports = {
  createDesktopPreferencesStore,
  defaultPreferences,
  normalizePreferences
};
