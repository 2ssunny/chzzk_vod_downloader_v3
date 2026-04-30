/**
 * m3u8 segment download thread
 * Ported from download_m3u8.py
 */

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const { getVideoM3u8BaseUrl, getVideoInfo, extractContentNo } = require('../api/content');
const { client } = require('../api/client');
const config = require('../config/config');

class DownloadM3u8Thread extends EventEmitter {
  constructor(data) {
    super();
    this.data = data;
    this.aborted = false;
    this.controllers = [];
    this.tempDir = '';
  }

  async start() {
    try {
      // Load cookies
      const appConfig = config.loadConfig();
      const cookies = appConfig.cookies || {};
      client.setCookies(cookies);

      // Get m3u8 base URL for the selected resolution
      const { contentType, contentNo } = extractContentNo(this.data.vodUrl);
      const info = await getVideoInfo(contentNo, cookies);
      this.data.baseUrl = await getVideoM3u8BaseUrl(
        info.liveRewindPlaybackJson,
        this.data.resolution
      );

      this.data.startTime = Date.now();

      // Fetch m3u8 playlist
      const playlistText = await client.fetchText(this.data.baseUrl);
      const lines = playlistText.split('\n');
      let segments = lines.filter((l) => l.trim() && !l.startsWith('#'));

      // Find init segment
      let initSegmentUri = null;
      for (const line of lines) {
        if (line.startsWith('#EXT-X-MAP:')) {
          const match = line.match(/URI="([^"]+)"/);
          if (match) initSegmentUri = match[1];
        }
      }

      // Filter segments by time range if split_part is requested
      if (this.data.splitData && this.data.splitData.type === 'split_part') {
        const startSec = this.parseTime(this.data.splitData.start);
        const endSec = this.parseTime(this.data.splitData.end);
        
        let currentTime = 0;
        const filteredSegments = [];
        let segIdx = 0;
        
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].startsWith('#EXTINF:')) {
            const durationMatch = lines[i].match(/#EXTINF:([\d.]+)/);
            const segDuration = durationMatch ? parseFloat(durationMatch[1]) : 0;
            const segUrl = lines[i + 1]?.trim();
            
            if (segUrl && !segUrl.startsWith('#')) {
              const segStart = currentTime;
              const segEnd = currentTime + segDuration;
              
              if (segEnd > startSec && segStart < endSec) {
                filteredSegments.push(segUrl);
              }
              currentTime = segEnd;
              segIdx++;
            }
          }
        }
        
        if (filteredSegments.length === 0) {
          throw new Error('해당 구간에 세그먼트가 없습니다.');
        }
        
