const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getProjects: () => ipcRenderer.invoke('get-projects'),
  saveProject: (project) => ipcRenderer.invoke('save-project', project),
  deleteProject: (projectId) => ipcRenderer.invoke('delete-project', projectId),
  saveImage: (data) => ipcRenderer.invoke('save-image', data),
  showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options),
  savePdf: (data) => ipcRenderer.invoke('save-pdf', data),
  closeApp: () => ipcRenderer.send('close-app'),
  minimizeApp: () => ipcRenderer.send('minimize-app'),
});
