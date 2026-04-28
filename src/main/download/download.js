/**
 * DASH/Direct file download thread
 * Ported from download.py — multi-threaded HTTP Range download
 */

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

class DownloadThread extends EventEmitter {
  constructor(data) {
    super();
    this.data = data;
    this.aborted = false;
    this.controllers = []; // AbortControllers for active fetches
  }

  async start() {
    try {
      // 1. Get total file size
      const totalSize = await this.getTotalSize();
      this.data.totalSize = totalSize;

      // 2. Decide part size based on resolution
      const partSize = this.decidePartSize();

      // 3. Calculate byte ranges
      const ranges = [];
      for (let i = 0; i * partSize < totalSize; i++) {
        const start = i * partSize;
        const end = Math.min((i + 1) * partSize - 1, totalSize - 1);
        ranges.push({ start, end, index: i });
      }

      this.data.totalRanges = ranges.length;
      this.data.maxThreads = ranges.length;
      this.data.adjustThreads = Math.min(this.data.adjustThreads, this.data.maxThreads);
      this.data.threadsProgress = new Array(ranges.length).fill(0);
      this.data.remainingRanges = [...ranges];
      this.data.startTime = Date.now();

      // 4. Create empty output file
      fs.writeFileSync(this.data.outputPath, Buffer.alloc(0));

      // 5. Run download with concurrency control
      await this.downloadWithConcurrency();

      if (!this.aborted && this.data.state !== 'waiting') {
        this.data.endTime = Date.now();
        this.emit('completed');
      }
    } catch (err) {
      if (!this.aborted) {
        // Clean up partial file
        if (fs.existsSync(this.data.outputPath)) {
          try { fs.unlinkSync(this.data.outputPath); } catch (_) {}
        }
        this.emit('error', err);
      }
    }
  }

  async downloadWithConcurrency() {
    const maxConcurrent = this.data.adjustThreads;
    const activeDownloads = new Map();

    while (
      (this.data.remainingRanges.length > 0 || activeDownloads.size > 0) &&
      !this.aborted &&
      this.data.state !== 'waiting'
    ) {
      // Fill up to max concurrent
      while (
        activeDownloads.size < maxConcurrent &&
        this.data.remainingRanges.length > 0 &&
        !this.aborted
      ) {
        const range = this.data.remainingRanges.shift();
        const promise = this.downloadPart(range.start, range.end, range.index)
          .then(() => {
            activeDownloads.delete(range.index);
          })
          .catch((err) => {
            activeDownloads.delete(range.index);
            // Retry: push back to remaining
            this.data.failedThreads++;
            this.data.threadsProgress[range.index] = 0;
            this.data.remainingRanges.push(range);
          });

        activeDownloads.set(range.index, promise);
      }

      // Wait for any one to complete
      if (activeDownloads.size > 0) {
        await Promise.race(activeDownloads.values());
      }

      // Small delay to prevent tight loop
      await this.sleep(50);
    }

    // Clean up if aborted
    if (this.aborted || this.data.state === 'waiting') {
      if (fs.existsSync(this.data.outputPath)) {
        try { fs.unlinkSync(this.data.outputPath); } catch (_) {}
      }
    }
  }

  async downloadPart(start, end, partNum) {
    let downloadedSize = 0;
    let slowCount = 0;

    const controller = new AbortController();
    this.controllers.push(controller);

    try {
      const response = await fetch(this.data.baseUrl, {
        headers: { Range: `bytes=${start}-${end}` },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const fd = fs.openSync(this.data.outputPath, 'r+');
      let writePos = start;
      const partStartTime = Date.now();

      try {
        while (true) {
          if (this.aborted || this.data.state === 'waiting') {
            reader.cancel();
            break;
          }

          // Handle pause
          while (this.data.state === 'paused' && !this.aborted) {
            await this.sleep(100);
          }

          const { done, value } = await reader.read();
          if (done) break;

          fs.writeSync(fd, value, 0, value.length, writePos);
          writePos += value.length;
          downloadedSize += value.length;

          // Update progress
          this.data.threadsProgress[partNum] = downloadedSize;
          this.updateTotalProgress();

          // Check speed
          const elapsed = (Date.now() - partStartTime) / 1000;
          if (elapsed > 0) {
            const speedKBs = downloadedSize / elapsed / 1024;
            if (speedKBs < 100) {
              slowCount++;
              if (slowCount > 5) {
                // Too slow, restart this part
                this.data.threadsProgress[partNum] = 0;
                this.data.remainingRanges.push({ start: writePos, end, index: partNum });
                break;
              }
            } else {
              slowCount = 0;
            }
          }
        }
      } finally {
        fs.closeSync(fd);
      }

      // Mark as completed if fully downloaded
      if (downloadedSize >= end - start + 1) {
        this.data.completedThreads++;
        this.data.completedProgress += downloadedSize;
        this.data.threadsProgress[partNum] = 0;
      }
    } finally {
      const idx = this.controllers.indexOf(controller);
      if (idx !== -1) this.controllers.splice(idx, 1);
    }
  }

  async getTotalSize() {
    // Try HEAD first
    let response = await fetch(this.data.baseUrl, { method: 'HEAD' });
    let size = parseInt(response.headers.get('content-length') || '0');

    if (size === 0) {
      // Fallback to GET
      response = await fetch(this.data.baseUrl);
      size = parseInt(response.headers.get('content-length') || '0');
    }

    return size;
  }

  decidePartSize() {
    const base = 1024 * 1024; // 1MB
    if (this.data.contentType === 'clip') return base;
    if (this.data.resolution === 144) return base;
    if (this.data.resolution <= 480) return base * 2;
    if (this.data.resolution === 720) return base * 5;
    return base * 10;
  }

  updateTotalProgress() {
    const activeSize = this.data.threadsProgress.reduce((sum, p) => sum + p, 0);
    this.data.totalDownloadedSize = this.data.completedProgress + activeSize;
  }

  abort() {
    this.aborted = true;
    this.controllers.forEach((c) => {
      try { c.abort(); } catch (_) {}
    });
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

module.exports = { DownloadThread };
