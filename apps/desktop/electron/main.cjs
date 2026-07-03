const { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, net, protocol, Tray } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { createImportedPetStore, resolveImportedPetAssetPath } = require("./importedPets.cjs");

const isMac = process.platform === "darwin";

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
let importedPetStore;
let pendingPetImport;

function getAppEntry() {
  return path.join(__dirname, "..", "dist", "index.html");
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

  petWindow.once("ready-to-show", () => {
    petVisible = true;
    petWindow.show();
    invalidatePetWindow();
    broadcastDesktopState();
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
    backgroundColor: "#f5f7fb",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

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

function getImportedPetStore() {
  if (!importedPetStore) {
    importedPetStore = createImportedPetStore({ userDataPath: app.getPath("userData") });
  }

  return importedPetStore;
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
      const filePath = resolveImportedPetAssetPath(getImportedPetStore().getImportedPetsRoot(), request.url);
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
  const window = getOrCreatePetWindow();
  window.setAlwaysOnTop(alwaysOnTop);
  updateTrayMenu();
  broadcastDesktopState();
}

function dispatchPetCommand(command) {
  const window = getOrCreatePetWindow();
  if (!window.isVisible()) {
    window.show();
  }
  window.webContents.send("desktop:pet-command", command);
  invalidatePetWindow();
}

function broadcastImportedPetsChanged() {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send("desktop:imported-pets-changed");
  }
}

async function importSelectedPetFolder(folderPath, options = {}) {
  const result = await getImportedPetStore().importPetFolder(folderPath, options);
  if (result.ok) {
    pendingPetImport = undefined;
    broadcastImportedPetsChanged();
    return result;
  }

  if (result.reason === "already-exists") {
    pendingPetImport = {
      folderPath,
      petId: result.petId
    };
  }

  return result;
}

function getTrayIconPath() {
  const candidates = [
    path.join(process.resourcesPath, "assets", "tray.ico"),
    path.join(process.resourcesPath, "assets", "tray.png"),
    path.join(__dirname, "..", "assets", "tray.ico"),
    path.join(__dirname, "..", "assets", "tray.png")
  ];
  return candidates.find((candidate) => fs.existsSync(candidate));
}

function getAppIconPath() {
  const candidates = [
    path.join(process.resourcesPath, "assets", "icon.icns"),
    path.join(process.resourcesPath, "assets", "icon.png"),
    path.join(process.resourcesPath, "assets", "tray.png"),
    path.join(__dirname, "..", "assets", "icon.icns"),
    path.join(__dirname, "..", "assets", "icon.png"),
    path.join(__dirname, "..", "assets", "tray.png")
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

ipcMain.handle("desktop:dispatch-pet-command", (_event, command) => {
  dispatchPetCommand(command);
});

ipcMain.handle("desktop:list-imported-pets", async () => {
  const index = await getImportedPetStore().readIndex();
  return index.pets;
});

ipcMain.handle("desktop:select-import-pet-folder", async (event) => {
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

  return importSelectedPetFolder(result.filePaths[0]);
});

ipcMain.handle("desktop:confirm-import-pet-folder-overwrite", async (_event, petId) => {
  if (!pendingPetImport || pendingPetImport.petId !== petId) {
    return {
      ok: false,
      reason: "no-pending-import"
    };
  }

  return importSelectedPetFolder(pendingPetImport.folderPath, { overwrite: true });
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

app.on("before-quit", () => {
  app.isQuitting = true;
  if (tray) {
    tray.destroy();
    tray = undefined;
  }
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  setMacDockIcon();
  registerImportedPetProtocol();
  createPetWindow();
  createTray();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createPetWindow();
    } else {
      setPetVisible(true);
    }
  });
});

app.on("window-all-closed", () => {
  if (isMac) {
    return;
  }

  if (!tray) {
    app.quit();
  }
});
