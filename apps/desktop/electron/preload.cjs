const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("aiPetsDesktop", {
  getWindowPosition: () => ipcRenderer.invoke("desktop:get-window-position"),
  moveWindow: (position) => ipcRenderer.invoke("desktop:move-window", position),
  setSettingsOpen: (open) => ipcRenderer.invoke("desktop:set-settings-open", open),
  setPetVisible: (visible) => ipcRenderer.invoke("desktop:set-pet-visible", visible),
  setAlwaysOnTop: (enabled) => ipcRenderer.invoke("desktop:set-always-on-top", enabled),
  getDesktopState: () => ipcRenderer.invoke("desktop:get-state"),
  dispatchPetCommand: (command) => ipcRenderer.invoke("desktop:dispatch-pet-command", command),
  showContextMenu: () => ipcRenderer.invoke("desktop:show-context-menu"),
  onDesktopState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("desktop:state", listener);
    return () => ipcRenderer.removeListener("desktop:state", listener);
  },
  onPetCommand: (callback) => {
    const listener = (_event, command) => callback(command);
    ipcRenderer.on("desktop:pet-command", listener);
    return () => ipcRenderer.removeListener("desktop:pet-command", listener);
  }
});
