/**
 * Chzzk Search API
 * Channel search, channel video list, channel clip list
 */

const { client, DEFAULTS } = require('./client');

/**
 * Search channels by keyword
 * @param {string} keyword
 * @param {number} offset
 * @param {number} size
 * @returns {Promise<{channels: Array, nextOffset: number}>}
 */
async function searchChannels(keyword, offset = 0, size = 20) {
  const url =
    (client.getEndpoint('searchChannels') ||
      `${DEFAULTS.CHZZK_API}/service/v1/search/channels`) +
    `?keyword=${encodeURIComponent(keyword)}&offset=${offset}&size=${size}`;

  const data = await client.fetchJson(url);
  const content = data.content || {};
  const items = content.data || [];

  const channels = items.map((item) => {
    const ch = item.channel || {};
    const streamer = item.streamer || {};
    return {
      channelId: ch.channelId || '',
      channelName: ch.channelName || '',
      channelImageUrl: ch.channelImageUrl || '',
      verifiedMark: ch.verifiedMark || false,
      channelDescription: ch.channelDescription || '',
      followerCount: ch.followerCount || 0,
      openLive: streamer.openLive || false,
    };
  });

  return {
    channels,
    nextOffset: content.nextOffset || offset + size,
    size: content.size || size,
  };
}

/**
 * Get videos from a channel
 * @param {string} channelId
 * @param {number} page (0-based)
 * @param {number} size
 * @returns {Promise<{videos: Array, page: number, totalCount: number, totalPage: number}>}
 */
async function getChannelVideos(channelId, page = 0, size = 20) {
  const url =
    (client.getEndpoint('channelVideos') ||
      `${DEFAULTS.CHZZK_API}/service/v1/channels/{channelId}/videos`)
      .replace('{channelId}', channelId) +
    `?sortType=LATEST&pagingType=PAGE&page=${page}&size=${size}`;

  const data = await client.fetchJson(url);
  const content = data.content || {};
  const items = content.data || [];

  const videos = items.map((item) => ({
    videoNo: item.videoNo,
    videoId: item.videoId || '',
    videoTitle: (item.videoTitle || 'Untitled').replace(/[\\/:\*\?"<>|\n]/g, ''),
    videoType: item.videoType || '',
    publishDate: item.publishDate || '',
    thumbnailImageUrl: item.thumbnailImageUrl || '',
    duration: item.duration || 0,
    readCount: item.readCount || 0,
    categoryValue: item.videoCategoryValue || '',
    adult: item.adult || false,
  }));

  return {
    videos,
    page: content.page || page,
    totalCount: content.totalCount || 0,
    totalPage: content.totalPages || content.totalPage || Math.ceil((content.totalCount || 0) / size) || 1,
  };
}

/**
 * Get clips from a channel
 * @param {string} channelId
 * @param {string|number} cursor 
 * @param {number} size
 * @returns {Promise<{clips: Array, nextCursor: string|null}>}
 */
async function getChannelClips(channelId, cursor = null, size = 20) {
  const url =
    (client.getEndpoint('channelClips') ||
      `${DEFAULTS.CHZZK_API}/service/v1/channels/{channelId}/clips`)
      .replace('{channelId}', channelId) +
    `?sortType=LATEST&size=${size}${cursor && cursor !== 0 ? '&clipUID=' + cursor : ''}`;

  const data = await client.fetchJson(url);
  const content = data.content || {};
  const items = content.data || [];

  const clips = items.map((item) => ({
    clipNo: item.clipUID || item.clipId || item.clipNo || item.clipInfoNo,
    clipTitle: (item.clipTitle || 'Untitled').replace(/[\\/:\*\?"<>|\n]/g, ''),
    thumbnailImageUrl: item.thumbnailImageUrl || '',
    clipCreatedDate: item.createdDate || item.clipCreatedDate || '',
    duration: item.duration || 0,
    readCount: item.readCount || 0,
    clipCategory: item.clipCategory || '',
  }));

  return {
    clips,
    nextCursor: content.page?.next?.clipUID || null,
  };
}

module.exports = { searchChannels, getChannelVideos, getChannelClips };
