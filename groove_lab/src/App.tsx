import { useCallback, useEffect, useRef, useState } from "react";
import type { Pattern, Song } from "./types";
import { clearBass, clearDrums } from "./pattern";
import {
  addSection,
  appendToArrangement,
  arrangementPatterns,
  createDefaultSong,
  removeArrangementAt,
  removeSection,
  updateSectionPattern,
} from "./song";
import {
  createSongId,
  deleteSongById,
  getSongById,
  listSongs,
  loadCurrentSong,
  saveCurrentSong,
} from "./storage";
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

type PlayMode = "section" | "song";
const HISTORY_LIMIT = 20;
const KIT_KEY = "grooveLab.kit.v1";

export default function App() {
  // Lazy initializers may both read storage; the result is identical.
  const [meta, setMeta] = useState(() => {
    const saved = loadCurrentSong();
    return saved
      ? { id: saved.id, name: saved.name }
      : { id: createSongId(), name: "Untitled" };
  });
  const [song, setSongState] = useState<Song>(
    () => loadCurrentSong()?.song ?? createDefaultSong(),
  );
  const [currentId, setCurrentId] = useState(() => song.sections[0].id);
  const [playMode, setPlayMode] = useState<PlayMode>("section");
  const [bassView, setBassView] = useState<"roll" | "tab">("roll");
  const [kit, setKit] = useState<KitName>(() => {
    const saved = localStorage.getItem(KIT_KEY);
    return KIT_NAMES.includes(saved as KitName) ? (saved as KitName) : "synth";
  });
  useEffect(() => localStorage.setItem(KIT_KEY, kit), [kit]);

  const current =
    song.sections.find((s) => s.id === currentId) ?? song.sections[0];

  // Undo history (also the safety net for generators overwriting a groove).
  // The push happens outside the state updater: StrictMode runs updaters
  // twice in dev, which would double-push.
  const historyRef = useRef<Song[]>([]);
  const songForHistoryRef = useRef(song);
  songForHistoryRef.current = song;
  const setSong = useCallback((next: Song) => {
    historyRef.current = [
      ...historyRef.current.slice(-(HISTORY_LIMIT - 1)),
      songForHistoryRef.current,
    ];
    setSongState(next);
  }, []);
  const undo = useCallback(() => {
    const prev = historyRef.current.pop();
    if (!prev) return;
    setSongState(prev);
    setCurrentId((id) =>
      prev.sections.some((s) => s.id === id) ? id : prev.sections[0].id,
    );
  }, []);

  const undoRef = useRef(undo);
  undoRef.current = undo;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undoRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Autosave the song JSON (the inputs, per MIDI_EXPORT_NOTES.md §3).
  useEffect(() => {
    const t = setTimeout(() => saveCurrentSong(meta.id, meta.name, song), 400);
    return () => clearTimeout(t);
  }, [song, meta]);

  // ---- song library ----
  const openSong = (entry: { id: string; name: string; song: Song }) => {
    historyRef.current = []; // undo must not cross songs
    setMeta({ id: entry.id, name: entry.name });
    setSongState(entry.song);
    setCurrentId(entry.song.sections[0].id);
    saveCurrentSong(entry.id, entry.name, entry.song); // move the pointer now
  };
  const switchSong = (id: string) => {
    if (id === meta.id) return;
    saveCurrentSong(meta.id, meta.name, song); // flush pending edits
    const next = getSongById(id);
    if (next) openSong(next);
  };
  const newSong = () => {
    saveCurrentSong(meta.id, meta.name, song);
    openSong({ id: createSongId(), name: "Untitled", song: createDefaultSong() });
  };
  const deleteSong = () => {
    if (!window.confirm(`Delete "${meta.name}" from the library?`)) return;
    deleteSongById(meta.id);
    const next = loadCurrentSong();
    openSong(
      next ?? { id: createSongId(), name: "Untitled", song: createDefaultSong() },
    );
  };

  // Playback reads through refs so edits and mode are live mid-play.
  const songRef = useRef(song);
  songRef.current = song;
  const currentIdRef = useRef(currentId);
  currentIdRef.current = current.id;
  const playModeRef = useRef<PlayMode>(playMode);

  const getPatterns = useCallback((): Pattern[] => {
    const s = songRef.current;
    if (playModeRef.current === "song") {
      const patterns = arrangementPatterns(s);
      if (patterns.length > 0) return patterns;
    }
    const cur =
      s.sections.find((x) => x.id === currentIdRef.current) ?? s.sections[0];
    return [cur.pattern];
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

  const setPattern = (p: Pattern) =>
    setSong(updateSectionPattern(song, current.id, p));

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
          Drums: click to add a hit, drag to paint. Bass: press and drag right
          to place a note, click a note to delete it. Right-click anything to
          cycle ghost / normal / accent. Ctrl/Cmd-Z undoes.
        </p>
      </header>
      <TransportBar
        pattern={current.pattern}
        isPlaying={isPlaying}
        playMode={playMode}
        kit={kit}
        onKitChange={setKit}
        canPlaySong={song.arrangement.length > 0}
        canUndo={historyRef.current.length > 0}
        onPlaySection={() => play("section")}
        onPlaySong={() => play("song")}
        onUndo={undo}
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
        name={meta.name}
        currentId={meta.id}
        songs={listSongs()}
        onRename={(name) => setMeta({ ...meta, name })}
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
        onSelect={setCurrentId}
        onAdd={() => {
          const added = addSection(song, structuredClone(current.pattern));
          setSong(added.song);
          setCurrentId(added.id);
        }}
        onRemove={(id) => {
          const next = removeSection(song, id);
          setSong(next);
          if (id === currentId) setCurrentId(next.sections[0].id);
        }}
        onAppend={() => setSong(appendToArrangement(song, current.id))}
        onRemoveAt={(i) => setSong(removeArrangementAt(song, i))}
      />

      <LlmPanel pattern={current.pattern} onChange={setPattern} />

      <div className="section-header">
        <h2>Drums</h2>
        <DrumGenControls pattern={current.pattern} onChange={setPattern} />
        <button
          className="clear-button"
          onClick={() => setPattern(clearDrums(current.pattern))}
        >
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
        <button
          className="clear-button"
          onClick={() => setPattern(clearBass(current.pattern))}
        >
          Clear bass
        </button>
      </div>
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
