const { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, net, protocol, shell, Tray } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { createImportedPetTransaction, ImportedPetTransactionError } = require("./importedPets/transaction.ts");
const { createExternalAiBridge } = require("./externalAiBridge.ts");
const { createDesktopPreferencesStore, defaultPreferences } = require("../preferences.cjs");

const isMac = process.platform === "darwin";
const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();

if (isMac) {
  app.disableHardwareAcceleration();
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: "ai-pets",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true
    }
  }
]);

let petWindow;
let settingsWindow;
let tray;
let settingsOpen = false;
let petVisible = true;
let alwaysOnTop = true;
let importedPetTransaction;
let recoverySummary;
let preferencesStore;
let desktopPreferences = { ...defaultPreferences };
const pendingPetCommands: unknown[] = [];
const MAX_PENDING_PET_COMMANDS = 30;
const configuredBridgePort = Number(process.env.AI_PETS_EVENT_PORT ?? "17321");
const externalAiBridge = createExternalAiBridge({
  port: Number.isInteger(configuredBridgePort) && configuredBridgePort >= 1 && configuredBridgePort <= 65535 ? configuredBridgePort : 17321,
  dispatch: (event) => dispatchPetCommand({ type: "externalEvent", event })
});

function getImportedPetErrorReason(error, fallback) {
  return error instanceof ImportedPetTransactionError && typeof error.reason === "string" ? error.reason : fallback;
}

function getResourcesPath() {
  return "resourcesPath" in process ? process.resourcesPath : process.cwd();
}

function getAppEntry() {
  return path.join(__dirname, "..", "..", "dist", "index.html");
}

function loadAppView(window, view) {
  const devUrl = process.env.AI_PETS_DESKTOP_DEV_URL;
  if (devUrl) {
    void window.loadURL(`${devUrl}?view=${view}`);
    return;
  }

  void window.loadFile(getAppEntry(), { query: { view } });
}

function createPetWindow() {
  petWindow = new BrowserWindow({
    width: 260,
    height: 340,
    minWidth: 220,
    minHeight: 280,
    transparent: true,
    frame: false,
    alwaysOnTop,
    ...(isMac ? { hasShadow: false } : {}),
    resizable: false,
    show: false,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      ...(isMac ? { backgroundThrottling: false } : {})
    }
  });
  const createdWindow = petWindow;

  petWindow.once("ready-to-show", () => {
    if (petVisible) {
      petWindow.show();
    }
    invalidatePetWindow();
    broadcastDesktopState();
  });

  createdWindow.webContents.on("did-finish-load", () => {
    const commands = pendingPetCommands.splice(0);
    for (const command of commands) {
      createdWindow.webContents.send("desktop:pet-command", command);
    }
    if (commands.length > 0) invalidatePetWindow();
  });

  petWindow.on("show", () => {
    petVisible = true;
    updateTrayMenu();
    broadcastDesktopState();
  });

  petWindow.on("hide", () => {
    petVisible = false;
    updateTrayMenu();
    broadcastDesktopState();
  });

  petWindow.on("closed", () => {
    petWindow = undefined;
    petVisible = false;
    updateTrayMenu();
    broadcastDesktopState();
  });

  loadAppView(petWindow, "pet");
  return petWindow;
}

