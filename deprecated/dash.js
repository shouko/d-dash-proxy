const EventEmitter = require("events");
const fs = require('fs');
const fetch = require('node-fetch');
const { DOMParser } = require('xmldom');
const parser = new DOMParser()
const Queue = require('better-queue');
const https = require('https');

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

const options = {
  agent: new https.Agent({
    keepAlive: true
  })
};

function fetchSimple(url) {
  return fetch(url, options).then(r => r.arrayBuffer()).then(b => Buffer.from(b));
}

function fetchWithRetries(url) {
  return new Promise((resolve, reject) => {
    const retryTask = setTimeout(() => {
      fetchWithRetries(url).then((r) => {
        console.warn(`Retried ${url}`);
        resolve(r);
      });
    }, 10000);

    fetchSimple(url).then(r => {
      clearTimeout(retryTask);
      resolve(r);
    }).catch(e => {
      // should retry
      console.error(e);
    });
  })
}

class DashStream {
  constructor(manifest) {
    this.urls = new Set();
    this.manifest = manifest;
    this.emitter = new EventEmitter();
    this.audioInit = null;
    this.videoInit = null;
    this.audioQueue = new Queue(this.deliverSegment);
    this.audioQueue.on('task_finish', (_, result) => {
      if (!this.audioInit) this.audioInit = result;
      this.emitter.emit('audio', result);
    });
    this.videoQueue = new Queue(this.deliverSegment);
    this.videoQueue.on('task_finish', (_, result) => {
      if (!this.videoInit) this.videoInit = result;
      this.emitter.emit('video', result);
    });
    this.active = false;
  }

  deliverSegment({p, url, stime}, cb) {
    p.then(payload => {
      console.log([`Delivered ${url} in ${new Date() - stime}`]);
      cb(null, payload);
    });
  }

  pushJob(url, mime) {
    if (this.urls.has(url)) return;
    this.urls.add(url);
  
    console.log(`Downloading ${url}`);
    const isAudio = mime.startsWith('audio')
    const j = {
      p: fetchWithRetries(url),
      type: isAudio ? 'audio' : 'video',
      url,
      stime: new Date()
    };
    const q = isAudio ? this.audioQueue : this.videoQueue;
    q.push(j);
  }

  on(event, handler) {
    this.emitter.on(event, handler);
  }

  start() {
    this.active = true;
    this.readPlaylist();
  }

  stop() {
    this.active = false;
  }

  async readPlaylist() {
    const playlistBody = await fetch(this.manifest).then(e => e.text());
  
    const d = parser.parseFromString(playlistBody, 'text/xml').documentElement;
  
    const baseUrl = getIterableEls(d, 'BaseURL')[0].textContent;
    console.log(baseUrl)
  
    const adaptations = getIterableEls(d, 'AdaptationSet');
    adaptations.forEach(adaptation => {
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
      this.pushJob(getUrl(baseUrl, urlTemplate.init, getAttribute(bestRep, 'bandwidth'), baseTime), mime);
      this.pushJob(getUrl(baseUrl, urlTemplate.media, getAttribute(bestRep, 'bandwidth'), baseTime), mime);
      let time = parseInt(baseTime);
      ss.forEach(s => {
        time += parseInt(getAttribute(s, 'd'));
        this.pushJob(getUrl(baseUrl, urlTemplate.media, getAttribute(bestRep, 'bandwidth'), time), mime);
      })
    })
  
    if (this.active) setTimeout(() => {
      this.readPlaylist();
    }, 10000);
  }
}

module.exports = {
  DashStream,
};
