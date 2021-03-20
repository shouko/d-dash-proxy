const { DashStream } = require('./dash');

const s = new DashStream('https://example.com/live/foo/manifest.mpd');
s.start();