function createSettingsWindow() {
  settingsWindow = new BrowserWindow({
    width: 780,
    height: 580,
    minWidth: 680,
    minHeight: 500,
    title: "AI-Pets 设置",
    show: false,
    frame: false,
    resizable: true,
    ...(isMac ? { trafficLightPosition: { x: 16, y: 14 } } : { thickFrame: true }),
    transparent: true,
    backgroundColor: "#00000000",
    ...(isMac ? { vibrancy: "under-window", visualEffectState: "active" } : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  if (isMac) {
    settingsWindow.setWindowButtonVisibility(true);
  }

  settingsWindow.once("ready-to-show", () => {
    if (settingsOpen) {
      settingsWindow.show();
    }
  });

  settingsWindow.on("close", (event) => {
    if (app.isQuitting) {
      return;
    }

    event.preventDefault();
    setSettingsOpen(false);
  });

  settingsWindow.on("show", () => {
    settingsOpen = true;
    updateTrayMenu();
    broadcastDesktopState();
  });

  settingsWindow.on("hide", () => {
    settingsOpen = false;
    updateTrayMenu();
    broadcastDesktopState();
  });

  settingsWindow.on("closed", () => {
    settingsWindow = undefined;
    settingsOpen = false;
    updateTrayMenu();
    broadcastDesktopState();
  });

  loadAppView(settingsWindow, "settings");
  return settingsWindow;
}

function getOrCreatePetWindow() {
  return petWindow && !petWindow.isDestroyed() ? petWindow : createPetWindow();
}

function getOrCreateSettingsWindow() {
  return settingsWindow && !settingsWindow.isDestroyed() ? settingsWindow : createSettingsWindow();
}

function isSettingsSender(event) {
  return BrowserWindow.fromWebContents(event.sender) === settingsWindow;
}

function getImportedPetTransaction() {
  if (!importedPetTransaction) {
    importedPetTransaction = createImportedPetTransaction({ userDataPath: app.getPath("userData") });
  }

  return importedPetTransaction;
}

function getPreferencesStore() {
  if (!preferencesStore) {
    preferencesStore = createDesktopPreferencesStore({ userDataPath: app.getPath("userData") });
  }

  return preferencesStore;
}

function loadDesktopPreferences() {
  desktopPreferences = getPreferencesStore().read();
  petVisible = desktopPreferences.petVisible;
  alwaysOnTop = desktopPreferences.alwaysOnTop;
}

function updateDesktopPreferences(partialPreferences) {
  desktopPreferences = {
    ...desktopPreferences,
    ...partialPreferences
  };

  try {
    desktopPreferences = getPreferencesStore().write(desktopPreferences);
  } catch (error) {
    console.error("无法保存 AI-Pets 偏好设置。", error);
  }
}

function resetDesktopPreferences() {
  desktopPreferences = getPreferencesStore().write(defaultPreferences);
  petVisible = desktopPreferences.petVisible;
  alwaysOnTop = desktopPreferences.alwaysOnTop;

  const window = getOrCreatePetWindow();
  window.setAlwaysOnTop(alwaysOnTop);
  if (petVisible) {
    window.show();
  } else {
    window.hide();
  }
  updateTrayMenu();
  broadcastDesktopState();
  return desktopPreferences;
}

function getContentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".json") {
    return "application/json";
  }
  if (extension === ".webp") {
    return "image/webp";
  }
  if (extension === ".png") {
    return "image/png";
  }
  if (extension === ".svg") {
    return "image/svg+xml";
  }
  return "application/octet-stream";
}

function createProtocolHeaders(contentType) {
  return {
    "access-control-allow-origin": "*",
    "content-type": contentType
  };
}

function registerImportedPetProtocol() {
  protocol.handle("ai-pets", async (request) => {
    try {
      const filePath = await getImportedPetTransaction().resolveAuthorizedAssetPath(request.url);
      const response = await net.fetch(pathToFileURL(filePath).toString());
      if (!response.ok) {
        return new Response("未找到导入宠物资源。", {
          status: response.status,
          headers: createProtocolHeaders("text/plain; charset=utf-8")
        });
      }

      return new Response(response.body, {
        status: response.status,
        headers: createProtocolHeaders(getContentType(filePath))
      });
    } catch (error) {
      return new Response(error instanceof Error ? error.message : "导入宠物资源请求失败。", {
        status: 400,
        headers: createProtocolHeaders("text/plain; charset=utf-8")
      });
    }
  });
}

function getDesktopState() {
  return {
    settingsOpen,
    petVisible,
    alwaysOnTop
  };
}

function broadcastDesktopState() {
  const state = getDesktopState();
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send("desktop:state", state);
  }
}

function invalidatePetWindow() {
  if (
    !isMac ||
    !petWindow ||
    petWindow.isDestroyed() ||
    typeof petWindow.invalidateShadow !== "function"
  ) {
    return;
  }

  petWindow.invalidateShadow();
}

