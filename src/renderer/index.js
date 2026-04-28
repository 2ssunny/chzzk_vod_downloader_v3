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

// Modal Elements
const downloadModal = document.getElementById('download-modal');
const btnModalClose = document.getElementById('btn-modal-close');
const btnModalAdd = document.getElementById('btn-modal-add');
const splitTypeSelect = document.getElementById('download-split-type');
const splitAllOptions = document.getElementById('split-all-options');
const splitPartOptions = document.getElementById('split-part-options');
const splitDurationInput = document.getElementById('split-duration');
const splitStartInput = document.getElementById('split-start');
const splitEndInput = document.getElementById('split-end');

let pendingDownloadResult = null;

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
  const apiConfigTypeSelect = document.getElementById('api-config-type');
  const remoteUrlInput = document.getElementById('remote-config-url');
  
  if (apiConfigTypeSelect && remoteUrlInput) {
    apiConfigTypeSelect.value = state.config.apiConfigType || 'builtin';
    remoteUrlInput.value = state.config.remoteConfigUrl || '';
    
    // Initial display
    remoteUrlInput.style.display = apiConfigTypeSelect.value === 'custom' ? 'block' : 'none';
    
    // Change listener
    apiConfigTypeSelect.addEventListener('change', (e) => {
      remoteUrlInput.style.display = e.target.value === 'custom' ? 'block' : 'none';
    });
  }

  renderFullQueue();
}

init();

// ============ URL Fetch ============
btnFetch.addEventListener('click', fetchContent);
urlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') fetchContent();
});

window.electronAPI.onExternalAddUrl((url) => {
  if (url) {
    urlInput.value = url;
    // Switch to Download Tab
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    const downloadTabBtn = document.querySelector('.tab-btn[data-tab="download"]');
    if (downloadTabBtn) downloadTabBtn.classList.add('active');
    
    document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));
    document.getElementById('tab-download').classList.add('active');
    
    fetchContent();
  }
});

async function fetchContent() {
  const url = urlInput.value.trim();
  if (!url) return;

  const downloadPath = downloadPathInput.value || '';
  if (!downloadPath) {
    alert('다운로드 경로를 먼저 설정하세요!');
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
      alert(`오류: ${result.error}`);
      showStatus(`오류: ${result.error}`, 'error');
      return;
    }

    if (url.includes('/clips/')) {
      // Bypass modal for clips
      addToQueue(result, { type: 'none' });
      showStatus('클립이 대기열에 추가되었습니다.', 'success');
      if (!state.isDownloading) handleDownloadPause();
    } else {
      openDownloadModal(result);
      showStatus('옵션을 선택하세요.', 'success');
    }
  } catch (err) {
    alert(`오류: ${err.message}`);
    showStatus(`오류: ${err.message}`, 'error');
  }
}

// ============ Modal Management ============
function openDownloadModal(result) {
  pendingDownloadResult = result;
  
  // Default values
  splitTypeSelect.value = 'none';
  splitAllOptions.style.display = 'none';
  splitPartOptions.style.display = 'none';
  
  if (result.duration) {
    const totalSecs = result.duration;
    const endHH = String(Math.floor(totalSecs / 3600)).padStart(2, '0');
    const endMM = String(Math.floor((totalSecs % 3600) / 60)).padStart(2, '0');
    const endSS = String(totalSecs % 60).padStart(2, '0');
    splitEndInput.value = `${endHH}:${endMM}:${endSS}`;
  } else {
    splitEndInput.value = '01:00:00';
  }
  
  downloadModal.style.display = 'flex';
}

function closeDownloadModal() {
  downloadModal.style.display = 'none';
  pendingDownloadResult = null;
}

btnModalClose.addEventListener('click', closeDownloadModal);

splitTypeSelect.addEventListener('change', (e) => {
  const val = e.target.value;
  splitAllOptions.style.display = val === 'split_all' ? 'block' : 'none';
  splitPartOptions.style.display = val === 'split_part' ? 'block' : 'none';
});

btnModalAdd.addEventListener('click', () => {
  if (!pendingDownloadResult) return;
  
  const splitType = splitTypeSelect.value;
  const splitData = { type: splitType };
  
  if (splitType === 'split_all') {
    splitData.duration = parseInt(splitDurationInput.value) || 60;
  } else if (splitType === 'split_part') {
    splitData.start = splitStartInput.value.trim();
    splitData.end = splitEndInput.value.trim();
  }
  
  addToQueue(pendingDownloadResult, splitData);
  closeDownloadModal();
  
  if (!state.isDownloading) handleDownloadPause();
});

