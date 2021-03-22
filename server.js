const express = require('express');
const morgan = require('morgan');
const {
  upstream,
  basePath,
  port,
  useMorgan,
} = require('./config');
const fetch = require('./fetch');
const { getSegment } = require('./segment');
const { getChannelKey, resolveChannelKeyId } = require('./key_manager');
const channels = require('./channels.json');

const app = express();
if (useMorgan) app.use(morgan('combined'));
app.disable('x-powered-by');
app.set("view engine", "ejs");

app.get('/', (req, res) => res.send('Hello World!'));

app.get(`${basePath}/:channel?`, (req, res) => {
  const { channel } = req.params;
  res.render('player.ejs', {
    basePath,
    channel,
    channels
  });
});

const playlistHandler =  async (req, res) => {
  const { channel, representation } = req.params;
  try {
    const path = representation ? `${representation}/init.m3u8` : 'manifest.m3u8';
    let playlist = await fetch(`${upstream}/${channel}/${path}`);
    if (representation) {
      playlist = playlist.split('\n').filter((line) => {
        return !line.match(/#EXT-X-KEY:.+URI="skd:\/\/(\w+)"/);
      }).join('\n');
    }
    res.contentType('.m3u8');
    if (!getChannelKey(channel)) await resolveChannelKeyId(channel);
    return res.send(playlist.replace(new RegExp(upstream, 'g'), basePath));
  } catch(e) {
    console.error(e);
    return res.sendStatus(404);
  }
}
app.get(`${basePath}/:channel/playlist.m3u8`, playlistHandler);
app.get(`${basePath}/:channel/:representation/init.m3u8`, playlistHandler);

app.get(`${basePath}/:channel/:representation.hls/:segment.ts`, async (req, res) => {
  const { channel, representation, segment } = req.params;
  try {
    const decoded = await getSegment(channel, representation, segment);
    res.contentType('.ts');
    res.send(decoded);
  } catch(e) {
    console.error(e);
    return res.sendStatus(404);
  }
});

const listener = app.listen(port, () => {
  console.log(`Server available on http://localhost:${listener.address().port}/`);
});
