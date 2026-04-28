// ============ Tab Navigation ============
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

tabBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    const tabId = btn.dataset.tab;

    tabBtns.forEach((b) => b.classList.remove('active'));
    tabContents.forEach((c) => c.classList.remove('active'));

    btn.classList.add('active');
    document.getElementById(`tab-${tabId}`).classList.add('active');
  });
});

// ============ Window Controls ============
document.getElementById('btn-minimize').addEventListener('click', () => {
  window.electronAPI.minimizeWindow();
});
document.getElementById('btn-maximize').addEventListener('click', () => {
  window.electronAPI.maximizeWindow();
});
document.getElementById('btn-close').addEventListener('click', () => {
  window.electronAPI.closeWindow();
});

// ============ App State ============
const state = {
  queue: [],
  totalDownloads: 0,
  completedDownloads: 0,
  isDownloading: false,
  config: null,
};

// ============ DOM References ============
const urlInput = document.getElementById('url-input');
const btnFetch = document.getElementById('btn-fetch');
const downloadPathInput = document.getElementById('download-path-input');
const btnBrowse = document.getElementById('btn-browse');
const linkStatus = document.getElementById('link-status');
const downloadCount = document.getElementById('download-count');
const queueList = document.getElementById('queue-list');
const queueEmpty = document.getElementById('queue-empty');
const btnDownload = document.getElementById('btn-download');
const btnStop = document.getElementById('btn-stop');
const btnClearFinished = document.getElementById('btn-clear-finished');
const btnSaveSettings = document.getElementById('btn-save-settings');

// ============ Initialize ============
async function init() {
  state.config = await window.electronAPI.loadConfig();

  // Apply config to UI
  downloadPathInput.value = state.config.downloadPath || '';
  document.getElementById('cookie-nid-aut').value = state.config.cookies?.NID_AUT || '';
  document.getElementById('cookie-nid-ses').value = state.config.cookies?.NID_SES || '';
  document.getElementById('after-download').value = state.config.afterDownload || 'none';
  document.getElementById('server-enabled').checked = state.config.localServer?.enabled ?? true;
  document.getElementById('server-port').value = state.config.localServer?.port || 36363;

  updateQueueUI();
}

init();

// ============ URL Fetch ============
btnFetch.addEventListener('click', fetchContent);
urlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') fetchContent();
});

async function fetchContent() {
  const url = urlInput.value.trim();
  if (!url) return;

  const downloadPath = downloadPathInput.value || '';
  if (!downloadPath) {
    showStatus('다운로드 경로를 먼저 설정하세요.', 'warning');
    return;
  }

  showStatus('메타데이터를 가져오는 중...', 'loading');
  urlInput.value = '';

  try {
    const cookies = {
      NID_AUT: state.config.cookies?.NID_AUT || '',
      NID_SES: state.config.cookies?.NID_SES || '',
    };

    const result = await window.electronAPI.fetchContent(url, cookies, downloadPath);

    if (result.error) {
      showStatus(`오류: ${result.error}`, 'error');
      return;
    }

    addToQueue(result);
    showStatus('추가 완료', 'success');
  } catch (err) {
    showStatus(`오류: ${err.message}`, 'error');
  }
}

// ============ Queue Management ============
function addToQueue(item) {
  item.id = Date.now().toString() + Math.random().toString(36).substr(2, 5);
  item.state = 'waiting';
  item.progress = 0;
  item.speed = '';
  item.remainTime = '';
  item.downloadedSize = '';

  // Default to highest resolution
  if (item.resolutions && item.resolutions.length > 0) {
    const best = item.resolutions[item.resolutions.length - 1];
    item.selectedResolution = best.resolution;
    item.selectedBaseUrl = best.baseUrl;
  }

  state.queue.push(item);
  state.totalDownloads = state.queue.length;
  updateQueueUI();
  updateControlButtons();
}

function removeFromQueue(id) {
  const idx = state.queue.findIndex((item) => item.id === id);
  if (idx === -1) return;

  const item = state.queue[idx];
  if (item.state === 'finished') {
    state.completedDownloads--;
  }
  state.queue.splice(idx, 1);
  state.totalDownloads = state.queue.length;
  updateQueueUI();
  updateControlButtons();
}

