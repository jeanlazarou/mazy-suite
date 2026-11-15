import type { Pattern, Song } from "./types";
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

const finite = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Make a stored or imported pattern safe to render: clamp what can be
 * clamped, drop hits and notes that can't be placed. False when the grid
 * itself (bars, steps per bar) is unusable.
 */
function repairPattern(p: Pattern): boolean {
  if (!Number.isInteger(p.bars) || p.bars < 1 || p.bars > 16) return false;
  if (!Number.isInteger(p.stepsPerBar) || p.stepsPerBar < 1 || p.stepsPerBar > 64) {
    return false;
  }
  const total = p.bars * p.stepsPerBar;
  p.bpm = finite(p.bpm) && p.bpm > 0 ? clamp(p.bpm, 40, 240) : 100;
  p.swing = finite(p.swing) ? clamp(p.swing, 0, 1) : 0;
  const inGrid = (step: unknown): step is number =>
    Number.isInteger(step) && (step as number) >= 0 && (step as number) < total;
  // Older saves may predate newly added lanes — fill them in.
  for (const lane of DRUM_LANES) {
    const hits: unknown = p.drums[lane.id];
    p.drums[lane.id] = (Array.isArray(hits) ? hits : [])
      .filter((h) => h && inGrid(h.step) && finite(h.velocity))
      .map((h) => ({ step: h.step, velocity: clamp(h.velocity, 0, 1) }));
  }
  p.bass = p.bass
    .filter(
      (n) =>
        n &&
        inGrid(n.step) &&
        Number.isInteger(n.durationSteps) &&
        n.durationSteps >= 1 &&
        Number.isInteger(n.midiPitch) &&
        n.midiPitch >= 0 &&
        n.midiPitch <= 127 &&
        finite(n.velocity),
    )
    .map((n) => ({ ...n, velocity: clamp(n.velocity, 0, 1) }));
  const chords: unknown = p.chords;
  if (
    chords !== undefined &&
    !(Array.isArray(chords) && chords.every((c) => typeof c === "string"))
  ) {
    delete p.chords; // unreadable chords mustn't sink the song
  }
  return true;
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
    if (!repairPattern(section.pattern)) return null;
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

// ---- song files: back up songs, or move them to another browser or site ----
// (localStorage is per site address, so a deployed copy starts empty.)

export const SONG_FILE_FORMAT = 1;

export interface SongFileEntry {
  name: string;
  updatedAt: string;
  song: Song;
}

export interface SongFile {
  groove_lab: number; // file format version
  app: string; // app version that wrote it
  exported: string; // ISO
  songs: SongFileEntry[];
}

export function makeSongFile(songs: SongFileEntry[], app: string): SongFile {
  return {
    groove_lab: SONG_FILE_FORMAT,
    app,
    exported: new Date().toISOString(),
    songs,
  };
}

/** Every saved song, most recently touched first. */
export function allSongs(storage: StorageLike = localStorage): SongFileEntry[] {
  return readLibrary(storage)
    .songs.map(({ name, updatedAt, song }) => ({ name, updatedAt, song }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export interface ImportResult {
  added: { id: string; name: string }[];
  duplicates: number; // same name and content as a song already here
  unreadable: number;
}

/**
 * Add the songs of a song file to the library, each under a fresh id (an
 * import never overwrites). The open song doesn't change. Null when `raw`
 * isn't a song file at all.
 */
export function importSongFile(
  raw: unknown,
  storage: StorageLike = localStorage,
): ImportResult | null {
  const entries = (raw as { songs?: unknown } | null)?.songs;
  if (typeof raw !== "object" || raw === null || !Array.isArray(entries)) {
    return null;
  }
  const lib = readLibrary(storage);
  const known = new Set(lib.songs.map((s) => s.name + "\n" + JSON.stringify(s.song)));
  const result: ImportResult = { added: [], duplicates: 0, unreadable: 0 };
  for (const entry of entries) {
    let song: Song | null = null;
    try {
      song = validateSong(entry?.song);
    } catch {
      song = null;
    }
    if (!song) {
      result.unreadable += 1;
      continue;
    }
    const name =
      typeof entry.name === "string" && entry.name.trim() ? entry.name : "Imported song";
    const key = name + "\n" + JSON.stringify(song);
    if (known.has(key)) {
      result.duplicates += 1;
      continue;
    }
    known.add(key);
    const id = createSongId();
    lib.songs.push({
      id,
      name,
      updatedAt: typeof entry.updatedAt === "string" ? entry.updatedAt : new Date().toISOString(),
      song,
    });
    result.added.push({ id, name });
  }
  if (result.added.length > 0) writeLibrary(lib, storage);
  return result;
}
