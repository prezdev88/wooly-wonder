const { app, BrowserWindow, ipcMain, dialog, protocol, net, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');
const isDev = process.env.NODE_ENV === 'development';

// Setup data directories
const dataDir = path.join(app.getPath('userData'), 'pixel-it-data');
const imagesDir = path.join(dataDir, 'images');
const dbPath = path.join(dataDir, 'projects.json');
const settingsPath = path.join(dataDir, 'settings.json');

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });
if (!fs.existsSync(dbPath)) fs.writeFileSync(dbPath, JSON.stringify({ projects: [] }));
if (!fs.existsSync(settingsPath)) fs.writeFileSync(settingsPath, JSON.stringify({}));

protocol.registerSchemesAsPrivileged([
  { scheme: 'pixelit', privileges: { standard: true, secure: true, supportFetchAPI: true, bypassCSP: true, corsEnabled: true } }
]);

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    icon: path.join(__dirname, '../public/icons/512x512.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false // Disabled to easily load local file:// urls
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  protocol.handle('pixelit', (request) => {
    let urlPath = request.url.slice('pixelit://'.length);
    let filePath = decodeURIComponent(urlPath);
    if (!filePath.startsWith('/')) {
      filePath = '/' + filePath;
    }
    return net.fetch('file://' + filePath);
  });

  createWindow();

  // Check for updates silently in the background
  if (!isDev) {
    autoUpdater.checkForUpdatesAndNotify();
  }

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// IPC Handlers for Data Management
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('get-projects', () => {
  return JSON.parse(fs.readFileSync(dbPath, 'utf8')).projects;
});

ipcMain.handle('save-project', (event, project) => {
  const data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  const idx = data.projects.findIndex(p => p.id === project.id);
  if (idx >= 0) {
    data.projects[idx] = project;
  } else {
    data.projects.push(project);
  }
  fs.writeFileSync(dbPath, JSON.stringify(data));
  return data.projects;
});

ipcMain.handle('delete-project', (event, projectId) => {
  const data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  data.projects = data.projects.filter(p => p.id !== projectId);
  fs.writeFileSync(dbPath, JSON.stringify(data));
  return data.projects;
});

ipcMain.handle('get-settings', () => {
  return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
});

ipcMain.handle('save-settings', (event, settings) => {
  fs.writeFileSync(settingsPath, JSON.stringify(settings));
  return true;
});

ipcMain.handle('save-image', (event, { base64Data, filename }) => {
  const filePath = path.join(imagesDir, filename);
  const base64Image = base64Data.split(';base64,').pop();
  fs.writeFileSync(filePath, base64Image, { encoding: 'base64' });
  // Ensure we format the path correctly for URLs (handle Windows backslashes)
  const normalizedPath = filePath.replace(/\\/g, '/');
  return `file://${normalizedPath}`;
});

ipcMain.handle('show-open-dialog', async (event, options) => {
  return await dialog.showOpenDialog(options);
});

ipcMain.handle('save-pdf', async (event, { base64Data, filename }) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    defaultPath: filename,
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  });
  if (!canceled && filePath) {
    const base64Content = base64Data.split(';base64,').pop();
    fs.writeFileSync(filePath, base64Content, { encoding: 'base64' });
    shell.openPath(filePath);
    return true;
  }
  return false;
});

ipcMain.on('close-app', () => {
  app.quit();
});

ipcMain.on('minimize-app', () => {
  BrowserWindow.getAllWindows()[0].minimize();
});
