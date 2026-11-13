import { describe, expect, it } from "vitest";
import type { EditorAction, EditorState } from "./editor";
import {
  UNDO_LIMIT,
  currentSection,
  editorReducer,
  livePattern,
  newGesture,
  openState,
} from "./editor";
import { createDefaultSong } from "./song";
import { setDrumStep } from "./pattern";

function run(state: EditorState, ...actions: EditorAction[]): EditorState {
  return actions.reduce(editorReducer, state);
}

function fresh(songId = "song-1"): EditorState {
  return openState(songId, "Test", createDefaultSong());
}

function swing(state: EditorState, value: number, group?: string): EditorAction {
  return {
    type: "editPattern",
    songId: state.songId,
    sectionId: state.currentId,
    update: (p) => ({ ...p, swing: value }),
    group,
  };
}

describe("editorReducer: edits are addressed by song and section", () => {
  // Bug: an Ollama result arriving after a song switch was applied to the old
  // song object, and autosave then wrote it under the new song's id.
  it("drops an edit for a song that is no longer open", () => {
    const a = fresh("song-a");
    const late: EditorAction = {
      type: "editPattern",
      songId: "song-a",
      sectionId: a.currentId,
      update: { ...currentSection(a).pattern, bpm: 66 },
    };
    const b = run(a, {
      type: "open",
      songId: "song-b",
      name: "B",
      song: createDefaultSong(),
    });
    expect(run(b, late)).toBe(b);
  });

  it("drops an edit for a deleted section", () => {
    let s = run(fresh(), { type: "addSection", sectionId: "sec-b" });
    const target = s.currentId;
    s = run(s, { type: "removeSection", sectionId: target });
    expect(livePattern(s, s.songId, target)).toBeNull();
    const after = run(s, {
      type: "editPattern",
      songId: s.songId,
      sectionId: target,
      update: (p) => ({ ...p, bpm: 66 }),
    });
    expect(after).toBe(s);
  });

  it("applies an edit to its own section even when another is selected", () => {
    let s = run(fresh(), { type: "addSection", sectionId: "sec-b" });
    const first = s.song.sections[0].id;
    s = run(s, {
      type: "editPattern",
      songId: s.songId,
      sectionId: first,
      update: (p) => ({ ...p, bpm: 66 }),
    });
    expect(s.song.sections[0].pattern.bpm).toBe(66);
    expect(s.song.sections[1].pattern.bpm).toBe(100);
    expect(s.currentId).toBe("sec-b");
  });

  it("function updates build on the latest pattern, not a stale copy", () => {
    const s = fresh();
    // Two paint events dispatched before a re-render: both must survive.
    const tom = (step: number): EditorAction => ({
      type: "editPattern",
      songId: s.songId,
      sectionId: s.currentId,
      update: (p) => setDrumStep(p, "tomLow", step, true),
    });
    const after = run(s, tom(1), tom(3));
    expect(currentSection(after).pattern.drums.tomLow.map((h) => h.step)).toEqual([1, 3]);
  });
});

describe("editorReducer: undo groups gestures", () => {
  // Bug: every input event of one slider drag took its own undo slot, so a
  // single swing drag pushed the whole 20-step history out.
  it("a whole slider drag is one undo step", () => {
    const start = fresh();
    const group = newGesture("swing");
    let s = start;
    for (let v = 1; v <= 60; v++) s = run(s, swing(s, v / 100, group));
    expect(currentSection(s).pattern.swing).toBe(0.6);
    expect(s.past).toHaveLength(1);
    s = run(s, { type: "undo" });
    expect(s.song).toBe(start.song);
  });

  it("separate gestures are separate steps", () => {
    let s = fresh();
    s = run(s, swing(s, 0.2, newGesture("swing")), swing(s, 0.4, newGesture("swing")));
    expect(s.past).toHaveLength(2);
  });

  it("an ungrouped edit between two same-group edits splits them", () => {
    let s = fresh();
    s = run(s, swing(s, 0.2, "g"), swing(s, 0.3), swing(s, 0.4, "g"));
    expect(s.past).toHaveLength(3);
  });

  it("an edit that changes nothing doesn't take an undo step", () => {
    const s = fresh();
    const same = run(s, {
      type: "editPattern",
      songId: s.songId,
      sectionId: s.currentId,
      update: (p) => p,
    });
    expect(same).toBe(s);
  });

  it("keeps at most UNDO_LIMIT steps", () => {
    let s = fresh();
    for (let i = 0; i < UNDO_LIMIT + 10; i++) s = run(s, swing(s, i / 1000));
    expect(s.past).toHaveLength(UNDO_LIMIT);
  });
});

describe("editorReducer: undo / redo", () => {
  it("redo replays what undo took back", () => {
    let s = fresh();
    s = run(s, swing(s, 0.5));
    const edited = s.song;
    s = run(s, { type: "undo" });
    expect(currentSection(s).pattern.swing).toBe(0);
    s = run(s, { type: "redo" });
    expect(s.song).toBe(edited);
    expect(s.future).toHaveLength(0);
  });

  it("a new edit after undo clears redo", () => {
    let s = fresh();
    s = run(s, swing(s, 0.5), { type: "undo" }, swing(s, 0.1));
    expect(s.future).toHaveLength(0);
    expect(run(s, { type: "redo" })).toBe(s);
  });

  it("undo after an edit inside a group doesn't let the next edit join it", () => {
    let s = fresh();
    s = run(s, swing(s, 0.2, "g"), { type: "undo" }, swing(s, 0.4, "g"));
    expect(s.past).toHaveLength(1);
    s = run(s, { type: "undo" });
    expect(currentSection(s).pattern.swing).toBe(0);
  });

  it("undoing an added section moves the selection back to a real one", () => {
    let s = fresh();
    s = run(s, { type: "addSection", sectionId: "sec-b" });
    expect(s.currentId).toBe("sec-b");
    s = run(s, { type: "undo" });
    expect(s.song.sections.some((x) => x.id === s.currentId)).toBe(true);
  });

  it("opening another song starts a fresh history", () => {
    let s = fresh();
    s = run(s, swing(s, 0.5), { type: "undo" }, swing(s, 0.3));
    s = run(s, { type: "open", songId: "other", name: "O", song: createDefaultSong() });
    expect(s.past).toHaveLength(0);
    expect(s.future).toHaveLength(0);
  });

  it("selecting a section and renaming the song are not undo steps", () => {
    let s = run(fresh(), { type: "addSection", sectionId: "sec-b" });
    const steps = s.past.length;
    s = run(
      s,
      { type: "select", sectionId: s.song.sections[0].id },
      { type: "rename", name: "Renamed" },
    );
    expect(s.past).toHaveLength(steps);
  });
});
