const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("aiPetsDesktop", {
  getWindowPosition: () => ipcRenderer.invoke("desktop:get-window-position"),
  moveWindow: (position) => ipcRenderer.invoke("desktop:move-window", position),
  setSettingsOpen: (open) => ipcRenderer.invoke("desktop:set-settings-open", open),
  showContextMenu: () => ipcRenderer.invoke("desktop:show-context-menu"),
  onToggleSettings: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("desktop:toggle-settings", listener);
    return () => ipcRenderer.removeListener("desktop:toggle-settings", listener);
  }
});
