// Access to the suite's data tree via the dev-server suite bridge
// (vite-suite-bridge.js). All functions degrade gracefully when the bridge
// is unavailable (e.g. a static production build).

const fileUrl = (rel) => `/__suite/file/${rel.split('/').map(encodeURIComponent).join('/')}`;

export async function fetchSuiteSongs() {
  try {
    const r = await fetch('/__suite/list');
    if (!r.ok) return [];
    return await r.json();
  } catch {
    return [];
  }
}

export async function fetchDataFile(rel) {
  try {
    const r = await fetch(fileUrl(rel));
    return r.ok ? r : null;
  } catch {
    return null;
  }
}

export async function putDataFile(rel, body, contentType) {
  try {
    const r = await fetch(fileUrl(rel), {
      method: 'PUT',
      headers: { 'content-type': contentType },
      body,
    });
    return r.ok;
  } catch {
    return false;
  }
}

export const songDir = (song) => `stems/${song.album}/${song.title}`;
