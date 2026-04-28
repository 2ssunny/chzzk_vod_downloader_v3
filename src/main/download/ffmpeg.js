const { spawn } = require('child_process');
const ffmpegStatic = require('ffmpeg-static');
const fs = require('fs');
const path = require('path');

/**
 * Helper to parse time string (HH:MM:SS) to seconds
 */
function parseTimeToSeconds(timeStr) {
  const parts = timeStr.split(':').map(Number);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return Number(timeStr) || 0;
}

/**
 * Split a completed video file into multiple segments of duration
 * @param {string} inputPath - Original video file
 * @param {number} chunkDurationMinutes - Duration of each chunk in minutes
 * @param {function} onProgress - Progress callback (percentage 0-100)
 * @returns {Promise<string[]>} Array of output file paths
 */
function splitVideo(inputPath, chunkDurationMinutes, onProgress) {
  return new Promise((resolve, reject) => {
    const chunkDurationSeconds = chunkDurationMinutes * 60;
    
    const ext = path.extname(inputPath);
    const dir = path.dirname(inputPath);
    const base = path.basename(inputPath, ext);
    
    // Output pattern: "Original - 1.mp4", "Original - 2.mp4"
    const outputPattern = path.join(dir, `${base} - %d${ext}`);
    
    // Total duration for progress tracking
    // We don't have it easily without probing, but we can assume progress is proportional to time if we probe first.
    // To keep it simple, we use a basic progress indicator or emit 50% / 100%.
    // Splitting a local file with -c copy is extremely fast, usually seconds.
    
    const ffmpegPath = ffmpegStatic.replace('app.asar', 'app.asar.unpacked');
    
    const args = [
      '-i', inputPath,
      '-c', 'copy',
      '-f', 'segment',
      '-segment_time', chunkDurationSeconds.toString(),
      '-segment_start_number', '1',
      '-reset_timestamps', '1',
      outputPattern
    ];
    
    const proc = spawn(ffmpegPath, args);
    
    proc.stderr.on('data', (data) => {
      // Ffmpeg outputs to stderr. We could parse time=... for progress, but it's very fast.
      // E.g. time=00:05:30.00
      const output = data.toString();
      const timeMatch = output.match(/time=(\d+:\d+:\d+\.\d+)/);
      if (timeMatch && onProgress) {
        // Just send a "running" heartbeat since total duration isn't probed
        onProgress({ status: 'splitting', output: timeMatch[1] });
      }
    });
    
    proc.on('close', (code) => {
      if (code === 0) {
        // Find generated files
        try {
          const files = fs.readdirSync(dir);
          const generated = files.filter(f => f.startsWith(base + ' - ') && f.match(/ - \d+\.mp4$/));
          resolve(generated.map(f => path.join(dir, f)));
        } catch (e) {
          resolve([]);
        }
      } else {
        reject(new Error(`ffmpeg split failed with code ${code}`));
      }
    });
    
    proc.on('error', (err) => reject(err));
  });
}

/**
 * Download a specific segment of a remote stream using ffmpeg directly
 * @param {string} url - Manifest URL (m3u8 or dash)
 * @param {string} startTime - "HH:MM:SS"
 * @param {string} endTime - "HH:MM:SS"
 * @param {string} outputPath - Output file path
 * @param {function} onProgress - Progress callback (percentage)
 * @returns {Promise<void>}
 */
function downloadSegment(url, startTime, endTime, outputPath, onProgress) {
  return new Promise((resolve, reject) => {
    const startSec = parseTimeToSeconds(startTime);
    const endSec = parseTimeToSeconds(endTime);
    const duration = endSec - startSec;
    
    if (duration <= 0) {
      return reject(new Error('종료 시간이 시작 시간보다 같거나 빠릅니다.'));
    }
    
    const ffmpegPath = ffmpegStatic.replace('app.asar', 'app.asar.unpacked');
    
    // Add User-Agent header for remote streams
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    
    const args = [
      '-headers', `User-Agent: ${userAgent}\r\n`,
      '-ss', startTime,
      '-i', url,
      '-t', duration.toString(),
      '-c', 'copy',
      '-y', // Overwrite
      outputPath
    ];
    
    const proc = spawn(ffmpegPath, args);
    let lastPercent = 0;
    
    proc.stderr.on('data', (data) => {
      const output = data.toString();
      const timeMatch = output.match(/time=(\d+):(\d+):(\d+\.\d+)/);
      if (timeMatch && onProgress) {
        const h = parseInt(timeMatch[1], 10);
        const m = parseInt(timeMatch[2], 10);
        const s = parseFloat(timeMatch[3]);
        const currentSec = h * 3600 + m * 60 + s;
        
        let percent = Math.floor((currentSec / duration) * 100);
        if (percent > 100) percent = 100;
        
        // Only trigger update if changed significantly
        if (percent > lastPercent) {
          lastPercent = percent;
          onProgress({ percent });
        }
      }
    });
    
    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`ffmpeg segment download failed with code ${code}`));
      }
    });
    
    proc.on('error', (err) => reject(err));
  });
}

module.exports = {
  splitVideo,
  downloadSegment,
  parseTimeToSeconds
};
