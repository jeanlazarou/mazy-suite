import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Dev/preview bridge to the data folder the app is serving, because the
// browser must WRITE twin documents back next to the audio they describe.
// Modelled on track_mixer's bridge, with one difference: the root is
// public/data resolved through its symlink, so a twin is saved into whichever
// folder scripts/link_data.sh pointed the app at (examples/ in demo mode,
// your own collection in library mode) rather than always the repo's data/.
//
//   PUT /__suite/file/<path-under-data>   → write (twin documents only)
//
// Reading needs no bridge: public/data is served by Vite already.

const PUBLIC_DATA = fileURLToPath(new URL('./public/data', import.meta.url));

const WRITABLE = /^twins\/(twins\.json|[^/]+\/[^/]+\.twin\.json)$/;

function dataRoot() {
  try {
    return fs.realpathSync(PUBLIC_DATA);
  } catch {
    return null;
  }
}

function safePath(root, rel) {
  const resolved = path.normalize(path.join(root, rel));
  return resolved.startsWith(root + path.sep) ? resolved : null;
}

function handler(req, res, next) {
  const url = new URL(req.url, 'http://localhost');
  if (!url.pathname.startsWith('/__suite/file/')) {
    next();
    return;
  }

  const rel = decodeURIComponent(url.pathname.slice('/__suite/file/'.length));
  const root = dataRoot();
  const target = root && safePath(root, rel);

  if (req.method !== 'PUT') {
    res.statusCode = 405;
    res.end('only PUT — reading goes through the served public/data');
    return;
  }
  if (!root) {
    res.statusCode = 503;
    res.end('public/data is not linked — run scripts/link_data.sh');
    return;
  }
  if (!target || !WRITABLE.test(rel)) {
    res.statusCode = 403;
    res.end('only twins/<folder>/<name>.twin.json and twins/twins.json');
    return;
  }

  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => {
    try {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, Buffer.concat(chunks));
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ written: path.relative(root, target) }));
    } catch (error) {
      res.statusCode = 500;
      res.end(String(error.message ?? error));
    }
  });
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
