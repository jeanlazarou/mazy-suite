import type { Pattern, Section, Song } from "./types";
import {
  addSection,
  appendToArrangement,
  removeArrangementAt,
  removeSection,
  updateSectionPattern,
} from "./song";

export const UNDO_LIMIT = 100;

/** A new pattern, or a function of the section's latest pattern. */
export type PatternUpdate = Pattern | ((pattern: Pattern) => Pattern);

/** How editors report a change; edits sharing a `group` undo as one step. */
export type PatternChange = (update: PatternUpdate, group?: string) => void;

/**
 * Everything the editor changes, in one place, so every edit is addressed
 * by song and section id instead of closing over a possibly stale song.
 */
export interface EditorState {
  songId: string;
  name: string;
  song: Song;
  currentId: string; // section being edited
  past: Song[];
  future: Song[];
  /** Group of the last edit: a following edit in the same group joins its undo step. */
  group: string | null;
}

export type EditorAction =
  | { type: "open"; songId: string; name: string; song: Song }
  | { type: "rename"; name: string }
  | { type: "select"; sectionId: string }
  | {
      type: "editPattern";
      songId: string;
      sectionId: string;
      update: PatternUpdate;
      group?: string;
    }
  | { type: "addSection"; sectionId: string }
  | { type: "removeSection"; sectionId: string }
  | { type: "appendToArrangement" }
  | { type: "removeArrangementAt"; index: number }
  | { type: "undo" }
  | { type: "redo" };

export function openState(songId: string, name: string, song: Song): EditorState {
  return {
    songId,
    name,
    song,
    currentId: song.sections[0].id,
    past: [],
    future: [],
    group: null,
  };
}

export function currentSection(state: EditorState): Section {
  return (
    state.song.sections.find((s) => s.id === state.currentId) ??
    state.song.sections[0]
  );
}

/** The live pattern of a section, or null once that song or section is gone. */
export function livePattern(
  state: EditorState,
  songId: string,
  sectionId: string,
): Pattern | null {
  if (songId !== state.songId) return null;
  return state.song.sections.find((s) => s.id === sectionId)?.pattern ?? null;
}

let gestureCount = 0;
/** A group key unique to one gesture (a drag, a slider pull, a typed fret). */
export function newGesture(kind: string): string {
  gestureCount += 1;
  return `${kind}:${gestureCount}`;
}

function commit(
  state: EditorState,
  song: Song,
  group?: string,
  currentId = state.currentId,
): EditorState {
  const joins = group !== undefined && group === state.group;
  return {
    ...state,
    song,
    currentId,
    past: joins ? state.past : [...state.past, state.song].slice(-UNDO_LIMIT),
    future: [],
    group: group ?? null,
  };
}

function keepSelection(song: Song, id: string): string {
  return song.sections.some((s) => s.id === id) ? id : song.sections[0].id;
}

export function editorReducer(
  state: EditorState,
  action: EditorAction,
): EditorState {
  switch (action.type) {
    case "open":
      return openState(action.songId, action.name, action.song);

    case "rename":
      return { ...state, name: action.name };

    case "select":
      return state.song.sections.some((s) => s.id === action.sectionId)
        ? { ...state, currentId: action.sectionId, group: null }
        : state;

    case "editPattern": {
      const before = livePattern(state, action.songId, action.sectionId);
      if (!before) return state;
      const after =
        typeof action.update === "function"
          ? action.update(before)
          : action.update;
      if (after === before) return state;
      return commit(
        state,
        updateSectionPattern(state.song, action.sectionId, after),
        action.group,
      );
    }

    case "addSection": {
      const copy = structuredClone(currentSection(state).pattern);
      const added = addSection(state.song, copy, action.sectionId);
      return commit(state, added.song, undefined, added.id);
    }

    case "removeSection": {
      const song = removeSection(state.song, action.sectionId);
      if (song === state.song) return state;
      return commit(state, song, undefined, keepSelection(song, state.currentId));
    }

    case "appendToArrangement":
      return commit(
        state,
        appendToArrangement(state.song, currentSection(state).id),
      );

    case "removeArrangementAt":
      return commit(state, removeArrangementAt(state.song, action.index));

    case "undo": {
      const prev = state.past.at(-1);
      if (!prev) return state;
      return {
        ...state,
        song: prev,
        currentId: keepSelection(prev, state.currentId),
        past: state.past.slice(0, -1),
        future: [state.song, ...state.future].slice(0, UNDO_LIMIT),
        group: null,
      };
    }

    case "redo": {
      const next = state.future[0];
      if (!next) return state;
      return {
        ...state,
        song: next,
        currentId: keepSelection(next, state.currentId),
        past: [...state.past, state.song].slice(-UNDO_LIMIT),
        future: state.future.slice(1),
        group: null,
      };
    }
  }
}