        segments = filteredSegments;
      }

      this.data.totalRanges = segments.length;
      this.data.maxThreads = segments.length;
      this.data.adjustThreads = Math.min(this.data.adjustThreads, this.data.maxThreads);
      this.data.threadsProgress = new Array(segments.length).fill(0);
      this.data.remainingRanges = segments.map((seg, idx) => ({ index: idx, segment: seg }));

      // Create temp directory
      this.tempDir = path.join(path.dirname(this.data.outputPath), 'CVDv3_temp');
      if (fs.existsSync(this.tempDir)) {
        fs.rmSync(this.tempDir, { recursive: true, force: true });
      }
      fs.mkdirSync(this.tempDir, { recursive: true });

      const width = String(segments.length).length;

      // Download init segment
      if (initSegmentUri) {
        const initUrl = this.resolveUrl(this.data.baseUrl, initSegmentUri);
        const initResp = await fetch(initUrl);
        const initData = Buffer.from(await initResp.arrayBuffer());
        const initPath = path.join(this.tempDir, `${'0'.padStart(width, '0')}.m4s`);
        fs.writeFileSync(initPath, initData);
      }

      // Download segments concurrently
      await this.downloadSegments(width);

      if (!this.aborted && this.data.state !== 'waiting') {
        // Merge segments
        this.data.merging = true;
        await this.mergeSegments();

        // Clean up temp
        fs.rmSync(this.tempDir, { recursive: true, force: true });

        this.data.endTime = Date.now();
        this.emit('completed');
      }
    } catch (err) {
      // Clean up on error
      this.cleanup();
      if (!this.aborted) {
        this.emit('error', err);
      }
    }
  }

  async downloadSegments(width) {
    const maxConcurrent = this.data.adjustThreads;
    const activeDownloads = new Map();

    while (
      (this.data.remainingRanges.length > 0 || activeDownloads.size > 0) &&
      !this.aborted &&
      this.data.state !== 'waiting'
    ) {
      while (
        activeDownloads.size < maxConcurrent &&
        this.data.remainingRanges.length > 0 &&
        !this.aborted
      ) {
        const item = this.data.remainingRanges.shift();
        const promise = this.downloadSegment(item.index, item.segment, width)
          .then(() => activeDownloads.delete(item.index))
          .catch(() => {
            activeDownloads.delete(item.index);
            this.data.failedThreads++;
            this.data.threadsProgress[item.index] = 0;
            this.data.remainingRanges.push(item);
          });

        activeDownloads.set(item.index, promise);
      }

      if (activeDownloads.size > 0) {
        await Promise.race(activeDownloads.values());
      }

      await this.sleep(50);
    }
  }

  async downloadSegment(index, segment, width) {
    const segmentUrl = this.resolveUrl(this.data.baseUrl, segment);
    const controller = new AbortController();
    this.controllers.push(controller);

    let downloadedSize = 0;

    try {
      const response = await fetch(segmentUrl, {
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const reader = response.body.getReader();
      const filePath = path.join(this.tempDir, `${String(index + 1).padStart(width, '0')}.m4v`);
      const chunks = [];

      while (true) {
        if (this.aborted || this.data.state === 'waiting') {
          reader.cancel();
          break;
        }

        while (this.data.state === 'paused' && !this.aborted) {
          await this.sleep(100);
        }

        const { done, value } = await reader.read();
        if (done) break;

        chunks.push(value);
        downloadedSize += value.length;
        this.data.threadsProgress[index] = downloadedSize;
        this.updateTotalProgress();
      }

      // Write file
      if (!this.aborted && this.data.state !== 'waiting') {
        fs.writeFileSync(filePath, Buffer.concat(chunks));
        this.data.completedThreads++;
        this.data.completedProgress += downloadedSize;
        this.data.threadsProgress[index] = 0;
      }
    } finally {
      const idx = this.controllers.indexOf(controller);
      if (idx !== -1) this.controllers.splice(idx, 1);
    }
  }

  async mergeSegments() {
    const files = fs.readdirSync(this.tempDir).sort();
    const writeStream = fs.createWriteStream(this.data.outputPath);

    for (const file of files) {
      if (this.aborted || this.data.state === 'waiting') break;

      while (this.data.state === 'paused' && !this.aborted) {
        await this.sleep(100);
      }

      const filePath = path.join(this.tempDir, file);
      const content = fs.readFileSync(filePath);
      writeStream.write(content);

      // Remove segment after merge
      try { fs.unlinkSync(filePath); } catch (_) {}
    }

    writeStream.end();
    await new Promise((resolve) => writeStream.on('finish', resolve));
  }

  cleanup() {
    if (this.tempDir && fs.existsSync(this.tempDir)) {
      try { fs.rmSync(this.tempDir, { recursive: true, force: true }); } catch (_) {}
    }
    if (fs.existsSync(this.data.outputPath)) {
      try { fs.unlinkSync(this.data.outputPath); } catch (_) {}
    }
  }

  resolveUrl(base, relative) {
    if (relative.startsWith('http')) return relative;
    return new URL(relative, base).href;
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
    this.cleanup();
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  parseTime(timeStr) {
    const parts = timeStr.split(':').map(Number);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return Number(timeStr) || 0;
  }
}

module.exports = { DownloadM3u8Thread };
