const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:maximize'),
  closeWindow: () => ipcRenderer.send('window:close'),

  // System
  getAppVersion: () => ipcRenderer.invoke('app:version'),

  // Dialog
  openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),

  // Config
  loadConfig: () => ipcRenderer.invoke('config:load'),
  saveConfig: (config) => ipcRenderer.invoke('config:save', config),

  // Content (VOD metadata)
  fetchContent: (url, cookies, downloadPath) =>
    ipcRenderer.invoke('content:fetch', url, cookies, downloadPath),

  // Download
  startDownload: (item) => ipcRenderer.invoke('download:start', item),
  pauseDownload: (id) => ipcRenderer.invoke('download:pause', id),
  resumeDownload: (id) => ipcRenderer.invoke('download:resume', id),
  stopDownload: (id) => ipcRenderer.invoke('download:stop', id),

  // Download progress listener
  onDownloadProgress: (callback) => {
    ipcRenderer.on('download:progress', (_, data) => callback(data));
  },
  onDownloadComplete: (callback) => {
    ipcRenderer.on('download:complete', (_, data) => callback(data));
  },
  onDownloadError: (callback) => {
    ipcRenderer.on('download:error', (_, data) => callback(data));
  },

  // Search
  searchChannels: (keyword, offset, size) =>
    ipcRenderer.invoke('search:channels', keyword, offset, size),
  getChannelVideos: (channelId, page, size) =>
    ipcRenderer.invoke('search:channelVideos', channelId, page, size),
  getChannelClips: (channelId, page, size) =>
    ipcRenderer.invoke('search:channelClips', channelId, page, size),
    
  // External Integration
  onExternalAddUrl: (callback) => {
    ipcRenderer.on('external:add-url', (_, url) => callback(url));
  },
});
