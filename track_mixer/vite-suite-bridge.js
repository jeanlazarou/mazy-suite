import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Dev/preview bridge to the suite's data tree (../data), because the browser
// must both read stems and WRITE mix.json / mixdown.wav next to them:
//
//   GET /__suite/list                     → songs found under data/stems/
//   GET /__suite/file/<path-under-data>   → stream a data file
//   PUT /__suite/file/<path-under-data>   → write (mix.json / mixdown.wav only)

const DATA_DIR = fileURLToPath(new URL('../data', import.meta.url));
const AUDIO_EXT = /\.(wav|mp3|ogg|flac|m4a)$/i;
const WRITABLE = new Set(['mix.json', 'mixdown.wav']);
const MIME = {
  '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
  '.flac': 'audio/flac', '.m4a': 'audio/mp4',
  '.json': 'application/json', '.srt': 'text/plain; charset=utf-8',
};

function listSongs() {
  const stemsRoot = path.join(DATA_DIR, 'stems');
  if (!fs.existsSync(stemsRoot)) return [];
  const out = [];
  for (const album of fs.readdirSync(stemsRoot, { withFileTypes: true })) {
    if (!album.isDirectory()) continue;
    for (const song of fs.readdirSync(path.join(stemsRoot, album.name), { withFileTypes: true })) {
      if (!song.isDirectory()) continue;
      const dir = path.join(stemsRoot, album.name, song.name);
      const files = fs.readdirSync(dir);
      const stems = files.filter((f) => AUDIO_EXT.test(f) && f.toLowerCase() !== 'mixdown.wav');
      if (!stems.length) continue;
      const srtInFolder = files.find((f) => /\.srt$/i.test(f));
      const srt = srtInFolder
        ? `stems/${album.name}/${song.name}/${srtInFolder}`
        : fs.existsSync(path.join(DATA_DIR, 'lyrics', `${song.name}.srt`))
          ? `lyrics/${song.name}.srt`
          : null;
      out.push({
        album: album.name,
        song: song.name,
        stems: stems.sort(),
        hasMix: files.includes('mix.json'),
        srt,
      });
    }
  }
  return out;
}

function safeDataPath(rel) {
  const p = path.normalize(path.join(DATA_DIR, rel));
  return p.startsWith(DATA_DIR + path.sep) ? p : null;
}

function handler(req, res, next) {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/__suite/list') {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(listSongs()));
    return;
  }
  if (url.pathname.startsWith('/__suite/file/')) {
    const rel = decodeURIComponent(url.pathname.slice('/__suite/file/'.length));
    const p = safeDataPath(rel);
    if (!p) {
      res.statusCode = 403;
      res.end('forbidden');
      return;
    }
    if (req.method === 'GET') {
      if (!fs.existsSync(p) || !fs.statSync(p).isFile()) {
        res.statusCode = 404;
        res.end('not found');
        return;
      }
      res.setHeader('content-type', MIME[path.extname(p).toLowerCase()] ?? 'application/octet-stream');
      fs.createReadStream(p).pipe(res);
      return;
    }
    if (req.method === 'PUT') {
      if (!WRITABLE.has(path.basename(p)) || !fs.existsSync(path.dirname(p))) {
        res.statusCode = 403;
        res.end('only mix.json / mixdown.wav in an existing song folder');
        return;
      }
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        fs.writeFileSync(p, Buffer.concat(chunks));
        res.end('ok');
      });
      return;
    }
  }
  next();
}

export function suiteBridge() {
  return {
    name: 'suite-bridge',
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}
