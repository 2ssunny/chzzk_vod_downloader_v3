/**
 * Chzzk API client module
 * HTTP client with cookie management and User-Agent headers
 */

const DEFAULTS = {
  CHZZK_API: 'https://api.chzzk.naver.com',
  NAVER_API: 'https://apis.naver.com',
  VIDEOHUB_API: 'https://api-videohub.naver.com',
};

class ChzzkClient {
  constructor() {
    this.cookies = { NID_AUT: '', NID_SES: '' };
    this.endpoints = null; // Will be loaded from remote config
    this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
  }

  setCookies(cookies) {
    this.cookies = { ...this.cookies, ...cookies };
  }

  setEndpoints(endpoints) {
    this.endpoints = endpoints;
  }

  getEndpoint(key) {
    return this.endpoints?.[key] || null;
  }

  getCookieString() {
    const parts = [];
    if (this.cookies.NID_AUT) parts.push(`NID_AUT=${this.cookies.NID_AUT}`);
    if (this.cookies.NID_SES) parts.push(`NID_SES=${this.cookies.NID_SES}`);
    return parts.join('; ');
  }

  async fetch(url, options = {}) {
    const headers = {
      'User-Agent': this.userAgent,
      ...(options.headers || {}),
    };

    const cookieStr = this.getCookieString();
    if (cookieStr) {
      headers['Cookie'] = cookieStr;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response;
  }

  async fetchJson(url, options = {}) {
    const response = await this.fetch(url, options);
    return response.json();
  }

  async fetchText(url, options = {}) {
    const response = await this.fetch(url, options);
    return response.text();
  }
}

// Singleton
const client = new ChzzkClient();

module.exports = { client, DEFAULTS };