// ============ Queue Management ============
function addToQueue(item, splitData = { type: 'none' }) {
  item.id = Date.now().toString() + Math.random().toString(36).substr(2, 5);
  item.state = 'waiting';
  item.progress = 0;
  item.speed = '';
  item.remainTime = '';
  item.downloadedSize = '';
  item.splitData = splitData;

  // Default to highest resolution
  if (item.resolutions && item.resolutions.length > 0) {
    const best = item.resolutions[item.resolutions.length - 1];
    item.selectedResolution = best.resolution;
    item.selectedBaseUrl = best.baseUrl;
  }

  state.queue.push(item);
  state.totalDownloads = state.queue.length;
  renderFullQueue();
  updateControlButtons();
}

function removeFromQueue(id) {
  const idx = state.queue.findIndex((item) => item.id === id);
  if (idx === -1) return;

  const item = state.queue[idx];
  // Allow deletion if not currently downloading
  if (item.state === 'downloading') return;
  if (item.state === 'finished') {
    state.completedDownloads--;
  }
  state.queue.splice(idx, 1);
  state.totalDownloads = state.queue.length;
  renderFullQueue();
  updateControlButtons();
}
function clearFinished() {
  state.queue = state.queue.filter((item) => item.state !== 'finished');
  state.completedDownloads = 0;
  state.totalDownloads = state.queue.length;
  renderFullQueue();
  updateControlButtons();
}

function selectResolution(itemId, resolution, baseUrl) {
  const item = state.queue.find((i) => i.id === itemId);
  if (item && item.state === 'waiting') {
    item.selectedResolution = resolution;
    item.selectedBaseUrl = baseUrl;
    renderFullQueue();
  }
}

// ============ Queue UI Rendering ============

// Full re-render (used when items are added/removed/resolution changed)
function renderFullQueue() {
  downloadCount.textContent = `다운로드: ${state.completedDownloads}/${state.totalDownloads}`;

  if (state.queue.length === 0) {
    queueEmpty.style.display = 'flex';
    queueList.innerHTML = '';
    return;
  }

  queueEmpty.style.display = 'none';
  queueList.innerHTML = state.queue.map((item) => buildQueueItemHtml(item, true)).join('');
}

// Lightweight progress-only update (no DOM rebuild, no animation)
function updateQueueProgress() {
  downloadCount.textContent = `다운로드: ${state.completedDownloads}/${state.totalDownloads}`;

  for (const item of state.queue) {
    const el = queueList.querySelector(`[data-id="${item.id}"]`);
    if (!el) continue;

    // Update progress bar
    const bar = el.querySelector('.progress-bar');
    if (bar) bar.style.width = `${item.progress}%`;

    // Update progress text
    const pText = el.querySelector('.progress-text');
    if (pText) pText.textContent = `${item.progress}%`;

    // Update status line
    const statusEl = el.querySelector('.queue-item-status');
    if (statusEl && (item.state === 'downloading' || item.state === 'paused')) {
      const parts = [];
      if (item.state === 'paused') parts.push('<span>⏸ 일시정지</span>');
      if (item.speed) parts.push(`<span>${item.speed}</span>`);
      if (item.remainTime) parts.push(`<span>${item.remainTime}</span>`);
      if (item.downloadedSize) parts.push(`<span>${item.downloadedSize}</span>`);
      statusEl.innerHTML = parts.join('');
    }

    // Update state classes
    el.className = `queue-item ${item.state === 'downloading' ? 'downloading' : ''} ${item.state === 'finished' ? 'finished' : ''} ${item.state === 'failed' ? 'failed' : ''}`;
  }
}

