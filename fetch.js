const fetch = require('node-fetch');
const https = require('https');
const LRU = require('lru-cache');

const httpsAgent = new https.Agent({ keepAlive: true });
const cache = new LRU({
  max: 50,
  maxAge: 60 * 60 * 1000,
});

module.exports = async (url, options = {}) => {
  if (cache.has(url)) {
    return cache.get(url);
  }
  const cachable = url.endsWith('init.mp4') || url.endsWith('.mpd');
  const isText = url.endsWith('.m3u8') || url.endsWith('.mpd');

  return fetch(url, {
    agent: httpsAgent,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.13; rv:62.0) Gecko/20100101 Firefox/62.0'
    },
    ...options
  }).then((r) => {
    if (isText) return r.text()
    return r.arrayBuffer().then((ab) => Buffer.from(ab));
  }).then((r) => {
    if (cachable) cache.set(url, r);
    return r;
  });
};