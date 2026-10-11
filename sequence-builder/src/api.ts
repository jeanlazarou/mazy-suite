/**
 * Reading the suite's albums.
 *
 * Run on its own, the app serves the suite's data at ./data and its audio at
 * ./music/files (symlinks made by scripts/link_data.sh). On the suite's demo
 * site the apps live one folder down and share the site's /data and /music,
 * so they are at ../ instead. Which one is found out once, from where
 * albums.json answers.
 */

import { Album, Playlist, RawPlaylist } from './types';

interface AlbumEntry {
  name: string;
  image?: string;
  color?: string;
}

let rootPromise: Promise<string> | null = null;

async function answersJson(url: string): Promise<boolean> {
  try {
    const response = await fetch(url);
    if (!response.ok) return false;
    // a dev server answers a missing file with the app's index.html
    return !/^\s*</.test(await response.text());
  } catch {
    return false;
  }
}

function dataRoot(): Promise<string> {
  rootPromise ??= answersJson('./data/albums.json').then(async (here) => {
    if (here) return '.';
    return (await answersJson('../data/albums.json')) ? '..' : '.';
  });
  return rootPromise;
}

const encodePath = (path: string) => path.split('/').map(encodeURIComponent).join('/');

/**
 * A track url is used as the album writes it, as the player does: it is
 * already right for the page — "/music/files/Album/Song.mp3" from the server
 * root, or "../music/files/..." once the demo site rewrote it relative to the
 * app. Not rebased on the data root: the audio need not sit next to the data
 * (a site serving /music/sequence/ and /music/files/ has no
 * /music/music/files). Paths are human-readable and hold spaces, so every
 * segment is encoded.
 */
function audioUrl(url: string): string {
  if (/^https?:\/\//.test(url)) return url;
  return encodePath(url);
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return response.json();
}

export async function loadAlbums(): Promise<Album[]> {
  const root = await dataRoot();
  const entries = await fetchJson<AlbumEntry[]>(`${root}/data/albums.json`);

  const albums = await Promise.all(
    entries.map(async ({ name, image, color }): Promise<Album | null> => {
      try {
        const raw = await fetchJson<RawPlaylist>(`${root}/data/${encodeURIComponent(name)}.json`);
        return {
          name,
          title: raw.title,
          trackCount: raw.playlist.length,
          cover: `${root}/data/${encodeURIComponent(name)}.${image ?? 'jpg'}`,
          color
        };
      } catch (error) {
        console.warn(`Skipping album ${name}:`, error);
        return null;
      }
    })
  );

  return albums.filter((a): a is Album => a !== null);
}

export async function loadAlbum(name: string): Promise<Playlist> {
  const root = await dataRoot();
  const raw = await fetchJson<RawPlaylist>(`${root}/data/${encodeURIComponent(name)}.json`);

  return {
    title: raw.title,
    tracks: raw.playlist.map(track => ({
      ...track,
      sourceUrl: track.url,
      url: audioUrl(track.url)
    }))
  };
}