function setSettingsOpen(open) {
  settingsOpen = Boolean(open);
  const window = getOrCreateSettingsWindow();
  if (settingsOpen) {
    window.show();
    window.focus();
  } else {
    void getImportedPetTransaction().cancelImport();
    window.hide();
  }
  updateTrayMenu();
  broadcastDesktopState();
}

function toggleSettings() {
  setSettingsOpen(!settingsOpen);
}

function setPetVisible(visible) {
  petVisible = Boolean(visible);
  updateDesktopPreferences({ petVisible });
  const window = getOrCreatePetWindow();
  if (petVisible) {
    window.show();
    window.focus();
  } else {
    window.hide();
  }
  updateTrayMenu();
  broadcastDesktopState();
}

function togglePetVisible() {
  const window = getOrCreatePetWindow();
  setPetVisible(!window.isVisible());
}

function setAlwaysOnTop(enabled) {
  alwaysOnTop = Boolean(enabled);
  updateDesktopPreferences({ alwaysOnTop });
  const window = getOrCreatePetWindow();
  window.setAlwaysOnTop(alwaysOnTop);
  updateTrayMenu();
  broadcastDesktopState();
}

function dispatchPetCommand(command) {
  if (command && typeof command === "object") {
    if (command.type === "selectPet" && typeof command.selectedId === "string") {
      updateDesktopPreferences({ selectedPetId: command.selectedId });
    } else if (command.type === "playbackSpeed" && typeof command.value === "number") {
      updateDesktopPreferences({ playbackSpeed: command.value });
    } else if (command.type === "petScale" && typeof command.value === "number") {
      updateDesktopPreferences({ petScale: command.value });
    }
  }

  const window = getOrCreatePetWindow();
  if (!window.isVisible()) {
    window.show();
  }
  if (window.webContents.isLoadingMainFrame()) {
    pendingPetCommands.push(command);
    if (pendingPetCommands.length > MAX_PENDING_PET_COMMANDS) pendingPetCommands.shift();
  } else {
    window.webContents.send("desktop:pet-command", command);
  }
  invalidatePetWindow();
}

function broadcastImportedPetsChanged() {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send("desktop:imported-pets-changed");
  }
}

async function preparePetImport(folderPath) {
  try {
    const preview = await getImportedPetTransaction().prepareImport(folderPath);
    return {
      ok: true,
      preview
    };
  } catch (error) {
    return {
      ok: false,
      reason: getImportedPetErrorReason(error, "invalid-package"),
      message: error instanceof Error ? error.message : "宠物包校验失败。"
    };
  }
}

function getTrayIconPath() {
  const candidates = [
    path.join(getResourcesPath(), "assets", "tray.ico"),
    path.join(getResourcesPath(), "assets", "tray.png"),
    path.join(__dirname, "..", "..", "assets", "tray.ico"),
    path.join(__dirname, "..", "..", "assets", "tray.png")
  ];
  return candidates.find((candidate) => fs.existsSync(candidate));
}

function getAppIconPath() {
  const candidates = [
    path.join(getResourcesPath(), "assets", "icon.icns"),
    path.join(getResourcesPath(), "assets", "icon.png"),
    path.join(getResourcesPath(), "assets", "tray.png"),
    path.join(__dirname, "..", "..", "assets", "icon.icns"),
    path.join(__dirname, "..", "..", "assets", "icon.png"),
    path.join(__dirname, "..", "..", "assets", "tray.png")
  ];
  return candidates.find((candidate) => fs.existsSync(candidate));
}

function setMacDockIcon() {
  if (!isMac || !app.dock) {
    return;
  }

  const iconPath = getAppIconPath();
  if (!iconPath) {
    return;
  }

  const image = nativeImage.createFromPath(iconPath);
  if (!image.isEmpty()) {
    app.dock.setIcon(image);
  }
}

