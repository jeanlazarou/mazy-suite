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
  allSongs,
  getSongById,
  importSongFile,
  listSongs,
  loadCurrentSong,
  makeSongFile,
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

  it("keeps chords through a save; drops an unreadable chords field, not the song", () => {
    const storage = fakeStorage();
    const song = createDefaultSong();
    song.sections[0].pattern.chords = ["Am", "C G"];
    saveCurrentSong("a", "with chords", song, storage);
    expect(loadCurrentSong(storage)?.song.sections[0].pattern.chords).toEqual(["Am", "C G"]);

    const broken = createDefaultSong();
    (broken.sections[0].pattern as { chords: unknown }).chords = "Am F";
    saveCurrentSong("b", "broken chords", broken, storage);
    const loaded = getSongById("b", storage);
    expect(loaded?.song.sections[0].pattern.bass.length).toBeGreaterThan(0);
    expect("chords" in loaded!.song.sections[0].pattern).toBe(false);
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

describe("song files — export / import", () => {
  const libraryWith = (...names: string[]) => {
    const storage = fakeStorage();
    names.forEach((name, i) => {
      const song = createDefaultSong();
      song.sections[0].pattern.bpm = 100 + i;
      saveCurrentSong(`id-${i}`, name, song, storage);
    });
    return storage;
  };
  /** What a download + upload does: through JSON text. */
  const roundTrip = (file: unknown) => JSON.parse(JSON.stringify(file));

  it("moves a whole library to an empty one", () => {
    const from = libraryWith("Blue", "Red");
    const file = roundTrip(makeSongFile(allSongs(from), "9.9.9"));
    const to = fakeStorage();
    const result = importSongFile(file, to);
    expect(result?.added.map((s) => s.name).sort()).toEqual(["Blue", "Red"]);
    expect(allSongs(to).map((s) => [s.name, s.song.sections[0].pattern.bpm]).sort()).toEqual([
      ["Blue", 100],
      ["Red", 101],
    ]);
  });

  it("never overwrites: fresh ids, the open song stays open", () => {
    const storage = libraryWith("Mine");
    const other = createDefaultSong();
    other.sections[0].pattern.bpm = 77;
    const file = roundTrip(makeSongFile([{ name: "Mine", updatedAt: "", song: other }], "x"));
    const result = importSongFile(file, storage);
    expect(result?.added).toHaveLength(1);
    expect(result?.added[0].id).not.toBe("id-0");
    expect(listSongs(storage)).toHaveLength(2);
    expect(loadCurrentSong(storage)?.id).toBe("id-0");
  });

  it("importing the same file twice adds nothing the second time", () => {
    const from = libraryWith("Blue", "Red");
    const file = roundTrip(makeSongFile(allSongs(from), "x"));
    const to = fakeStorage();
    importSongFile(roundTrip(file), to);
    const again = importSongFile(roundTrip(file), to);
    expect(again).toEqual({ added: [], duplicates: 2, unreadable: 0 });
    expect(listSongs(to)).toHaveLength(2);
  });

  it("skips unreadable songs, keeps the good ones; not-a-song-file → null", () => {
    const good = createDefaultSong();
    const file = { groove_lab: 1, songs: [{ name: "ok", song: good }, { name: "bad", song: { sections: [] } }, null, 7] };
    const storage = fakeStorage();
    expect(importSongFile(roundTrip(file), storage)).toMatchObject({
      added: [{ name: "ok" }],
      unreadable: 3,
    });
    for (const junk of [null, 5, "x", [], {}, { songs: "no" }]) {
      expect(importSongFile(junk, storage)).toBeNull();
    }
    expect(listSongs(storage)).toHaveLength(1);
  });

  it("repairs bad numbers from a file instead of trusting them", () => {
    const song = createDefaultSong();
    const p = song.sections[0].pattern as unknown as Record<string, unknown>;
    p.bpm = 9999;
    p.swing = "lots";
    p.drums = { kick: [{ step: 0, velocity: 5 }, { step: 400, velocity: 1 }, { step: 2 }, null], snare: "x" };
    p.bass = [
      { step: 0, durationSteps: 2, midiPitch: 33, velocity: 0.8 },
      { step: -1, durationSteps: 2, midiPitch: 33, velocity: 0.8 },
      { step: 4, durationSteps: 0, midiPitch: 33, velocity: 0.8 },
      { step: 8, durationSteps: 2, midiPitch: 900, velocity: 0.8 },
    ];
    const storage = fakeStorage();
    const result = importSongFile(roundTrip({ songs: [{ name: "odd", song }] }), storage);
    const loaded = getSongById(result!.added[0].id, storage)!.song.sections[0].pattern;
    expect(loaded.bpm).toBe(240);
    expect(loaded.swing).toBe(0);
    expect(loaded.drums.kick).toEqual([{ step: 0, velocity: 1 }]);
    expect(loaded.drums.snare).toEqual([]);
    expect(loaded.bass.map((n) => n.step)).toEqual([0]);

    const huge = createDefaultSong();
    huge.sections[0].pattern.bars = 1e9; // would hang the editor
    expect(importSongFile(roundTrip({ songs: [{ name: "huge", song: huge }] }), storage)).toMatchObject({
      added: [],
      unreadable: 1,
    });
  });
});