function clearFinished() {
  state.queue = state.queue.filter((item) => item.state !== 'finished');
  state.completedDownloads = 0;
  state.totalDownloads = state.queue.length;
  updateQueueUI();
  updateControlButtons();
}

function selectResolution(itemId, resolution, baseUrl) {
  const item = state.queue.find((i) => i.id === itemId);
  if (item && item.state === 'waiting') {
    item.selectedResolution = resolution;
    item.selectedBaseUrl = baseUrl;
    updateQueueUI();
  }
}

// ============ Queue UI Rendering ============
function updateQueueUI() {
  downloadCount.textContent = `다운로드: ${state.completedDownloads}/${state.totalDownloads}`;

  if (state.queue.length === 0) {
    queueEmpty.style.display = 'flex';
    queueList.innerHTML = '';
    return;
  }

  queueEmpty.style.display = 'none';

  queueList.innerHTML = state.queue
    .map(
      (item, idx) => `
    <div class="queue-item ${item.state === 'downloading' ? 'downloading' : ''} ${item.state === 'finished' ? 'finished' : ''} ${item.state === 'failed' ? 'failed' : ''}" data-id="${item.id}">
      <img class="queue-item-thumbnail" src="${item.thumbnailUrl || ''}" alt="" onerror="this.style.display='none'">
      <div class="queue-item-info">
        <div class="queue-item-header">
          ${item.channelImageUrl ? `<img class="queue-item-channel-img" src="${item.channelImageUrl}" alt="">` : ''}
          <span class="queue-item-channel">${escapeHtml(item.channelName || '')}</span>
          <span class="queue-item-type">${escapeHtml(item.contentType || 'video')}</span>
        </div>
        <div class="queue-item-title" title="${escapeHtml(item.title || '')}">${escapeHtml(item.title || 'Unknown')}</div>
        <div class="queue-item-resolutions">
          ${(item.resolutions || [])
            .map(
              (r) =>
                `<button class="res-btn ${item.selectedResolution === r.resolution ? 'active' : ''}" 
                  onclick="selectResolution('${item.id}', ${r.resolution}, '${r.baseUrl || ''}')" 
                  ${item.state !== 'waiting' ? 'disabled' : ''}>${r.resolution}p</button>`
            )
            .join('')}
        </div>
        ${
          item.state === 'downloading' || item.state === 'paused'
            ? `
          <div class="queue-item-progress">
            <div class="progress-bar-container">
              <div class="progress-bar" style="width: ${item.progress}%"></div>
            </div>
            <span class="progress-text">${item.progress}%</span>
          </div>
          <div class="queue-item-status">
            ${item.state === 'paused' ? '<span>⏸ 일시정지</span>' : ''}
            ${item.speed ? `<span>${item.speed}</span>` : ''}
            ${item.remainTime ? `<span>${item.remainTime}</span>` : ''}
            ${item.downloadedSize ? `<span>${item.downloadedSize}</span>` : ''}
          </div>`
            : ''
        }
        ${item.state === 'finished' ? `<div class="queue-item-status"><span style="color:var(--success)">✓ 완료</span> <span>${item.downloadTime || ''}</span></div>` : ''}
        ${item.state === 'failed' ? `<div class="queue-item-status"><span style="color:var(--danger)">✕ 실패</span></div>` : ''}
      </div>
      <div class="queue-item-actions">
        <button class="btn-icon btn-icon-danger" onclick="removeFromQueue('${item.id}')" title="삭제">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    </div>
  `
    )
    .join('');
}

function updateControlButtons() {
  const hasWaiting = state.queue.some((i) => i.state === 'waiting');
  btnDownload.disabled = !hasWaiting && !state.isDownloading;
  btnStop.disabled = !state.isDownloading;
}

// ============ Download Controls ============
btnDownload.addEventListener('click', handleDownloadPause);
btnStop.addEventListener('click', handleStop);
btnClearFinished.addEventListener('click', clearFinished);

