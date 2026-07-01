const { app, BrowserWindow, ipcMain, Menu } = require("electron");
const path = require("node:path");

let mainWindow;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 260,
    height: 340,
    minWidth: 220,
    minHeight: 280,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
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

  const devUrl = process.env.AI_PETS_DESKTOP_DEV_URL;
  if (devUrl) {
    void mainWindow.loadURL(devUrl);
  } else {
    void mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  return mainWindow;
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

ipcMain.handle("desktop:set-settings-open", (event, open) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) {
    return;
  }

  window.setResizable(true);
  window.setSize(open ? 560 : 260, open ? 420 : 340, false);
  window.setResizable(false);
});

ipcMain.handle("desktop:show-context-menu", (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) {
    return;
  }

  Menu.buildFromTemplate([
    {
      label: "打开/关闭设置",
      click: () => window.webContents.send("desktop:toggle-settings")
    },
    { type: "separator" },
    {
      label: "退出 AI-Pets",
      click: () => app.quit()
    }
  ]).popup({ window });
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
