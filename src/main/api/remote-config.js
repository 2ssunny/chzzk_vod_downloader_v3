/**
 * Remote API Config
 * Fetches API endpoint URLs from user's server for dynamic updates.
 * Falls back to built-in defaults if server is unreachable.
 */

const fs = require('fs');
const path = require('path');
const { getConfigDir } = require('../config/config');
const { client } = require('./client');

const CACHE_FILE = 'api-endpoints.json';

const BUILTIN_ENDPOINTS = {
  searchChannels: 'https://api.chzzk.naver.com/service/v1/search/channels',
  channelVideos: 'https://api.chzzk.naver.com/service/v1/channels/{channelId}/videos',
  channelClips: 'https://api.chzzk.naver.com/service/v1/channels/{channelId}/clips',
  videoInfo: 'https://api.chzzk.naver.com/service/v2/videos/{videoNo}',
  clipInfo: 'https://api.chzzk.naver.com/service/v1/clips/{clipNo}/detail',
  dashManifest: 'https://apis.naver.com/neonplayer/vodplay/v2/playback/{videoId}',
  clipManifest: 'https://api-videohub.naver.com/shortformhub/feeds/v3/card',
};

/**
 * Load endpoints from remote server, cache, or builtin defaults
 * @param {object} appConfig - App configuration object
 * @returns {Promise<object>} endpoint map
 */
async function loadEndpoints(appConfig) {
  const apiConfigType = appConfig.apiConfigType || 'builtin';
  let remoteUrl = null;

  if (apiConfigType === 'ssunny') {
    remoteUrl = 'https://api.ssunny.me/util/chzzk_api';
  } else if (apiConfigType === 'custom') {
    remoteUrl = appConfig.remoteConfigUrl || '';
  }

  // 1. Try remote server
  if (remoteUrl && apiConfigType !== 'builtin') {
    try {
      const response = await fetch(remoteUrl, { signal: AbortSignal.timeout(5000) });
      if (response.ok) {
        const data = await response.json();
        const endpoints = data.endpoints || data;
        // Cache locally
        saveCache(endpoints);
        client.setEndpoints(endpoints);
        console.log('[RemoteConfig] Loaded endpoints from server');
        return endpoints;
      }
    } catch (err) {
      console.warn('[RemoteConfig] Server unreachable:', err.message);
    }
  }

  // 2. Try cached version (only if a remote was intended)
  if (apiConfigType !== 'builtin') {
    const cached = loadCache();
    if (cached) {
      client.setEndpoints(cached);
      console.log('[RemoteConfig] Using cached endpoints');
      return cached;
    }
  }

  // 3. Fallback to built-in defaults
  client.setEndpoints(BUILTIN_ENDPOINTS);
  console.log('[RemoteConfig] Using built-in defaults');
  return BUILTIN_ENDPOINTS;
}

function getCachePath() {
  return path.join(getConfigDir(), CACHE_FILE);
}

function loadCache() {
  try {
    const cachePath = getCachePath();
    if (fs.existsSync(cachePath)) {
      const raw = fs.readFileSync(cachePath, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn('[RemoteConfig] Cache read error:', err.message);
  }
  return null;
}

function saveCache(endpoints) {
  try {
    const cachePath = getCachePath();
    fs.writeFileSync(cachePath, JSON.stringify(endpoints, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[RemoteConfig] Cache write error:', err.message);
  }
}

module.exports = { loadEndpoints, BUILTIN_ENDPOINTS };