async function handleDownloadPause() {
  if (state.isDownloading) {
    // Toggle pause
    const current = state.queue.find((i) => i.state === 'downloading');
    if (current) {
      await window.electronAPI.pauseDownload(current.id);
      current.state = 'paused';
      btnDownload.querySelector('span').textContent = '다운로드';
      updateQueueUI();
    }
  } else {
    // Start download
    const next = state.queue.find((i) => i.state === 'waiting' || i.state === 'paused');
    if (!next) return;

    state.isDownloading = true;
    next.state = 'downloading';
    btnDownload.querySelector('span').textContent = '일시정지';
    updateQueueUI();
    updateControlButtons();

    try {
      await window.electronAPI.startDownload({
        id: next.id,
        url: next.vodUrl,
        baseUrl: next.selectedBaseUrl,
        resolution: next.selectedResolution,
        outputPath: `${downloadPathInput.value}/${next.title} ${next.selectedResolution}p.mp4`,
        contentType: next.contentType,
        liveRewindPlaybackJson: next.liveRewindPlaybackJson || null,
      });
    } catch (err) {
      next.state = 'failed';
      state.isDownloading = false;
      updateQueueUI();
      updateControlButtons();
    }
  }
}

async function handleStop() {
  const current = state.queue.find(
    (i) => i.state === 'downloading' || i.state === 'paused'
  );
  if (current) {
    await window.electronAPI.stopDownload(current.id);
    current.state = 'waiting';
    current.progress = 0;
    state.isDownloading = false;
    btnDownload.querySelector('span').textContent = '다운로드';
    updateQueueUI();
    updateControlButtons();
  }
}

// ============ Download Progress Listeners ============
window.electronAPI.onDownloadProgress((data) => {
  const item = state.queue.find((i) => i.id === data.id);
  if (item) {
    item.progress = data.progress;
    item.speed = data.speed;
    item.remainTime = data.remainTime;
    item.downloadedSize = data.downloadedSize;
    updateQueueUI();
  }
});

window.electronAPI.onDownloadComplete((data) => {
  const item = state.queue.find((i) => i.id === data.id);
  if (item) {
    item.state = 'finished';
    item.progress = 100;
    item.downloadTime = data.downloadTime;
    state.completedDownloads++;
    state.isDownloading = false;
    btnDownload.querySelector('span').textContent = '다운로드';
    updateQueueUI();
    updateControlButtons();

    // Auto-start next
    const next = state.queue.find((i) => i.state === 'waiting');
    if (next) {
      handleDownloadPause();
    }
  }
});

window.electronAPI.onDownloadError((data) => {
  const item = state.queue.find((i) => i.id === data.id);
  if (item) {
    item.state = 'failed';
    state.isDownloading = false;
    btnDownload.querySelector('span').textContent = '다운로드';
    updateQueueUI();
    updateControlButtons();
    showStatus(`다운로드 실패: ${data.error}`, 'error');
  }
});

// ============ Browse Path ============
btnBrowse.addEventListener('click', async () => {
  const path = await window.electronAPI.openDirectory();
  if (path) {
    downloadPathInput.value = path;
    if (state.config) {
      state.config.downloadPath = path;
      await window.electronAPI.saveConfig(state.config);
    }
  }
});

// ============ Settings ============
btnSaveSettings.addEventListener('click', async () => {
  state.config.cookies = {
    NID_AUT: document.getElementById('cookie-nid-aut').value.trim(),
    NID_SES: document.getElementById('cookie-nid-ses').value.trim(),
  };
  state.config.afterDownload = document.getElementById('after-download').value;
  state.config.localServer = {
    enabled: document.getElementById('server-enabled').checked,
    port: parseInt(document.getElementById('server-port').value) || 36363,
  };

  await window.electronAPI.saveConfig(state.config);
  showStatus('설정이 저장되었습니다.', 'success');
});

// ============ Utilities ============
function showStatus(message, type = 'info') {
  linkStatus.textContent = message;
  linkStatus.style.color =
    type === 'error'
      ? 'var(--danger)'
      : type === 'success'
        ? 'var(--success)'
        : type === 'warning'
          ? 'var(--warning)'
          : 'var(--text-muted)';

  if (type !== 'loading') {
    setTimeout(() => {
      linkStatus.textContent = '준비됨';
      linkStatus.style.color = 'var(--text-muted)';
    }, 5000);
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let idx = 0;
  let size = bytes;
  while (size >= 1024 && idx < units.length - 1) {
    size /= 1024;
    idx++;
  }
  return `${size.toFixed(2)} ${units[idx]}`;
}
