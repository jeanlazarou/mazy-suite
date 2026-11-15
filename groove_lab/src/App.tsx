import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { Pattern, Song } from "./types";
import { clearBass, clearDrums } from "./pattern";
import { arrangementPatterns, createDefaultSong, newId } from "./song";
import {
  createSongId,
  deleteSongById,
  getSongById,
  listSongs,
  loadCurrentSong,
  saveCurrentSong,
} from "./storage";
import type { EditorState, PatternUpdate } from "./editor";
import {
  currentSection,
  editorReducer,
  livePattern,
  openState,
} from "./editor";
import { LibraryBar } from "./components/LibraryBar";
import { patternToMidi, songToMidi } from "./midi";
import { downloadBytes } from "./download";
import { usePlayback } from "./audio/usePlayback";
import { usePlayheadFollow, useSyncedScroll } from "./useSyncedScroll";
import { DrumGrid } from "./components/DrumGrid";
import { BassRoll } from "./components/BassRoll";
import { BassTab } from "./components/BassTab";
import type { KitName } from "./audio/sampledKit";
import { KIT_NAMES } from "./audio/sampledKit";
import { TransportBar } from "./components/TransportBar";
import { SectionBar } from "./components/SectionBar";
import { LlmPanel } from "./components/LlmPanel";
import { BassGenControls, DrumGenControls } from "./components/Generators";
import { ChordStrip } from "./components/ChordStrip";

type PlayMode = "section" | "song";
const KIT_KEY = "grooveLab.kit.v1";

function initialState(): EditorState {
  const saved = loadCurrentSong();
  return saved
    ? openState(saved.id, saved.name, saved.song)
    : openState(createSongId(), "Untitled", createDefaultSong());
}

/** Text fields keep their own Ctrl/Cmd-Z; everywhere else it's the song's. */
function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target instanceof HTMLTextAreaElement) {
    return true;
  }
  return (
    target instanceof HTMLInputElement &&
    !["range", "checkbox", "radio", "button"].includes(target.type)
  );
}

