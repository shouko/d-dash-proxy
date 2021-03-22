const { spawn } = require('child_process');
const ffmpegPath = require('ffmpeg-static');
const fetch = require('./fetch');
const { upstream } = require('./config');
const { getChannelKey } = require('./key_manager');

const decryptionArgs = (channel) => {
  const key = getChannelKey(channel);
  return key ? ['-decryption_key', key] : []
}

const getSegment = (channel, representation, segment) => new Promise(async (resolve, reject) => {
  const base = `${upstream}/${channel}/${representation}`;
  const segmentUrl = `${base}/${segment}.m4s`;

  const [ segInit, segBody ] = await Promise.all([
    fetch(`${base}/init.mp4`),
    fetch(segmentUrl)
  ]);

  const ffArgs = [
    '-loglevel', 'error',
    '-f', 'mp4',
    ...decryptionArgs(channel),
    '-i', 'pipe:0', '-c', 'copy',
    '-copyts', '-f', 'mpegts',
    'pipe:1'
  ];

  const output = [];
  const ff = spawn(ffmpegPath, ffArgs);

  ff.stdout.on('data', (data) => {
    output.push(data);
  });
  ff.stderr.on('data', (data) => {
    console.error(data.toString());
  });

  ff.on('close', (code) => {
    if (code !== 0) {
      console.error(`FFmpeg exited with ${code}`);
      return reject(code);
    }
    return resolve(Buffer.concat(output));
  });

  ff.stdin.write(segInit);
  ff.stdin.write(segBody);
  ff.stdin.end();
});

module.exports = {
  getSegment
};