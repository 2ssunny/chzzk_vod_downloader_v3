/**
 * Download Manager
 * Manages download queue, state transitions, and IPC communication
 */

const { ipcMain } = require('electron');
const { DownloadThread } = require('./download');
const { DownloadM3u8Thread } = require('./download-m3u8');
const { MonitorThread } = require('./monitor');

const DownloadState = {
  WAITING: 'waiting',
  RUNNING: 'downloading',
  PAUSED: 'paused',
  FINISHED: 'finished',
  FAILED: 'failed',
};

class DownloadManager {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.currentDownload = null;
    this.monitor = null;

    this.setupIPC();
  }

  setupIPC() {
    ipcMain.handle('download:start', async (_, item) => {
      return this.start(item);
    });

    ipcMain.handle('download:pause', async (_, id) => {
      return this.pause();
    });

    ipcMain.handle('download:resume', async (_, id) => {
      return this.resume();
    });

    ipcMain.handle('download:stop', async (_, id) => {
      return this.stop();
    });
  }

  async start(item) {
    const downloadData = {
      id: item.id,
      baseUrl: item.baseUrl,
      vodUrl: item.url,
      outputPath: item.outputPath,
      resolution: item.resolution,
      contentType: item.contentType,
      liveRewindPlaybackJson: item.liveRewindPlaybackJson,
      state: DownloadState.RUNNING,

      // Progress tracking
      totalSize: 0,
      totalDownloadedSize: 0,
      startTime: Date.now(),
      endTime: 0,
      adjustThreads: 4,
      maxThreads: 4,
      completedThreads: 0,
      failedThreads: 0,
      totalRanges: 0,
      threadsProgress: [],
      completedProgress: 0,
      remainingRanges: [],
      prevSize: 0,
    };

    this.currentDownload = downloadData;

    try {
      let downloadThread;

      if (item.contentType === 'm3u8') {
        downloadThread = new DownloadM3u8Thread(downloadData);
      } else {
        downloadThread = new DownloadThread(downloadData);
      }

      this.currentDownload.thread = downloadThread;

      // Start monitor
      this.monitor = new MonitorThread(downloadData, (progressData) => {
        this.sendProgress(progressData);
      });

      // Set up completion/error handlers
      downloadThread.on('completed', () => {
        const downloadTime = this.monitor.getDownloadTime();
        this.monitor.stop();
        this.monitor = null;

        this.mainWindow?.webContents.send('download:complete', {
          id: downloadData.id,
          downloadTime,
        });

        this.currentDownload = null;
      });

      downloadThread.on('error', (error) => {
        if (this.monitor) {
          this.monitor.stop();
          this.monitor = null;
        }

        this.mainWindow?.webContents.send('download:error', {
          id: downloadData.id,
          error: error.message || 'Download failed',
        });

        this.currentDownload = null;
      });

      // Start download
      this.monitor.start();
      await downloadThread.start();
    } catch (err) {
      this.mainWindow?.webContents.send('download:error', {
        id: downloadData.id,
        error: err.message,
      });
      this.currentDownload = null;
    }
  }

  pause() {
    if (this.currentDownload) {
      this.currentDownload.state = DownloadState.PAUSED;
      if (this.currentDownload.pauseResolve) {
        // Don't resolve yet — keep paused
      }
    }
  }

  resume() {
    if (this.currentDownload) {
      this.currentDownload.state = DownloadState.RUNNING;
      if (this.currentDownload.pauseResolve) {
        this.currentDownload.pauseResolve();
        this.currentDownload.pauseResolve = null;
      }
    }
  }

  stop() {
    if (this.currentDownload) {
      this.currentDownload.state = DownloadState.WAITING;
      if (this.currentDownload.pauseResolve) {
        this.currentDownload.pauseResolve();
        this.currentDownload.pauseResolve = null;
      }
      if (this.currentDownload.thread) {
        this.currentDownload.thread.abort();
      }
      if (this.monitor) {
        this.monitor.stop();
        this.monitor = null;
      }
      this.currentDownload = null;
    }
  }

  sendProgress(progressData) {
    this.mainWindow?.webContents.send('download:progress', progressData);
  }
}

module.exports = { DownloadManager, DownloadState };
