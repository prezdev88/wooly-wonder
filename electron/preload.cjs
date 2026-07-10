const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getProjects: () => ipcRenderer.invoke('get-projects'),
  saveProject: (project) => ipcRenderer.invoke('save-project', project),
  deleteProject: (projectId) => ipcRenderer.invoke('delete-project', projectId),
  saveImage: (data) => ipcRenderer.invoke('save-image', data),
  showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options),
});
