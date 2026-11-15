import { useRef, useState } from "react";
import type { SongMeta } from "../storage";

interface LibraryBarProps {
  name: string;
  currentId: string;
  songs: SongMeta[];
  onRename: (name: string) => void;
  onSwitch: (id: string) => void;
  onNew: () => void;
  onDelete: () => void;
  onExport: () => void;
  onExportAll: () => void;
  /** Gets the chosen file's text; returns what to tell the user. */
  onImport: (text: string) => string;
}

export function LibraryBar({
  name,
  currentId,
  songs,
  onRename,
  onSwitch,
  onNew,
  onDelete,
  onExport,
  onExportAll,
  onImport,
}: LibraryBarProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState("");
  return (
    <div className="song-bar library-bar">
      <div className="song-row">
        <span className="song-label">Song</span>
        <input
          className="song-name"
          value={name}
          onChange={(e) => onRename(e.target.value)}
          onBlur={() => name.trim() === "" && onRename("Untitled")}
          placeholder="name your song"
          title="Name of the current song"
        />
        <select
          className="song-browse"
          value={currentId}
          onChange={(e) => onSwitch(e.target.value)}
          title="Browse your saved songs"
        >
          {songs.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.updatedAt &&
                ` · ${new Date(s.updatedAt).toLocaleDateString()}`}
            </option>
          ))}
          {!songs.some((s) => s.id === currentId) && (
            <option value={currentId}>{name}</option>
          )}
        </select>
        <button
          className="tool-button song-new"
          onClick={onNew}
          title="Start a new song (the current one stays saved)"
        >
          + New
        </button>
        <button
          className="tool-button song-delete"
          onClick={onDelete}
          title="Delete this song from the library"
        >
          Delete
        </button>
        <span className="gen-sep" />
        <button
          className="tool-button song-export"
          onClick={onExport}
          title="Download this song as a file — a backup, or to open it in another browser or on another site"
        >
          Export song
        </button>
        <button
          className="tool-button song-export-all"
          onClick={onExportAll}
          title="Download all your songs in one file"
        >
          Export all
        </button>
        <button
          className="tool-button song-import"
          onClick={() => fileRef.current?.click()}
          title="Add the songs of an exported file to your library (nothing is overwritten)"
        >
          Import
        </button>
        <input
          ref={fileRef}
          className="song-import-file"
          type="file"
          accept=".json,application/json"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = ""; // the same file can be picked again
            if (!file) return;
            setStatus(onImport(await file.text().catch(() => "")));
          }}
        />
        <span className="library-status">{status}</span>
      </div>
    </div>
  );
}
