const fs = require('fs');
const path = require('path');
const os = require('os');

const APP_NAME = 'chzzk-vod-downloader-v3';
const CONFIG_DIR = path.join(
  process.env.APPDATA || path.join(os.homedir(), '.config'),
  APP_NAME
);
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const CONFIG_VERSION = 1;

const DEFAULT_CONFIG = {
  version: CONFIG_VERSION,
  cookies: {
    NID_AUT: '',
    NID_SES: '',
  },
  downloadPath: '',
  afterDownload: 'none',
  language: 'ko_KR',
  localServer: {
    enabled: true,
    port: 36363,
  },
  remoteConfigUrl: '',
  defaultSegmentInterval: 0,
};

function ensureDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

function loadConfig() {
  ensureDir();

  if (!fs.existsSync(CONFIG_FILE)) {
    saveConfig(DEFAULT_CONFIG);
    return { ...DEFAULT_CONFIG };
  }

  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
    const config = JSON.parse(raw);
    // Merge with defaults to ensure all keys exist
    return { ...DEFAULT_CONFIG, ...config };
  } catch (e) {
    console.error('Error reading config:', e);
    return { ...DEFAULT_CONFIG };
  }
}

function saveConfig(config) {
  ensureDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

function getConfigDir() {
  return CONFIG_DIR;
}

module.exports = { loadConfig, saveConfig, getConfigDir, DEFAULT_CONFIG };
