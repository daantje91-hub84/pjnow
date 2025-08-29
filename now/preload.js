// preload.js
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  openFolderDialog: () => ipcRenderer.invoke("dialog:openDirectory"),
  loadNotes: (folderPath) => ipcRenderer.invoke("notes:load", folderPath),
  saveNote: (noteData) => ipcRenderer.invoke("notes:save", noteData),
  getSetting: (key) => ipcRenderer.invoke("settings:get", key),
  setSetting: (key, value) => ipcRenderer.invoke("settings:set", key, value),
  buildIndex: (notes) => ipcRenderer.invoke("notes:buildIndex", notes),
  // NEUE FUNKTION: Erlaubt dem Frontend, das Öffnen einer URL anzufordern
  openExternal: (url) => ipcRenderer.send("open-external-url", url),
});
