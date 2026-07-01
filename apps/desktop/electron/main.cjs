const { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

let petWindow;
let settingsWindow;
let tray;
let settingsOpen = false;
let petVisible = true;
let alwaysOnTop = true;

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
    resizable: false,
    show: false,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  petWindow.once("ready-to-show", () => {
    petVisible = true;
    petWindow.show();
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
        app.quit();
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

ipcMain.handle("desktop:show-context-menu", (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) {
    return;
  }

  buildDesktopMenu().popup({ window });
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
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
  if (process.platform === "darwin") {
    return;
  }

  if (!tray) {
    app.quit();
  }
});
