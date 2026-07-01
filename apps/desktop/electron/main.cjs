const { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage } = require("electron");
const path = require("node:path");

let mainWindow;
let tray;
let settingsOpen = false;
let alwaysOnTop = true;

function createMainWindow() {
  mainWindow = new BrowserWindow({
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

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.on("closed", () => {
    mainWindow = undefined;
  });

  const devUrl = process.env.AI_PETS_DESKTOP_DEV_URL;
  if (devUrl) {
    void mainWindow.loadURL(devUrl);
  } else {
    void mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  return mainWindow;
}

function getOrCreateMainWindow() {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : createMainWindow();
}

function setSettingsOpen(open) {
  const window = getOrCreateMainWindow();
  settingsOpen = Boolean(open);
  window.setResizable(true);
  window.setSize(settingsOpen ? 560 : 260, settingsOpen ? 420 : 340, false);
  window.setResizable(false);
  window.show();
  window.webContents.send("desktop:set-settings-open", settingsOpen);
  updateTrayMenu();
}

function toggleSettings() {
  setSettingsOpen(!settingsOpen);
}

function setPetVisible(visible) {
  const window = getOrCreateMainWindow();
  if (visible) {
    window.show();
    window.focus();
  } else {
    window.hide();
  }
  updateTrayMenu();
}

function togglePetVisible() {
  const window = getOrCreateMainWindow();
  setPetVisible(!window.isVisible());
}

function setAlwaysOnTop(enabled) {
  alwaysOnTop = Boolean(enabled);
  const window = getOrCreateMainWindow();
  window.setAlwaysOnTop(alwaysOnTop);
  updateTrayMenu();
}

function createTrayIcon() {
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

function buildDesktopMenu(window) {
  return Menu.buildFromTemplate([
    {
      label: settingsOpen ? "\u5173\u95ed\u8bbe\u7f6e" : "\u6253\u5f00\u8bbe\u7f6e",
      click: toggleSettings
    },
    {
      label: window?.isVisible() ? "\u9690\u85cf\u5ba0\u7269" : "\u663e\u793a\u5ba0\u7269",
      click: togglePetVisible
    },
    {
      label: "\u7a97\u53e3\u7f6e\u9876",
      type: "checkbox",
      checked: alwaysOnTop,
      click: (item) => setAlwaysOnTop(item.checked)
    },
    { type: "separator" },
    {
      label: "\u9000\u51fa AI-Pets",
      click: () => app.quit()
    }
  ]);
}

function updateTrayMenu() {
  if (!tray) {
    return;
  }

  const window = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;
  tray.setContextMenu(buildDesktopMenu(window));
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

ipcMain.handle("desktop:show-context-menu", (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) {
    return;
  }

  buildDesktopMenu(window).popup({ window });
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createMainWindow();
  createTray();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
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