function createTrayIcon() {
  const iconPath = getTrayIconPath();
  if (iconPath) {
    const image = nativeImage.createFromPath(iconPath);
    if (!image.isEmpty()) {
      return image.resize({ width: 16, height: 16 });
    }
  }

  return nativeImage.createFromDataURL(
    "data:image/svg+xml;utf8," +
      encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
        <rect width="32" height="32" rx="8" fill="#101828"/>
        <circle cx="11" cy="13" r="3" fill="#fff"/>
        <circle cx="21" cy="13" r="3" fill="#fff"/>
        <path d="M10 22c3.5 3 8.5 3 12 0" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
      </svg>`)
  );
}

function buildDesktopMenu() {
  return Menu.buildFromTemplate([
    {
      label: settingsOpen ? "关闭设置" : "打开设置",
      click: toggleSettings
    },
    {
      label: petVisible ? "隐藏宠物" : "显示宠物",
      click: togglePetVisible
    },
    {
      label: "窗口置顶",
      type: "checkbox",
      checked: alwaysOnTop,
      click: (item) => setAlwaysOnTop(item.checked)
    },
    { type: "separator" },
    {
      label: "退出 AI-Pets",
      click: () => {
        app.isQuitting = true;
        if (tray) {
          tray.destroy();
          tray = undefined;
        }
        app.quit();
        setTimeout(() => {
          if (app.isQuitting) {
            app.exit(0);
          }
        }, 1000).unref();
      }
    }
  ]);
}

function updateTrayMenu() {
  if (!tray) {
    return;
  }

  tray.setContextMenu(buildDesktopMenu());
}

function createTray() {
  tray = new Tray(createTrayIcon());
  tray.setToolTip("AI-Pets");
  tray.on("click", () => setPetVisible(true));
  updateTrayMenu();
}

ipcMain.handle("desktop:get-window-position", (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) {
    return { x: 0, y: 0 };
  }

  const [x, y] = window.getPosition();
  return { x, y };
});

ipcMain.handle("desktop:move-window", (event, position) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window || typeof position?.x !== "number" || typeof position?.y !== "number") {
    return;
  }

  window.setPosition(position.x, position.y, false);
});

ipcMain.handle("desktop:set-settings-open", (_event, open) => {
  setSettingsOpen(open);
});

ipcMain.handle("desktop:set-pet-visible", (_event, visible) => {
  setPetVisible(visible);
});

ipcMain.handle("desktop:set-always-on-top", (_event, enabled) => {
  setAlwaysOnTop(enabled);
});

ipcMain.handle("desktop:get-state", () => getDesktopState());

ipcMain.handle("desktop:get-preferences", () => desktopPreferences);

ipcMain.handle("desktop:reset-preferences", () => resetDesktopPreferences());

ipcMain.handle("desktop:open-pet-data-directory", async (event) => {
  if (!isSettingsSender(event)) return { ok: false, message: "仅设置窗口可以打开宠物数据目录。" };
  const root = getImportedPetTransaction().getImportedPetsRoot();
  fs.mkdirSync(root, { recursive: true });
  const errorMessage = await shell.openPath(root);
  return errorMessage ? { ok: false, message: errorMessage } : { ok: true };
});

ipcMain.handle("desktop:open-pet-quarantine-directory", async (event) => {
  if (!isSettingsSender(event)) return { ok: false, message: "仅设置窗口可以打开隔离目录。" };
  const root = getImportedPetTransaction().getQuarantineRoot();
  fs.mkdirSync(root, { recursive: true });
  const errorMessage = await shell.openPath(root);
  return errorMessage ? { ok: false, message: errorMessage } : { ok: true };
});

ipcMain.handle("desktop:get-recovery-summary", () => recoverySummary ?? null);

ipcMain.handle("desktop:get-external-ai-bridge-status", (event) => {
  if (!isSettingsSender(event)) return { ...externalAiBridge.getStatus(), lastError: "仅设置窗口可以读取事件桥状态。" };
  return externalAiBridge.getStatus();
});

ipcMain.handle("desktop:dispatch-pet-command", (_event, command) => {
  dispatchPetCommand(command);
});

ipcMain.handle("desktop:list-imported-pets", async () => {
  return getImportedPetTransaction().listPets();
});

ipcMain.handle("desktop:select-import-pet-folder", async (event) => {
  if (!isSettingsSender(event)) return { ok: false, reason: "unsafe-path", message: "仅设置窗口可以导入宠物。" };
  const parentWindow = BrowserWindow.fromWebContents(event.sender) ?? settingsWindow ?? petWindow;
  const dialogOptions = {
    title: "选择宠物包文件夹",
    properties: ["openDirectory"]
  };
  const result = parentWindow
    ? await dialog.showOpenDialog(parentWindow, dialogOptions)
    : await dialog.showOpenDialog(dialogOptions);

  if (result.canceled || !result.filePaths[0]) {
    return {
      ok: false,
      reason: "cancelled"
    };
  }

  return preparePetImport(result.filePaths[0]);
});

ipcMain.handle("desktop:confirm-import-pet-folder", async (event, token) => {
  if (!isSettingsSender(event)) return { ok: false, reason: "unsafe-path", message: "仅设置窗口可以确认导入。" };
  try {
    const pet = await getImportedPetTransaction().confirmImport(token);
    broadcastImportedPetsChanged();
    return { ok: true, pet };
  } catch (error) {
    return {
      ok: false,
      reason: getImportedPetErrorReason(error, "transaction-failed"),
      message: error instanceof Error ? error.message : "导入事务失败。"
    };
  }
});

ipcMain.handle("desktop:cancel-import-pet-folder", async (event, token) => {
  if (!isSettingsSender(event)) return;
  await getImportedPetTransaction().cancelImport(token);
});

ipcMain.handle("desktop:delete-imported-pet", async (event, petId) => {
  if (!isSettingsSender(event)) return { ok: false, reason: "transaction-failed", petId, message: "仅设置窗口可以删除宠物。" };
  try {
    const result = await getImportedPetTransaction().deleteImportedPet(petId);
    if (result.ok) {
      if (desktopPreferences.selectedPetId === petId) {
        updateDesktopPreferences({ selectedPetId: "yibao-codex" });
        dispatchPetCommand({ type: "selectPet", selectedId: "yibao-codex" });
      }
      broadcastImportedPetsChanged();
    }
    return result;
  } catch (error) {
    return {
      ok: false,
      reason: getImportedPetErrorReason(error, "transaction-failed"),
      petId,
      message: error instanceof Error ? error.message : "删除宠物失败。"
    };
  }
});

ipcMain.handle("desktop:show-context-menu", (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) {
    return;
  }

  buildDesktopMenu().popup({ window });
});

ipcMain.handle("desktop:invalidate-pet-window", (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (window !== petWindow) {
    return;
  }

  invalidatePetWindow();
});

ipcMain.handle("desktop:control-settings-window", (event, action) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (window !== settingsWindow || !["minimize", "maximize", "close"].includes(action)) {
    return;
  }

  if (action === "minimize") {
    window.minimize();
    return;
  }

  if (action === "maximize") {
    if (window.isMaximized()) {
      window.unmaximize();
    } else {
      window.maximize();
    }
    return;
  }

  setSettingsOpen(false);
});

app.on("before-quit", () => {
  app.isQuitting = true;
  void getImportedPetTransaction().cancelImport();
  void externalAiBridge.stop();
  if (tray) {
    tray.destroy();
    tray = undefined;
  }
});

if (hasSingleInstanceLock) app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  loadDesktopPreferences();
  setMacDockIcon();
  recoverySummary = await getImportedPetTransaction().initialize();
  if (recoverySummary.quarantinedPetIds.includes(desktopPreferences.selectedPetId)) {
    updateDesktopPreferences({ selectedPetId: "yibao-codex" });
  }
  registerImportedPetProtocol();
  createPetWindow();
  createTray();
  const bridgeStatus = await externalAiBridge.start();
  if (!bridgeStatus.running) console.error("外部 AI 事件桥启动失败。", bridgeStatus.lastError);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createPetWindow();
    } else {
      setPetVisible(true);
    }
  });
});

app.on("second-instance", () => {
  setPetVisible(true);
  if (settingsOpen) getOrCreateSettingsWindow().focus();
});

app.on("window-all-closed", () => {
  if (isMac) {
    return;
  }

  if (!tray) {
    app.quit();
  }
});
