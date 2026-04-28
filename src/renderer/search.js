// ============ Search State ============
const searchState = {
  channelKeyword: '',
  channelOffset: 0,
  hasMoreChannels: false,
  
  currentChannel: null,
  contentType: 'videos', // 'videos' or 'clips'
  contentPage: 0,
  contentTotalPages: 0,
  
  isLoading: false,
};

// ============ DOM References ============
const searchInput = document.getElementById('search-input');
const btnSearch = document.getElementById('btn-search');
const searchChannelList = document.getElementById('search-channel-list');
const searchChannelDetail = document.getElementById('search-channel-detail');

// Channel List
const channelResults = document.getElementById('channel-results');
const searchEmpty = document.getElementById('search-empty');
const searchLoading = document.getElementById('search-loading');
const searchLoadMore = document.getElementById('search-load-more');
const btnLoadMore = document.getElementById('btn-load-more');

// Detail View
const btnBack = document.getElementById('btn-back');
const channelDetailImg = document.getElementById('channel-detail-img');
const channelDetailName = document.getElementById('channel-detail-name');
const contentTabBtns = document.querySelectorAll('.content-tab-btn');
const contentList = document.getElementById('content-list');
const contentListLoading = document.getElementById('content-list-loading');

// Pagination
const contentPagination = document.getElementById('content-pagination');
const btnPrevPage = document.getElementById('btn-prev-page');
const btnNextPage = document.getElementById('btn-next-page');
const pageInfo = document.getElementById('page-info');

// ============ Event Listeners ============
btnSearch.addEventListener('click', () => performChannelSearch(true));
searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') performChannelSearch(true);
});

btnLoadMore.addEventListener('click', () => performChannelSearch(false));

btnBack.addEventListener('click', () => {
  searchChannelDetail.classList.remove('active');
  searchChannelList.classList.add('active');
});

contentTabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    contentTabBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    searchState.contentType = btn.dataset.contentType;
    loadChannelContent(0);
  });
});

btnPrevPage.addEventListener('click', () => {
  if (searchState.contentPage > 0) {
    loadChannelContent(searchState.contentPage - 1);
  }
});

btnNextPage.addEventListener('click', () => {
  if (searchState.contentPage < searchState.contentTotalPages - 1) {
    loadChannelContent(searchState.contentPage + 1);
  }
});

// Event Delegation for Content Cards
contentList.addEventListener('click', (e) => {
  const card = e.target.closest('.content-card');
  if (!card) return;
  
  const videoId = card.dataset.videoId;
  if (!videoId) return;
  
  // Create full URL based on content type
  const url = searchState.contentType === 'videos' 
    ? `https://chzzk.naver.com/video/${videoId}`
    : `https://chzzk.naver.com/clips/${videoId}`;
    
  // Call the main fetch function in index.js
  urlInput.value = url;
  fetchContent();
  
  // Switch back to download tab automatically
  document.querySelector('.tab-btn[data-tab="download"]').click();
});

// ============ Search Functions ============
async function performChannelSearch(isNewSearch = true) {
  if (searchState.isLoading) return;
  
  if (isNewSearch) {
    searchState.channelKeyword = searchInput.value.trim();
    if (!searchState.channelKeyword) return;
    
    searchState.channelOffset = 0;
    channelResults.innerHTML = '';
    searchEmpty.style.display = 'none';
  }
  
  searchState.isLoading = true;
  searchLoading.style.display = 'flex';
  searchLoadMore.style.display = 'none';
  
  try {
    const result = await window.electronAPI.searchChannels(
      searchState.channelKeyword, 
      searchState.channelOffset, 
      20
    );
    
    searchLoading.style.display = 'none';
    
    if (result.error) {
      showStatus(`검색 오류: ${result.error}`, 'error');
      return;
    }
    
    if (isNewSearch && result.channels.length === 0) {
      searchEmpty.style.display = 'flex';
      searchEmpty.innerHTML = `
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" opacity="0.3"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <p>검색 결과가 없습니다</p>
      `;
      return;
    }
    
    // Render channels
    const newHtml = result.channels.map(ch => `
      <div class="channel-card" onclick="openChannelDetail('${ch.channelId}', '${escapeAttr(ch.channelName)}', '${escapeAttr(ch.channelImageUrl)}')">
        <img class="channel-card-avatar" src="${ch.channelImageUrl || ''}" alt="" onerror="this.src=''">
        <div class="channel-card-info">
          <div class="channel-card-name">
            ${escapeHtml(ch.channelName)}
            ${ch.verifiedMark ? '<span class="verified">✓</span>' : ''}
            ${ch.openLive ? '<span class="channel-card-live">LIVE</span>' : ''}
          </div>
          <div class="channel-card-desc">${escapeHtml(ch.channelDescription || '')}</div>
          <div class="channel-card-meta">
            <span>팔로워 ${formatCount(ch.followerCount)}</span>
          </div>
        </div>
      </div>
    `).join('');
    
    channelResults.insertAdjacentHTML('beforeend', newHtml);
    
    // Check if more
    searchState.channelOffset = result.nextOffset;
    searchState.hasMoreChannels = result.channels.length === 20; // Basic assumption
    
    if (searchState.hasMoreChannels) {
      searchLoadMore.style.display = 'flex';
    }
    
  } catch (err) {
    searchLoading.style.display = 'none';
    showStatus(`검색 중 오류 발생`, 'error');
  } finally {
    searchState.isLoading = false;
  }
}

