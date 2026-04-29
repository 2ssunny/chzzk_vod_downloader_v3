const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const config = require('./config/config');
const { fetchContentData } = require('./api/content');
const { searchChannels, getChannelVideos, getChannelClips } = require('./api/search');
const { loadEndpoints } = require('./api/remote-config');
const { DownloadManager } = require('./download/manager');
const { LocalServer } = require('./http-server');

let mainWindow = null;
let downloadManager = null;
let localServer = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    icon: path.join(__dirname, '../media/logo.png'),
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

  // Open target="_blank" links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    require('electron').shell.openExternal(url);
    return { action: 'deny' };
  });

  // Initialize download manager with window reference
  downloadManager = new DownloadManager(mainWindow);
  
  // Initialize Local Server
  const cfg = config.loadConfig();
  localServer = new LocalServer(mainWindow, cfg.localServer?.port || 11025);
  if (cfg.localServer?.enabled !== false) {
    localServer.start();
  }
}

// ============ IPC Handlers ============

ipcMain.handle('app:version', () => app.getVersion());

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
  
  if (newConfig.localServer?.enabled !== false) {
    localServer?.start();
  } else {
    localServer?.stop();
  }
  
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

// Search
ipcMain.handle('search:channels', async (_, keyword, offset, size) => {
  try {
    return await searchChannels(keyword, offset, size);
  } catch (err) {
    return { error: err.message, channels: [] };
  }
});

ipcMain.handle('search:channelVideos', async (_, channelId, page, size) => {
  try {
    return await getChannelVideos(channelId, page, size);
  } catch (err) {
    return { error: err.message, videos: [] };
  }
});

ipcMain.handle('search:channelClips', async (_, channelId, page, size) => {
  try {
    return await getChannelClips(channelId, page, size);
  } catch (err) {
    return { error: err.message, clips: [] };
  }
});

// ============ App lifecycle ============

app.whenReady().then(async () => {
  // Load remote API config on startup
  const appConfig = config.loadConfig();
  await loadEndpoints(appConfig);

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
