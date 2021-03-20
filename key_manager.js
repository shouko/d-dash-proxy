const LRU = require('lru-cache');
const fetch = require('./fetch');
const { upstream } = require('./config');
const keysData = require('./keys.json');

const table = new LRU({
  max: 100,
  maxAge: 24 * 60 * 60 * 1000,
});

const keys = new Map(keysData);

const setChannelKeyId = (channel, keyId) => {
  table.set(channel, keyId.replace(/-/g, '').toLowerCase());
};

const getChannelKey = (channel) => {
  const kid = table.get(channel);
  return keys.get(kid);
};

const resolveChannelKeyId = (channel) => fetch(`${upstream}/${channel}/manifest.mpd`).then((r) => {
  const matches = r.match(/cenc:default_KID="([^"]+)"/);
  if (!matches) return false;
  setChannelKeyId(channel, matches[1]);
});

module.exports = {
  resolveChannelKeyId,
  setChannelKeyId,
  getChannelKey,
}