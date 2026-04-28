const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const config = require('./config/config');
const { fetchContentData } = require('./api/content');
const { DownloadManager } = require('./download/manager');

let mainWindow = null;
let downloadManager = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    icon: path.join(__dirname, '../../resources/chzzk.ico'),
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    frame: false,
    backgroundColor: '#0f0f14',
    show: false,
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    downloadManager = null;
  });

  // Initialize download manager with window reference
  downloadManager = new DownloadManager(mainWindow);
}

// ============ IPC Handlers ============

// Window controls
ipcMain.on('window:minimize', () => mainWindow?.minimize());
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});
ipcMain.on('window:close', () => mainWindow?.close());

// Dialog
ipcMain.handle('dialog:openDirectory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
  });
  return result.canceled ? null : result.filePaths[0];
});

// Config
ipcMain.handle('config:load', () => config.loadConfig());
ipcMain.handle('config:save', (_, newConfig) => {
  config.saveConfig(newConfig);
  return true;
});

// Content (VOD metadata fetch)
ipcMain.handle('content:fetch', async (_, url, cookies, downloadPath) => {
  try {
    const result = await fetchContentData(url, cookies, downloadPath);
    return result;
  } catch (err) {
    return { error: err.message };
  }
});

// ============ App lifecycle ============

app.whenReady().then(() => {
  createWindow();
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
