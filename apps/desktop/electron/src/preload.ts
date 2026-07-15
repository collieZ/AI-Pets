const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("aiPetsDesktop", {
  getWindowPosition: () => ipcRenderer.invoke("desktop:get-window-position"),
  moveWindow: (position) => ipcRenderer.invoke("desktop:move-window", position),
  setSettingsOpen: (open) => ipcRenderer.invoke("desktop:set-settings-open", open),
  setPetVisible: (visible) => ipcRenderer.invoke("desktop:set-pet-visible", visible),
  setAlwaysOnTop: (enabled) => ipcRenderer.invoke("desktop:set-always-on-top", enabled),
  getDesktopState: () => ipcRenderer.invoke("desktop:get-state"),
  getPreferences: () => ipcRenderer.invoke("desktop:get-preferences"),
  resetPreferences: () => ipcRenderer.invoke("desktop:reset-preferences"),
  dispatchPetCommand: (command) => ipcRenderer.invoke("desktop:dispatch-pet-command", command),
  listImportedPets: () => ipcRenderer.invoke("desktop:list-imported-pets"),
  selectImportPetFolder: () => ipcRenderer.invoke("desktop:select-import-pet-folder"),
  confirmImportPetFolder: (token) => ipcRenderer.invoke("desktop:confirm-import-pet-folder", token),
  cancelImportPetFolder: (token) => ipcRenderer.invoke("desktop:cancel-import-pet-folder", token),
  deleteImportedPet: (petId) => ipcRenderer.invoke("desktop:delete-imported-pet", petId),
  openPetDataDirectory: () => ipcRenderer.invoke("desktop:open-pet-data-directory"),
  openPetQuarantineDirectory: () => ipcRenderer.invoke("desktop:open-pet-quarantine-directory"),
  getRecoverySummary: () => ipcRenderer.invoke("desktop:get-recovery-summary"),
  showContextMenu: () => ipcRenderer.invoke("desktop:show-context-menu"),
  invalidatePetWindow: () => ipcRenderer.invoke("desktop:invalidate-pet-window"),
  getPlatform: () => Promise.resolve(process.platform),
  controlSettingsWindow: (action) => ipcRenderer.invoke("desktop:control-settings-window", action),
  onDesktopState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("desktop:state", listener);
    return () => ipcRenderer.removeListener("desktop:state", listener);
  },
  onPetCommand: (callback) => {
    const listener = (_event, command) => callback(command);
    ipcRenderer.on("desktop:pet-command", listener);
    return () => ipcRenderer.removeListener("desktop:pet-command", listener);
  },
  onImportedPetsChanged: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("desktop:imported-pets-changed", listener);
    return () => ipcRenderer.removeListener("desktop:imported-pets-changed", listener);
  }
});
