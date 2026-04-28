/**
 * Download speed/progress monitor
 * Periodically calculates speed, remaining time, and progress percentage
 */

class MonitorThread {
  constructor(data, onProgress) {
    this.data = data;
    this.onProgress = onProgress;
    this.interval = null;
    this.startTime = Date.now();
  }

  start() {
    this.startTime = Date.now();
    this.data.prevSize = 0;

    this.interval = setInterval(() => {
      this.updateProgress();
    }, 500); // Update every 500ms
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  updateProgress() {
    if (this.data.state === 'paused' || this.data.state === 'waiting') return;

    const totalSize = this.data.totalSize;
    const downloaded = this.data.totalDownloadedSize;
    const prevSize = this.data.prevSize || 0;

    // Calculate speed (bytes per second over last interval)
    const deltaBytes = downloaded - prevSize;
    const speedBps = deltaBytes * 2; // Since interval is 500ms
    this.data.prevSize = downloaded;

    // Calculate progress percentage
    let progress = 0;
    if (this.data.contentType === 'm3u8') {
      // For m3u8, progress is based on completed segments
      progress =
        this.data.totalRanges > 0
          ? Math.floor(
              (this.data.completedThreads / this.data.totalRanges) * 100
            )
          : 0;
    } else {
      progress = totalSize > 0 ? Math.floor((downloaded / totalSize) * 100) : 0;
    }
    progress = Math.min(progress, 100);

    // Calculate remaining time
    let remainTime = '--:--:--';
    if (speedBps > 0) {
      let remainingBytes;
      if (this.data.contentType === 'm3u8') {
        const remainingSegments =
          this.data.totalRanges - this.data.completedThreads;
        // Estimate based on average segment download time
        const elapsed = (Date.now() - this.startTime) / 1000;
        const avgTimePerSegment =
          this.data.completedThreads > 0
            ? elapsed / this.data.completedThreads
            : 0;
        const remainSec = avgTimePerSegment * remainingSegments;
        remainTime = this.formatTime(remainSec);
      } else {
        remainingBytes = totalSize - downloaded;
        const remainSec = remainingBytes / speedBps;
        remainTime = this.formatTime(remainSec);
      }
    }

    // Format speed
    const speed = this.formatSpeed(speedBps);

    // Format downloaded size
    const downloadedSize = this.formatSize(downloaded);

    this.onProgress({
      id: this.data.id,
      progress,
      speed,
      remainTime,
      downloadedSize,
    });
  }

  getDownloadTime() {
    const elapsed = ((this.data.endTime || Date.now()) - this.startTime) / 1000;
    return this.formatTime(elapsed);
  }

  formatTime(seconds) {
    if (!isFinite(seconds) || seconds < 0) return '--:--:--';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  formatSpeed(bytesPerSec) {
    if (bytesPerSec <= 0) return '0 B/s';
    const units = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
    let idx = 0;
    let speed = bytesPerSec;
    while (speed >= 1024 && idx < units.length - 1) {
      speed /= 1024;
      idx++;
    }
    return `${speed.toFixed(1)} ${units[idx]}`;
  }

  formatSize(bytes) {
    if (!bytes || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let idx = 0;
    let size = bytes;
    while (size >= 1024 && idx < units.length - 1) {
      size /= 1024;
      idx++;
    }
    return `${size.toFixed(2)} ${units[idx]}`;
  }
}

module.exports = { MonitorThread };
