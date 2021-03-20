const fs = require('fs');
const fetch = require('node-fetch');
const { DOMParser } = require('xmldom');
const parser = new DOMParser()
const Queue = require('better-queue');
const https = require('https');
const net = require('net');

function deliverSegment({p, url, stime, type}, cb) {
  p.then(b => {
    let stream = videoStream;
    if (type == 'audio') stream = audioStream;
    const shouldContinue = stream.write(b);
    if (shouldContinue) {
      console.log([`Delivered ${url} in ${new Date() - stime}`]);
      return cb(null);
    }
    console.warn('Backpressure!');
    const waitStart = new Date();
    stream.once('drain', () => {
      const d = new Date();
      console.log([`Delivered ${url} in ${d - stime}, waited ${d - waitStart}`]);
      cb(null);
    });
  });
}

let videoInit = null;
let audioInit = null;
const videoQueue = new Queue(deliverSegment);
const audioQueue = new Queue(deliverSegment);

const options = {
  agent: new https.Agent({
    keepAlive: true
  })
};

const urls = new Set();
const streamOptions = {
  highWaterMark: 64*1024*1024
};
let videoStream = fs.createWriteStream('pipe_video.mp4', streamOptions);
let audioStream = fs.createWriteStream('pipe_audio.mp4', streamOptions);

/*
async function createPipe(name) {
  const flags = fs.constants.O_RDWR | fs.constants.O_NONBLOCK;
  return new Promise((resolve, reject) => {
    fs.open(name, flags, (err, fd) => {
      if (err) return reject(err);
      resolve(new net.Socket({fd, readable: false}));
    });
  });
}

createPipe('pipe_audio.mp4').then(p => {
  audioStream = p;
});
createPipe('pipe_video.mp4').then(p => {
  videoStream = p;
});
*/

const manifest = process.argv[2];

function toIterable(x) {
  const arr = [];
  for (let i = 0; i < x.length; i++) {
    arr.push(x[i]);
  }
  return arr;
}

function getIterableEls(d, name) {
  return toIterable(d.getElementsByTagName(name));
}

function getAttribute(e, name) {
  return toIterable(e.attributes).find(x => x.localName.toLowerCase() == name.toLowerCase()).value
}

function getUrl(baseUrl, template, bandwidth, time) {
  return `${baseUrl}${template.replace('$Bandwidth$', bandwidth).replace('$Time$', time)}`
}

function fetchSimple(url) {
  return fetch(url, options).then(r => r.arrayBuffer()).then(b => Buffer.from(b));
}

function fetchWithRetries(url) {
  return new Promise((resolve, reject) => {
    fetchSimple(url).then(r => {
      resolve(r);
    }).catch(e => {
      // should retry
    });
    setTimeout(() => {
      fetchWithRetries(url).then((r) => {
        console.warn(`Retried ${url}`);
        resolve(r);
      });
    }, 1000);
  })
}

function pushJob(url, mime) {
  if (urls.has(url)) return;
  urls.add(url);

  console.log(`Downloading ${url}`);
  const j = {
    p: fetch(url, options).then(r => r.arrayBuffer()).then(b => Buffer.from(b)),
    type: mime.startsWith('audio') ? 'audio' : 'video',
    url,
    stime: new Date()
  };
  const q = mime.startsWith('audio') ? audioQueue : videoQueue;
  q.push(j);
}

async function readPlaylist() {
  const playlistBody = await fetch(manifest).then(e => e.text());

  const d = parser.parseFromString(playlistBody, 'text/xml').documentElement;

  const baseUrl = getIterableEls(d, 'BaseURL')[0].textContent;
  console.log(baseUrl)

  const adaptations = getIterableEls(d, 'AdaptationSet').map(adaptation => {
    const jobs = [];
    const template = getIterableEls(adaptation, 'SegmentTemplate')[0];
    const urlTemplate = {
      init: getAttribute(template, 'initialization'),
      media: getAttribute(template, 'media')
    };

    const ss = getIterableEls(getIterableEls(template, 'SegmentTimeline')[0], 'S');
    let baseTime = getAttribute(ss[0], 't');

    let bestBand = 0;
    let bestRep = null;
    const reps = getIterableEls(adaptation, 'Representation');
    reps.forEach(r => {
      const curBand = parseInt(getAttribute(r, 'bandwidth'));
      if (curBand > bestBand) {
        bestBand = curBand;
        bestRep = r;
      }
    });

//    console.log(['bandwidth', 'mimetype'].map(attr => getAttribute(bestRep, attr)))
    const mime = getAttribute(bestRep, 'mimetype');
    jobs.push([getUrl(baseUrl, urlTemplate.init, getAttribute(bestRep, 'bandwidth'), baseTime), mime]);
    jobs.push([getUrl(baseUrl, urlTemplate.media, getAttribute(bestRep, 'bandwidth'), baseTime), mime]);
    let time = parseInt(baseTime);
    ss.forEach(s => {
      time += parseInt(getAttribute(s, 'd'));
      jobs.push([getUrl(baseUrl, urlTemplate.media, getAttribute(bestRep, 'bandwidth'), time), mime]);
    });
    return jobs;
  });

  const maxlen = adaptations.reduce((a, b) => a.length > b.length ? a : b, []).length;
  for (let i = 0; i < maxlen; i++) {
    adaptations.forEach(a => {
      if (i < a.length) {
        pushJob(...a[i]);
      }
    });
  }

  setTimeout(readPlaylist, 10000);
}

readPlaylist();
