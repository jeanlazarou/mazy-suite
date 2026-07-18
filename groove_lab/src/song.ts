import type { Pattern, Section, Song } from "./types";
import { createDefaultPattern } from "./pattern";

function newId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)
  );
}

export function createDefaultSong(): Song {
  const section: Section = {
    id: newId(),
    name: "A",
    pattern: createDefaultPattern(),
  };
  return { sections: [section], arrangement: [section.id] };
}

/** First unused letter A–Z, then S27, S28, … */
export function nextSectionName(song: Song): string {
  for (let i = 0; i < 26; i++) {
    const name = String.fromCharCode(65 + i);
    if (!song.sections.some((s) => s.name === name)) return name;
  }
  return `S${song.sections.length + 1}`;
}

/** Add a section owning `pattern` (callers pass a copy of the current one). */
export function addSection(
  song: Song,
  pattern: Pattern,
): { song: Song; id: string } {
  const section: Section = { id: newId(), name: nextSectionName(song), pattern };
  return { song: { ...song, sections: [...song.sections, section] }, id: section.id };
}

/** Remove a section and its arrangement entries. The last section stays. */
export function removeSection(song: Song, id: string): Song {
  if (song.sections.length <= 1) return song;
  return {
    sections: song.sections.filter((s) => s.id !== id),
    arrangement: song.arrangement.filter((a) => a !== id),
  };
}

export function updateSectionPattern(
  song: Song,
  id: string,
  pattern: Pattern,
): Song {
  return {
    ...song,
    sections: song.sections.map((s) => (s.id === id ? { ...s, pattern } : s)),
  };
}

export function appendToArrangement(song: Song, id: string): Song {
  if (!song.sections.some((s) => s.id === id)) return song;
  return { ...song, arrangement: [...song.arrangement, id] };
}

export function removeArrangementAt(song: Song, index: number): Song {
  return {
    ...song,
    arrangement: song.arrangement.filter((_, i) => i !== index),
  };
}

/** Patterns in play order; dangling arrangement ids are skipped. */
export function arrangementPatterns(song: Song): Pattern[] {
  const byId = new Map(song.sections.map((s) => [s.id, s.pattern]));
  return song.arrangement
    .map((id) => byId.get(id))
    .filter((p): p is Pattern => p !== undefined);
}
