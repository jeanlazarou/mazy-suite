/**
 * Sequences saved by name, per album, in this browser's localStorage.
 *
 * Tracks are kept as the album writes their urls (Track.sourceUrl), not as
 * they are fetched, so a save survives a site whose urls get rebased.
 */

export interface SavedSequence {
  name: string;
  /** Track urls as written in the album file, in sequence order */
  tracks: string[];
  /** ISO date */
  savedAt: string;
}

const key = (album: string) => `sequence-builder:sequences:${album}`;

const isSaved = (s: any): s is SavedSequence =>
  s && typeof s.name === 'string' && Array.isArray(s.tracks) && typeof s.savedAt === 'string';

/** The album's saved sequences, most recent first */
export function listSequences(album: string): SavedSequence[] {
  try {
    const list = JSON.parse(localStorage.getItem(key(album)) ?? '[]');
    return Array.isArray(list) ? list.filter(isSaved) : [];
  } catch {
    return [];
  }
}

function write(album: string, list: SavedSequence[]): boolean {
  try {
    localStorage.setItem(key(album), JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

/** Saves under `name`, replacing a sequence of the same name. False when the browser would not store it. */
export function saveSequence(album: string, name: string, tracks: string[]): boolean {
  const list = listSequences(album).filter(s => s.name !== name);
  return write(album, [{ name, tracks, savedAt: new Date().toISOString() }, ...list]);
}

export function deleteSequence(album: string, name: string): void {
  write(album, listSequences(album).filter(s => s.name !== name));
}
