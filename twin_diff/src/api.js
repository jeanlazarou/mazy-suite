// Reading the suite's data tree. Run on its own, the app serves it at ./data
// (a symlink made by scripts/link_data.sh) and its audio at ./music/files. On
// the suite's demo site the apps live one folder down and share the site's
// /data and /music, so they are at ../ instead. Which one is found out once,
// from where twins.json answers.

let rootPromise = null;

async function answersJson(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) return false;
    // a dev server answers a missing file with the app's index.html
    return !/^\s*</.test(await response.text());
  } catch {
    return false;
  }
}

function dataRoot() {
  rootPromise ??= answersJson('./data/twins/twins.json').then(async (here) => {
    if (here) return '.';
    return (await answersJson('../data/twins/twins.json')) ? '..' : '.';
  });
  return rootPromise;
}

const encodePath = (path) => path.split('/').map(encodeURIComponent).join('/');

// A suite data path as written in a twin document ("/data/lyrics/x.srt",
// "/music/files/Album/Song.mp3") becomes a URL this app can fetch. Paths are
// human-readable and hold spaces, so every segment is encoded.
export function dataUrl(path, root = '.') {
  const clean = path.replace(/^\/+/, '');
  const rooted = clean.startsWith('data/') || clean.startsWith('music/') ? clean : `data/${clean}`;
  return `${root}/${encodePath(rooted)}`;
}

export async function loadTwinsIndex() {
  const response = await fetch(`${await dataRoot()}/data/twins/twins.json`);
  if (!response.ok) throw new Error(`twins.json: ${response.status}`);
  const entries = await response.json();
  if (!Array.isArray(entries)) throw new Error('twins.json is not an array');
  return entries.filter((e) => e && typeof e.file === 'string');
}

export async function loadTwinFile(file) {
  const url = `${await dataRoot()}/data/twins/${encodePath(file)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${file}: ${response.status}`);
  return response.json();
}

// A text file from the data tree, or null when it is not there — for files
// whose absence is normal, like a side's lyrics.
export async function loadText(url) {
  try {
    const response = await fetch(dataUrl(url, await dataRoot()));
    if (!response.ok) return null;
    const text = await response.text();
    // a dev server answers a missing file with the app's index.html
    return /^\s*<!doctype html/i.test(text) ? null : text;
  } catch {
    return null;
  }
}

export async function loadAudio(url) {
  const response = await fetch(dataUrl(url, await dataRoot()));
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return response.arrayBuffer();
}

// Writing goes through the dev-server bridge (vite-suite-bridge.js), because
// a browser cannot write into the data folder. It degrades to `false` when
// there is no bridge — a static build — and the caller keeps the document in the browser instead.
export async function putDataFile(rel, body) {
  const url = `/__suite/file/${encodePath(rel)}`;
  try {
    const response = await fetch(url, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body,
    });
    return response.ok;
  } catch {
    return false;
  }
}