// Global exposure for onclick
window.openChannelDetail = function(channelId, channelName, channelImageUrl) {
  searchState.currentChannel = { id: channelId, name: channelName, img: channelImageUrl };
  
  // Setup UI
  channelDetailName.textContent = channelName;
  channelDetailImg.src = channelImageUrl || '';
  
  searchChannelList.classList.remove('active');
  searchChannelDetail.classList.add('active');
  
  // Load content
  loadChannelContent(0);
};

async function loadChannelContent(page) {
  if (!searchState.currentChannel || searchState.isLoading) return;
  
  searchState.isLoading = true;
  searchState.contentPage = page;
  
  contentList.innerHTML = '';
  contentListLoading.style.display = 'flex';
  contentPagination.style.display = 'none';
  
  try {
    const channelId = searchState.currentChannel.id;
    let result;
    
    if (searchState.contentType === 'videos') {
      result = await window.electronAPI.getChannelVideos(channelId, page, 24);
    } else {
      result = await window.electronAPI.getChannelClips(channelId, page, 24);
    }
    
    contentListLoading.style.display = 'none';
    
    if (result.error) {
      showStatus(`불러오기 오류: ${result.error}`, 'error');
      return;
    }
    
    const items = searchState.contentType === 'videos' ? result.videos : result.clips;
    
    if (items.length === 0) {
      contentList.innerHTML = `
        <div class="search-placeholder" style="grid-column: 1 / -1; padding: 40px 0;">
          <p>콘텐츠가 없습니다</p>
        </div>
      `;
      return;
    }
    
    // Render items
    contentList.innerHTML = items.map(item => {
      const isVideo = searchState.contentType === 'videos';
      const title = isVideo ? item.videoTitle : item.clipTitle;
      const id = isVideo ? item.videoNo : item.clipNo;
      const date = isVideo ? item.publishDate : item.clipCreatedDate;
      const type = isVideo ? item.videoType : '클립';
      
      return `
        <div class="content-card" data-video-id="${id}">
          <div class="content-card-thumb">
            <img src="${item.thumbnailImageUrl || ''}" alt="" loading="lazy">
            <span class="content-card-duration">${formatDuration(item.duration)}</span>
          </div>
          <div class="content-card-info">
            <div class="content-card-title" title="${escapeHtml(title)}">${escapeHtml(title)}</div>
            <div class="content-card-meta">
              <span>${type}</span>
              <span>조회수 ${formatCount(item.readCount)}</span>
              <span>${formatDate(date)}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');
    
    // Pagination setup
    searchState.contentTotalPages = result.totalPage;
    
    if (result.totalPage > 1) {
      contentPagination.style.display = 'flex';
      pageInfo.textContent = `${page + 1} / ${result.totalPage}`;
      btnPrevPage.disabled = page === 0;
      btnNextPage.disabled = page >= result.totalPage - 1;
    }
    
  } catch (err) {
    contentListLoading.style.display = 'none';
    showStatus(`목록을 불러오는 중 오류 발생`, 'error');
  } finally {
    searchState.isLoading = false;
  }
}

// Utility
function formatCount(num) {
  if (num >= 10000) return (num / 10000).toFixed(1).replace(/\.0$/, '') + '만';
  if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + '천';
  return num.toString();
}
