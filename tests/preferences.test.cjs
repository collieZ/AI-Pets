const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { createDesktopPreferencesStore, defaultPreferences } = require("../apps/desktop/electron/preferences.cjs");

async function createTempUserData() {
  return fs.mkdtemp(path.join(os.tmpdir(), "ai-pets-preferences-test-"));
}

test("desktop preferences use defaults when no saved file exists", async () => {
  const userDataPath = await createTempUserData();
  const store = createDesktopPreferencesStore({ userDataPath });

  assert.deepEqual(store.read(), { ...defaultPreferences });
});

test("desktop preferences persist normalized pet settings", async () => {
  const userDataPath = await createTempUserData();
  const store = createDesktopPreferencesStore({ userDataPath });

  const saved = store.write({
    selectedPetId: " simba ",
    playbackSpeed: 4,
    petScale: 0.2,
    petVisible: false,
    alwaysOnTop: false
  });

  assert.deepEqual(saved, {
    version: 1,
    selectedPetId: "simba",
    playbackSpeed: 1.5,
    petScale: 0.65,
    petVisible: false,
    alwaysOnTop: false
  });
  assert.deepEqual(store.read(), saved);
  assert.equal((await fs.readFile(store.getPath(), "utf8")).includes('"selectedPetId": "simba"'), true);
});
