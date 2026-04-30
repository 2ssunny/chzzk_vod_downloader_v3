/**
 * Chzzk Content API — ported from chzzk-vod-downloader-v2/content/network.py
 *
 * Handles:
 * - URL parsing (extract content type and ID)
 * - Video/Clip metadata fetching
 * - DASH/m3u8 manifest parsing for resolution list
 */

const { client, DEFAULTS } = require('./client');

/**
 * Extract content type and content number from a Chzzk URL
 * @param {string} vodUrl
 * @returns {{ contentType: string|null, contentNo: string|null }}
 */
function extractContentNo(vodUrl) {
  if (!vodUrl.startsWith('http://') && !vodUrl.startsWith('https://')) {
    vodUrl = 'https://' + vodUrl;
  }

  const match = vodUrl.match(
    /^https?:\/\/chzzk\.naver\.com\/(?<contentType>video|clips)\/(?<contentNo>\w+)$/
  );

  if (match && match.groups) {
    return {
      contentType: match.groups.contentType,
      contentNo: match.groups.contentNo,
    };
  }
  return { contentType: null, contentNo: null };
}

/**
 * Get video info (metadata, video_id, in_key)
 */
async function getVideoInfo(videoNo, cookies) {
  client.setCookies(cookies);

  const apiUrl =
    (client.getEndpoint('videoInfo') || `${DEFAULTS.CHZZK_API}/service/v2/videos/{videoNo}`)
      .replace('{videoNo}', videoNo);

  const data = await client.fetchJson(apiUrl);
  const content = data.content || {};

  const videoId = content.videoId || null;
  const inKey = content.inKey || null;
  const adult = content.adult || false;
  const vodStatus = content.vodStatus || null;
  const liveRewindPlaybackJson = content.liveRewindPlaybackJson || null;

  const title = (content.videoTitle || 'Unknown Title').replace(/[\\/:\*\?"<>|\n]/g, '');

  const metadata = {
    title,
    thumbnailImageUrl: content.thumbnailImageUrl || '',
    category: content.videoCategoryValue || 'Unknown Category',
    channelName: content.channel?.channelName || 'Unknown Channel',
    channelImageUrl: content.channel?.channelImageUrl || '',
    createdDate: content.liveOpenDate || 'Unknown Date',
    duration: content.duration || 0,
  };

  return { videoId, inKey, adult, vodStatus, liveRewindPlaybackJson, metadata };
}

/**
 * Parse DASH manifest XML to get resolution list
 */
async function getVideoDashManifest(videoId, inKey) {
  const manifestUrl =
    (client.getEndpoint('dashManifest') || `${DEFAULTS.NAVER_API}/neonplayer/vodplay/v2/playback/{videoId}`)
      .replace('{videoId}', videoId) + `?key=${inKey}`;

  const xmlText = await client.fetchText(manifestUrl, {
    headers: { Accept: 'application/dash+xml' },
  });

  // Parse XML manually (no external dependency needed)
  const reps = [];
  const repRegex = /<Representation[^>]*width="(\d+)"[^>]*height="(\d+)"[^>]*>[\s\S]*?<BaseURL>([^<]+)<\/BaseURL>/g;
  // Also try reversed attribute order
  const repRegex2 = /<Representation[^>]*height="(\d+)"[^>]*width="(\d+)"[^>]*>[\s\S]*?<BaseURL>([^<]+)<\/BaseURL>/g;

  let match;
  while ((match = repRegex.exec(xmlText)) !== null) {
    const width = parseInt(match[1]);
    const height = parseInt(match[2]);
    const baseUrl = match[3];
    if (baseUrl.endsWith('/hls/')) continue;
    const resolution = Math.min(width, height);
    reps.push({ resolution, baseUrl });
  }

  // If no matches, try the other pattern
  if (reps.length === 0) {
    while ((match = repRegex2.exec(xmlText)) !== null) {
      const height = parseInt(match[1]);
      const width = parseInt(match[2]);
      const baseUrl = match[3];
      if (baseUrl.endsWith('/hls/')) continue;
      const resolution = Math.min(width, height);
      reps.push({ resolution, baseUrl });
    }
  }

  // More robust: parse all Representation elements
  if (reps.length === 0) {
    // Fallback: generic regex
    const allReps = xmlText.match(/<Representation[\s\S]*?<\/Representation>/g) || [];
    for (const repXml of allReps) {
      const wMatch = repXml.match(/width="(\d+)"/);
      const hMatch = repXml.match(/height="(\d+)"/);
      const bMatch = repXml.match(/<BaseURL>([^<]+)<\/BaseURL>/);
      if (wMatch && hMatch && bMatch) {
        const baseUrl = bMatch[1];
        if (baseUrl.endsWith('/hls/')) continue;
        const resolution = Math.min(parseInt(wMatch[1]), parseInt(hMatch[1]));
        reps.push({ resolution, baseUrl });
      }
    }
  }

  reps.sort((a, b) => a.resolution - b.resolution);

  const autoResolution = reps.length > 0 ? reps[reps.length - 1].resolution : null;
  const autoBaseUrl = reps.length > 0 ? reps[reps.length - 1].baseUrl : null;

  return { resolutions: reps, autoResolution, autoBaseUrl, manifestUrl };
}

/**
 * Parse m3u8 manifest from liveRewindPlaybackJson
 */
function getVideoM3u8Manifest(jsonStr) {
  const data = JSON.parse(jsonStr);
  const media = data.media || [];
  if (media.length === 0) return { resolutions: [], autoResolution: null, autoBaseUrl: null };

  const encodingTrack = media[0].encodingTrack || [];
  const reps = [];

  for (const encoding of encodingTrack) {
    const width = encoding.videoWidth;
    const height = encoding.videoHeight;
    if (width && height) {
      const resolution = Math.min(parseInt(width), parseInt(height));
      reps.push({ resolution, baseUrl: null }); // baseUrl resolved later via m3u8 playlist
    }
  }

  reps.sort((a, b) => a.resolution - b.resolution);

  return {
    resolutions: reps,
    autoResolution: reps.length > 0 ? reps[reps.length - 1].resolution : null,
    autoBaseUrl: null,
  };
}

/**
 * Get m3u8 base URL for a specific resolution
 */
async function getVideoM3u8BaseUrl(jsonStr, resolution) {
  const data = JSON.parse(jsonStr);
  const media = data.media || [];
  if (media.length === 0) throw new Error('No media in playback JSON');

  const path = media[0].path;
  const responseText = await client.fetchText(path);
  const lines = responseText.split('\n');

  const resolutionPattern = new RegExp(`RESOLUTION=\\d+x${resolution}`);

  for (let i = 0; i < lines.length; i++) {
    if (resolutionPattern.test(lines[i])) {
      const relativePath = lines[i + 1].trim();
      // Resolve relative URL using standard URL API
      // (naive split('/') breaks when query params contain '/' like acl=*/kr)
      const baseUrl = new URL(relativePath, path).href;
      return baseUrl;
    }
  }

  throw new Error(`${resolution}p resolution stream not found`);
}

/**
 * Get clip info
 */
async function getClipInfo(clipNo, cookies) {
  client.setCookies(cookies);

  const apiUrl =
    (client.getEndpoint('clipInfo') || `${DEFAULTS.CHZZK_API}/service/v1/clips/{clipNo}/detail`)
      .replace('{clipNo}', clipNo) + '?optionalProperties=OWNER_CHANNEL';

  const data = await client.fetchJson(apiUrl);
  const content = data.content || {};

  const videoId = content.videoId || null;
  const vodStatus = content.vodStatus || null;

  const title = (content.clipTitle || 'Unknown Title').replace(/[\\/:\*\?"<>|\n]/g, '');

  const metadata = {
    title,
    thumbnailImageUrl: content.thumbnailImageUrl || '',
    category: content.clipCategory || 'Unknown Category',
    channelName: content.optionalProperty?.ownerChannel?.channelName || 'Unknown Channel',
    channelImageUrl: content.optionalProperty?.ownerChannel?.channelImageUrl || '',
    createdDate: content.createdDate || 'Unknown Date',
    duration: content.duration || 0,
  };

  return { videoId, vodStatus, metadata };
}

/**
 * Get clip manifest (resolution list)
 */
async function getClipManifest(clipId, cookies) {
  client.setCookies(cookies);

  const manifestUrl =
    (client.getEndpoint('clipManifest') || `${DEFAULTS.VIDEOHUB_API}/shortformhub/feeds/v3/card`)
    + `?serviceType=CHZZK&seedMediaId=${clipId}&mediaType=VOD`;

  const data = await client.fetchJson(manifestUrl);

  const content = data.card?.content || {};
  if (content.error) {
    return { resolutions: null, autoResolution: null, autoBaseUrl: null, error: content.error };
  }

  const videoList = content.vod?.playback?.videos?.list || [];
  const reps = [];

  for (const video of videoList) {
    const encoding = video.encodingOption || {};
    const width = encoding.width;
    const height = encoding.height;
    const sourceUrl = video.source;

    if (width && height && sourceUrl) {
      const resolution = Math.min(parseInt(width), parseInt(height));
      reps.push({ resolution, baseUrl: sourceUrl });
    }
  }

  reps.sort((a, b) => a.resolution - b.resolution);

  return {
    resolutions: reps,
    autoResolution: reps.length > 0 ? reps[reps.length - 1].resolution : null,
    autoBaseUrl: reps.length > 0 ? reps[reps.length - 1].baseUrl : null,
    error: null,
  };
}

/**
 * Main fetch content function — combines URL parsing + metadata + manifest
 */
async function fetchContentData(vodUrl, cookies, downloadPath) {
  const { contentType, contentNo } = extractContentNo(vodUrl);

  if (!contentType || !contentNo) {
    throw new Error(`유효하지 않은 URL: ${vodUrl}`);
  }

  let result;

  if (contentType === 'video') {
    const info = await getVideoInfo(contentNo, cookies);

    if (info.adult && !info.videoId) {
      throw new Error(`쿠키 값이 유효하지 않습니다: ${vodUrl}`);
    }

    let manifestData;
    let finalContentType = 'video';

    if (info.liveRewindPlaybackJson) {
      manifestData = getVideoM3u8Manifest(info.liveRewindPlaybackJson);
      finalContentType = 'm3u8';
    } else {
      manifestData = await getVideoDashManifest(info.videoId, info.inKey);
    }

    if (!manifestData.resolutions || manifestData.resolutions.length === 0) {
      throw new Error(`매니페스트를 가져올 수 없습니다: ${vodUrl}`);
    }

    result = {
      vodUrl,
      ...info.metadata,
      contentType: finalContentType,
      resolutions: manifestData.resolutions,
      autoResolution: manifestData.autoResolution,
      autoBaseUrl: manifestData.autoBaseUrl,
      dashManifestUrl: manifestData.manifestUrl || null,
      downloadPath,
      liveRewindPlaybackJson: info.liveRewindPlaybackJson,
      thumbnailUrl: info.metadata.thumbnailImageUrl,
      channelImageUrl: info.metadata.channelImageUrl,
    };
  } else if (contentType === 'clips') {
    const info = await getClipInfo(contentNo, cookies);

    if (info.vodStatus === 'NONE') {
      throw new Error(`인코딩되지 않은 영상(.m3u8): ${vodUrl}`);
    }

    const manifestData = await getClipManifest(info.videoId, cookies);

    if (manifestData.error && manifestData.error.errorCode === 'ADULT_AUTH_REQUIRED') {
      throw new Error(`쿠키 값이 유효하지 않습니다: ${vodUrl}`);
    }

    if (!manifestData.resolutions || manifestData.resolutions.length === 0) {
      throw new Error(`매니페스트를 가져올 수 없습니다: ${vodUrl}`);
    }

    result = {
      vodUrl,
      ...info.metadata,
      contentType: 'clip',
      resolutions: manifestData.resolutions,
      autoResolution: manifestData.autoResolution,
      autoBaseUrl: manifestData.autoBaseUrl,
      downloadPath,
      liveRewindPlaybackJson: null,
      thumbnailUrl: info.metadata.thumbnailImageUrl,
      channelImageUrl: info.metadata.channelImageUrl,
    };
  }

  return result;
}

module.exports = {
  extractContentNo,
  getVideoInfo,
  getVideoDashManifest,
  getVideoM3u8Manifest,
  getVideoM3u8BaseUrl,
  getClipInfo,
  getClipManifest,
  fetchContentData,
};
