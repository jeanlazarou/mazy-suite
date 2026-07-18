import type { DrumLane, Song } from "./types";
import { DRUM_LANES } from "./types";

// MIDI_EXPORT_NOTES.md §3: persist the pattern JSON (the inputs), never only
// rendered output — a saved song can always be re-exported after a fix.
//
// Layout: one library key holding every song plus which one is open.
// Songs are a few KB of JSON each, far below localStorage limits.

const LIB_KEY = "grooveLab.library.v1";
const LEGACY_KEY = "grooveLab.song.v1"; // single-song era

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export interface SongMeta {
  id: string;
  name: string;
  updatedAt: string; // ISO
}

interface LibraryEntry extends SongMeta {
  song: Song;
}

interface Library {
  currentId: string | null;
  songs: LibraryEntry[];
}

export function createSongId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)
  );
}

/** Structural check + repair of one song; null when unsalvageable. */
function validateSong(raw: unknown): Song | null {
  const song = raw as Song;
  if (
    typeof song !== "object" ||
    song === null ||
    !Array.isArray(song.sections) ||
    song.sections.length === 0
  ) {
    return null;
  }
  for (const section of song.sections) {
    if (
      typeof section.id !== "string" ||
      typeof section.name !== "string" ||
      typeof section.pattern !== "object" ||
      section.pattern === null ||
      typeof section.pattern.drums !== "object" ||
      section.pattern.drums === null ||
      !Array.isArray(section.pattern.bass)
    ) {
      return null;
    }
    // Older saves may predate newly added lanes — fill them in.
    for (const lane of DRUM_LANES) {
      section.pattern.drums[lane.id as DrumLane] ??= [];
    }
  }
  const ids = new Set(song.sections.map((s) => s.id));
  song.arrangement = Array.isArray(song.arrangement)
    ? song.arrangement.filter((id) => ids.has(id))
    : [];
  return song;
}

function readLibrary(storage: StorageLike): Library {
  try {
    const raw = storage.getItem(LIB_KEY);
    if (raw) {
      const lib = JSON.parse(raw) as Library;
      if (!Array.isArray(lib.songs)) return { currentId: null, songs: [] };
      const songs: LibraryEntry[] = [];
      for (const entry of lib.songs) {
        const song = validateSong(entry?.song);
        if (song && typeof entry.id === "string" && typeof entry.name === "string") {
          songs.push({
            id: entry.id,
            name: entry.name,
            updatedAt: typeof entry.updatedAt === "string" ? entry.updatedAt : "",
            song,
          });
        }
      }
      return {
        currentId: typeof lib.currentId === "string" ? lib.currentId : null,
        songs,
      };
    }
    // Migrate the single-song era into a one-entry library.
    const legacy = storage.getItem(LEGACY_KEY);
    if (legacy) {
      const song = validateSong(JSON.parse(legacy));
      if (song) {
        const entry: LibraryEntry = {
          id: createSongId(),
          name: "My first groove",
          updatedAt: new Date().toISOString(),
          song,
        };
        const lib: Library = { currentId: entry.id, songs: [entry] };
        writeLibrary(lib, storage);
        storage.removeItem(LEGACY_KEY);
        return lib;
      }
    }
  } catch (err) {
    console.warn("Could not read the song library", err);
  }
  return { currentId: null, songs: [] };
}

function writeLibrary(lib: Library, storage: StorageLike): void {
  try {
    storage.setItem(LIB_KEY, JSON.stringify(lib));
  } catch (err) {
    console.warn("Could not save the song library", err);
  }
}

export function loadCurrentSong(
  storage: StorageLike = localStorage,
): { id: string; name: string; song: Song } | null {
  const lib = readLibrary(storage);
  const entry =
    lib.songs.find((s) => s.id === lib.currentId) ??
    [...lib.songs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  return entry ? { id: entry.id, name: entry.name, song: entry.song } : null;
}

/** Upsert a song and mark it as the open one. */
export function saveCurrentSong(
  id: string,
  name: string,
  song: Song,
  storage: StorageLike = localStorage,
): void {
  const lib = readLibrary(storage);
  const entry: LibraryEntry = {
    id,
    name,
    updatedAt: new Date().toISOString(),
    song,
  };
  const idx = lib.songs.findIndex((s) => s.id === id);
  if (idx >= 0) lib.songs[idx] = entry;
  else lib.songs.push(entry);
  lib.currentId = id;
  writeLibrary(lib, storage);
}

/** Metadata of every saved song, most recently touched first. */
export function listSongs(storage: StorageLike = localStorage): SongMeta[] {
  return readLibrary(storage)
    .songs.map(({ id, name, updatedAt }) => ({ id, name, updatedAt }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getSongById(
  id: string,
  storage: StorageLike = localStorage,
): { id: string; name: string; song: Song } | null {
  const entry = readLibrary(storage).songs.find((s) => s.id === id);
  return entry ? { id: entry.id, name: entry.name, song: entry.song } : null;
}

export function deleteSongById(
  id: string,
  storage: StorageLike = localStorage,
): void {
  const lib = readLibrary(storage);
  lib.songs = lib.songs.filter((s) => s.id !== id);
  if (lib.currentId === id) lib.currentId = lib.songs[0]?.id ?? null;
  writeLibrary(lib, storage);
}
