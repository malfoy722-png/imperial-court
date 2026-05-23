const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('courtDesktop', {
  appendLog: (entry) => ipcRenderer.invoke('court:append-log', entry),
  loadLatestSave: () => ipcRenderer.invoke('court:load-latest-save'),
  loadSettings: () => ipcRenderer.invoke('court:load-settings'),
  saveGame: (slot) => ipcRenderer.invoke('court:save-game', slot),
  saveSettings: (settings) => ipcRenderer.invoke('court:save-settings', settings),
  advanceCourtScene: (payload) => ipcRenderer.invoke('court:advance-scene', payload),
  generateAudienceAgenda: (payload) => ipcRenderer.invoke('court:generate-agenda', payload),
  resolveTurn: (payload) => ipcRenderer.invoke('court:resolve-turn', payload),
})