export default function App() {
  const [state, dispatch] = useReducer(editorReducer, undefined, initialState);
  const { songId, name, song } = state;
  const current = currentSection(state);
  // Latest state for playback and async results, which outlive a render.
  const stateRef = useRef(state);
  stateRef.current = state;

  const [playMode, setPlayMode] = useState<PlayMode>("section");
  const [bassView, setBassView] = useState<"roll" | "tab">("roll");
  const [kit, setKit] = useState<KitName>(() => {
    const saved = localStorage.getItem(KIT_KEY);
    return KIT_NAMES.includes(saved as KitName) ? (saved as KitName) : "synth";
  });
  useEffect(() => localStorage.setItem(KIT_KEY, kit), [kit]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || isTextEntry(e.target)) return;
      const key = e.key.toLowerCase();
      const redo = (key === "z" && e.shiftKey) || (key === "y" && e.ctrlKey);
      if (key !== "z" && !redo) return;
      e.preventDefault();
      dispatch({ type: redo ? "redo" : "undo" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Autosave the song JSON (the inputs, per MIDI_EXPORT_NOTES.md §3).
  useEffect(() => {
    const t = setTimeout(() => saveCurrentSong(songId, name, song), 400);
    return () => clearTimeout(t);
  }, [song, songId, name]);

  // ---- song library ----
  const openSong = (entry: { id: string; name: string; song: Song }) => {
    saveCurrentSong(entry.id, entry.name, entry.song); // move the pointer now
    dispatch({
      type: "open",
      songId: entry.id,
      name: entry.name,
      song: entry.song,
    });
  };
  const switchSong = (id: string) => {
    if (id === songId) return;
    saveCurrentSong(songId, name, song); // flush pending edits
    const next = getSongById(id);
    if (next) openSong(next);
  };
  const newSong = () => {
    saveCurrentSong(songId, name, song);
    openSong({ id: createSongId(), name: "Untitled", song: createDefaultSong() });
  };
  const deleteSong = () => {
    if (!window.confirm(`Delete "${name}" from the library?`)) return;
    deleteSongById(songId);
    const next = loadCurrentSong();
    openSong(
      next ?? { id: createSongId(), name: "Untitled", song: createDefaultSong() },
    );
  };

  // Playback reads through refs so edits and mode are live mid-play.
  const playModeRef = useRef<PlayMode>(playMode);
  const getPatterns = useCallback((): Pattern[] => {
    const s = stateRef.current;
    if (playModeRef.current === "song") {
      const patterns = arrangementPatterns(s.song);
      if (patterns.length > 0) return patterns;
    }
    return [currentSection(s).pattern];
  }, []);

  const { isPlaying, position, start, stop, preview, previewBass } =
    usePlayback(getPatterns, kit);

  const play = (mode: PlayMode) => {
    if (isPlaying) {
      stop();
      return;
    }
    playModeRef.current = mode;
    setPlayMode(mode);
    void start();
  };

  const setPattern = (update: PatternUpdate, group?: string) =>
    dispatch({
      type: "editPattern",
      songId,
      sectionId: current.id,
      update,
      group,
    });

  const viewStep =
    position === null
      ? -1
      : playMode === "section" ||
          song.arrangement[position.index] === current.id
        ? position.step
        : -1;

  // Grids share one timeline: linked horizontal scroll + playhead follow.
  useSyncedScroll([bassView]);
  usePlayheadFollow(viewStep);

  const exportFailed = () =>
    window.alert("This pattern can't be rendered to MIDI — see the console.");

  return (
    <div className="app">
      <header>
        <h1>Groove Lab</h1>
        <p className="hint">
          Drums: click to add a hit, drag to paint, right-click to cycle ghost /
          normal / accent. Bass roll: press and drag right to place a note;
          drag a note to move it, its right edge to change its length; click
          to delete, right-click to cycle. Ctrl/Cmd-Z undoes, Shift-Ctrl/Cmd-Z
          redoes.
        </p>
      </header>
      <TransportBar
        pattern={current.pattern}
        isPlaying={isPlaying}
        playMode={playMode}
        kit={kit}
        onKitChange={setKit}
        canPlaySong={song.arrangement.length > 0}
        canUndo={state.past.length > 0}
        canRedo={state.future.length > 0}
        onPlaySection={() => play("section")}
        onPlaySong={() => play("song")}
        onUndo={() => dispatch({ type: "undo" })}
        onRedo={() => dispatch({ type: "redo" })}
        onChange={setPattern}
        onExportSection={() => {
          const bytes = patternToMidi(current.pattern);
          if (!bytes) return exportFailed();
          downloadBytes(
            bytes,
            `groove-${current.name}-${current.pattern.bpm}bpm.mid`,
          );
        }}
        onExportSong={() => {
          const bytes = songToMidi(arrangementPatterns(song));
          if (!bytes) return exportFailed();
          downloadBytes(bytes, "groove-song.mid");
        }}
      />

      <LibraryBar
        name={name}
        currentId={songId}
        songs={listSongs()}
        onRename={(next) => dispatch({ type: "rename", name: next })}
        onSwitch={switchSong}
        onNew={newSong}
        onDelete={deleteSong}
      />

      <SectionBar
        song={song}
        currentId={current.id}
        playingIndex={
          isPlaying && playMode === "song" && position !== null
            ? position.index
            : null
        }
        onSelect={(sectionId) => dispatch({ type: "select", sectionId })}
        onAdd={() => dispatch({ type: "addSection", sectionId: newId() })}
        onRemove={(sectionId) => dispatch({ type: "removeSection", sectionId })}
        onAppend={() => dispatch({ type: "appendToArrangement" })}
        onRemoveAt={(index) => dispatch({ type: "removeArrangementAt", index })}
      />

      <LlmPanel
        target={{
          songId,
          sectionId: current.id,
          sectionName: current.name,
          pattern: current.pattern,
        }}
        getLivePattern={(t) =>
          livePattern(stateRef.current, t.songId, t.sectionId)
        }
        onApply={(t, pattern) =>
          dispatch({
            type: "editPattern",
            songId: t.songId,
            sectionId: t.sectionId,
            update: pattern,
          })
        }
      />

      <div className="section-header">
        <h2>Drums</h2>
        <DrumGenControls pattern={current.pattern} onChange={setPattern} />
        <button className="clear-button" onClick={() => setPattern(clearDrums)}>
          Clear drums
        </button>
      </div>
      <DrumGrid
        pattern={current.pattern}
        currentStep={viewStep}
        onChange={setPattern}
        onPreview={(lane, velocity) => void preview(lane, velocity)}
      />

      <div className="section-header">
        <h2>Bass</h2>
        <span className="view-toggle">
          {(["roll", "tab"] as const).map((view) => (
            <button
              key={view}
              className={`view-option ${bassView === view ? "active" : ""}`}
              onClick={() => setBassView(view)}
            >
              {view}
            </button>
          ))}
        </span>
        <BassGenControls pattern={current.pattern} onChange={setPattern} />
        <button className="clear-button" onClick={() => setPattern(clearBass)}>
          Clear bass
        </button>
      </div>
      <ChordStrip
        pattern={current.pattern}
        currentStep={viewStep}
        onChange={setPattern}
      />
      {bassView === "roll" ? (
        <BassRoll
          pattern={current.pattern}
          currentStep={viewStep}
          onChange={setPattern}
          onPreview={(pitch, velocity) => void previewBass(pitch, velocity)}
        />
      ) : (
        <BassTab
          pattern={current.pattern}
          currentStep={viewStep}
          onChange={setPattern}
          onPreview={(pitch, velocity) => void previewBass(pitch, velocity)}
        />
      )}
    </div>
  );
}