function buildQueueItemHtml(item, isNew) {
  const durationStr = item.duration ? formatDuration(item.duration) : '';
  const dateStr = item.createdDate ? formatDate(item.createdDate) : '';
  const metaParts = [durationStr, dateStr].filter(Boolean);

  return `
    <div class="queue-item ${item.state === 'downloading' ? 'downloading' : ''} ${item.state === 'finished' ? 'finished' : ''} ${item.state === 'failed' ? 'failed' : ''}${isNew ? ' queue-item-enter' : ''}" data-id="${item.id}">
      <img class="queue-item-thumbnail" src="${item.thumbnailUrl || ''}" alt="">
      <div class="queue-item-info">
        <div class="queue-item-header">
          ${item.channelImageUrl ? `<img class="queue-item-channel-img" src="${item.channelImageUrl}" alt="">` : ''}
          <span class="queue-item-channel">${escapeHtml(item.channelName || '')}</span>
          <span class="queue-item-type">${escapeHtml(item.contentType || 'video')}</span>
        </div>
        <div class="queue-item-title" title="${escapeHtml(item.title || '')}">${escapeHtml(item.title || 'Unknown')}</div>
        ${metaParts.length > 0 ? `<div class="queue-item-meta">${metaParts.map((m) => `<span>${m}</span>`).join('')}</div>` : ''}
        ${
          item.splitData && item.splitData.type !== 'none'
            ? `<div class="queue-item-meta" style="color: var(--accent); margin-top: 4px;">
                <span>✂ ${
                  item.splitData.type === 'split_all'
                    ? `전체 분할 (${item.splitData.duration}분)`
                    : `특정 구간 (${item.splitData.start} ~ ${item.splitData.end})`
                }</span>
               </div>`
            : ''
        }
        <div class="queue-item-resolutions">
          ${(item.resolutions || [])
            .map(
              (r) =>
                `<button class="res-btn ${item.selectedResolution === r.resolution ? 'active' : ''}" 
                  data-action="resolution" data-item-id="${item.id}" data-resolution="${r.resolution}" data-baseurl="${escapeHtml(r.baseUrl || '')}" 
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
        <button class="btn-icon btn-icon-danger" data-action="delete" data-item-id="${item.id}" title="삭제" ${item.state === 'downloading' ? 'disabled' : ''}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    </div>
  `;
}

function updateControlButtons() {
  const hasWaiting = state.queue.some((i) => i.state === 'waiting');
  btnDownload.disabled = !hasWaiting && !state.isDownloading;
  btnStop.disabled = !state.isDownloading;
}

// ============ Queue Event Delegation ============
// Using event delegation instead of inline onclick (blocked by CSP)
queueList.addEventListener('click', (e) => {
  const target = e.target.closest('[data-action]');
  if (!target) return;

  const action = target.dataset.action;
  const itemId = target.dataset.itemId;

  if (action === 'delete') {
    removeFromQueue(itemId);
  } else if (action === 'resolution') {
    const resolution = parseInt(target.dataset.resolution);
    const baseUrl = target.dataset.baseurl || '';
    selectResolution(itemId, resolution, baseUrl);
  }
});

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
      renderFullQueue();
    }
  } else {
    // Start download
    const next = state.queue.find((i) => i.state === 'waiting' || i.state === 'paused');
    if (!next) return;

    state.isDownloading = true;
    next.state = 'downloading';
    btnDownload.querySelector('span').textContent = '일시정지';
    renderFullQueue();
    updateControlButtons();

    try {
      let suffix = '';
      if (next.splitData && next.splitData.type === 'split_part') {
        suffix = ` (${next.splitData.start.replace(/:/g, '')}-${next.splitData.end.replace(/:/g, '')})`;
      }

      await window.electronAPI.startDownload({
        id: next.id,
        url: next.vodUrl,
        baseUrl: next.selectedBaseUrl,
        resolution: next.selectedResolution,
        outputPath: `${downloadPathInput.value}/${sanitizeFilename(next.channelName)} - ${sanitizeFilename(next.title)} ${next.selectedResolution}p${suffix}.mp4`,
        contentType: next.contentType,
        liveRewindPlaybackJson: next.liveRewindPlaybackJson || null,
        dashManifestUrl: next.dashManifestUrl || null,
        splitData: next.splitData || { type: 'none' }
      });
    } catch (err) {
      next.state = 'failed';
      state.isDownloading = false;
      renderFullQueue();
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
    renderFullQueue();
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
    updateQueueProgress(); // Lightweight update — no DOM rebuild
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
    renderFullQueue();
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
    renderFullQueue();
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
    port: parseInt(document.getElementById('server-port').value) || 11025,
  };
  
  const apiConfigTypeSelect = document.getElementById('api-config-type');
  const remoteUrlInput = document.getElementById('remote-config-url');
  if (apiConfigTypeSelect && remoteUrlInput) {
    state.config.apiConfigType = apiConfigTypeSelect.value;
    state.config.remoteConfigUrl = remoteUrlInput.value.trim();
  }

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

function escapeAttr(str) {
  return str.replace(/'/g, "\\'").replace(/"/g, '&quot;');
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

function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}시간 ${m}분`;
  if (m > 0) return `${m}분 ${s}초`;
  return `${s}초`;
}

function formatDate(dateStr) {
  if (!dateStr || dateStr === 'Unknown Date') return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  } catch {
    return dateStr;
  }
}

function sanitizeFilename(name) {
  if (!name) return 'Unknown';
  return name.replace(/[\\/:*?"<>|\n]/g, '').trim() || 'Unknown';
}
