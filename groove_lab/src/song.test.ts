import { describe, expect, it, vi } from "vitest";
import {
  addSection,
  appendToArrangement,
  arrangementPatterns,
  createDefaultSong,
  nextSectionName,
  removeArrangementAt,
  removeSection,
  updateSectionPattern,
} from "./song";
import { createEmptyPattern } from "./pattern";
import {
  deleteSongById,
  getSongById,
  listSongs,
  loadCurrentSong,
  saveCurrentSong,
} from "./storage";
import type { Song } from "./types";

function fakeStorage(): Pick<Storage, "getItem" | "setItem" | "removeItem"> & {
  data: Map<string, string>;
} {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

describe("song sections", () => {
  it("default song: one section A, arranged once", () => {
    const song = createDefaultSong();
    expect(song.sections.map((s) => s.name)).toEqual(["A"]);
    expect(song.arrangement).toEqual([song.sections[0].id]);
  });

  it("addSection names sections A, B, C… reusing freed letters", () => {
    let song = createDefaultSong();
    const b = addSection(song, createEmptyPattern());
    song = b.song;
    expect(song.sections.map((s) => s.name)).toEqual(["A", "B"]);
    song = removeSection(song, song.sections[0].id); // free "A"
    expect(nextSectionName(song)).toBe("A");
  });

  it("removeSection strips arrangement entries and keeps the last section", () => {
    let song = createDefaultSong();
    const { song: withB, id: bId } = addSection(song, createEmptyPattern());
    song = appendToArrangement(appendToArrangement(withB, bId), bId);
    song = removeSection(song, bId);
    expect(song.arrangement).toEqual([song.sections[0].id]);
    expect(removeSection(song, song.sections[0].id)).toBe(song); // refuses last
  });

  it("updateSectionPattern touches only its section", () => {
    const { song, id } = addSection(createDefaultSong(), createEmptyPattern());
    const updated = updateSectionPattern(song, id, {
      ...createEmptyPattern(),
      bpm: 155,
    });
    expect(updated.sections[1].pattern.bpm).toBe(155);
    expect(updated.sections[0].pattern.bpm).toBe(song.sections[0].pattern.bpm);
  });

  it("arrangementPatterns follows play order and skips dangling ids", () => {
    const { song, id } = addSection(createDefaultSong(), {
      ...createEmptyPattern(),
      bpm: 90,
    });
    const arranged: Song = {
      ...song,
      arrangement: [id, song.sections[0].id, "gone", id],
    };
    expect(arrangementPatterns(arranged).map((p) => p.bpm)).toEqual([
      90,
      song.sections[0].pattern.bpm,
      90,
    ]);
  });

  it("removeArrangementAt removes one occurrence, not all", () => {
    let song = createDefaultSong();
    const id = song.sections[0].id;
    song = appendToArrangement(song, id); // A A
    expect(removeArrangementAt(song, 0).arrangement).toEqual([id]);
  });
});

describe("storage — song library", () => {
  it("round-trips the current song with id and name", () => {
    const storage = fakeStorage();
    const song = addSection(createDefaultSong(), createEmptyPattern()).song;
    saveCurrentSong("id-1", "Slow blues", song, storage);
    expect(loadCurrentSong(storage)).toEqual({
      id: "id-1",
      name: "Slow blues",
      song,
    });
  });

  it("holds several songs; listSongs is most-recent-first", () => {
    vi.useFakeTimers();
    const storage = fakeStorage();
    vi.setSystemTime(new Date("2026-07-01T10:00:00Z"));
    saveCurrentSong("a", "First", createDefaultSong(), storage);
    vi.setSystemTime(new Date("2026-07-05T10:00:00Z"));
    saveCurrentSong("b", "Second", createDefaultSong(), storage);
    expect(listSongs(storage).map((s) => s.name)).toEqual(["Second", "First"]);
    expect(getSongById("a", storage)?.name).toBe("First");
    expect(loadCurrentSong(storage)?.id).toBe("b");
    vi.useRealTimers();
  });

  it("deleting the current song falls back to another entry", () => {
    const storage = fakeStorage();
    saveCurrentSong("a", "Keep", createDefaultSong(), storage);
    saveCurrentSong("b", "Drop", createDefaultSong(), storage);
    deleteSongById("b", storage);
    expect(loadCurrentSong(storage)?.name).toBe("Keep");
    expect(listSongs(storage)).toHaveLength(1);
  });

  it("migrates a single-song-era save into the library and clears the old key", () => {
    const storage = fakeStorage();
    const legacy = createDefaultSong();
    storage.setItem("grooveLab.song.v1", JSON.stringify(legacy));
    const current = loadCurrentSong(storage)!;
    expect(current.name).toBe("My first groove");
    expect(current.song).toEqual(legacy);
    expect(storage.data.has("grooveLab.song.v1")).toBe(false);
    expect(listSongs(storage)).toHaveLength(1);
  });

  it("null/empty for corrupt or missing data — never throws", () => {
    const storage = fakeStorage();
    expect(loadCurrentSong(storage)).toBeNull();
    storage.data.set("grooveLab.library.v1", "{not json");
    expect(loadCurrentSong(storage)).toBeNull();
    expect(listSongs(storage)).toEqual([]);
    storage.data.set(
      "grooveLab.library.v1",
      JSON.stringify({ currentId: "x", songs: [{ id: "x", name: "bad", song: { sections: [] } }] }),
    );
    expect(loadCurrentSong(storage)).toBeNull();
  });

  it("repairs entries: fills missing drum lanes, drops dangling arrangement ids", () => {
    const storage = fakeStorage();
    const song = createDefaultSong();
    const mangled = JSON.parse(JSON.stringify(song)) as Song;
    delete (mangled.sections[0].pattern.drums as Record<string, unknown>).ride;
    mangled.arrangement.push("deleted-section");
    saveCurrentSong("m", "Mangled", mangled, storage);
    const loaded = loadCurrentSong(storage)!.song;
    expect(loaded.sections[0].pattern.drums.ride).toEqual([]);
    expect(loaded.arrangement).toEqual([song.sections[0].id]);
  });
});
