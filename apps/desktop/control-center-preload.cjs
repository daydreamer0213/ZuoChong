const { contextBridge, ipcRenderer } = require("electron");

const api = {
  getPetsState: () => ipcRenderer.invoke("openpets:get-pets-state"),
  getSettingsState: () => ipcRenderer.invoke("openpets:get-settings-state"),
  updatePreferences: (patch) => ipcRenderer.invoke("openpets:update-preferences", patch),
  getReactionAnimationSettings: () => ipcRenderer.invoke("openpets:get-reaction-animation-settings"),
  getLaunchAtLogin: () => ipcRenderer.invoke("openpets:get-launch-at-login"),
  setLaunchAtLogin: (enabled) => ipcRenderer.invoke("openpets:set-launch-at-login", enabled),
  getUpdateStatus: () => ipcRenderer.invoke("openpets:get-update-status"),
  checkForUpdates: () => ipcRenderer.invoke("openpets:check-for-updates"),
  openUpdateReleasePage: () => ipcRenderer.invoke("openpets:open-update-release-page"),
  resetDefaultPetPosition: () => ipcRenderer.invoke("openpets:reset-default-pet-position"),
  getCatalog: () => ipcRenderer.invoke("openpets:get-catalog"),
  getCatalogPage: (page) => ipcRenderer.invoke("openpets:get-catalog-page", page),
  getCatalogSearch: () => ipcRenderer.invoke("openpets:get-catalog-search"),
  getCodexPets: () => ipcRenderer.invoke("openpets:get-codex-pets"),
  setDefaultPet: (petId) => ipcRenderer.invoke("openpets:set-default-pet", petId),
  installPet: (petId) => ipcRenderer.invoke("openpets:install-pet", petId),
  importCodexPet: (petId) => ipcRenderer.invoke("openpets:import-codex-pet", petId),
  removePet: (petId) => ipcRenderer.invoke("openpets:remove-pet", petId),
};

contextBridge.exposeInMainWorld("openPetsControlCenter", api);
