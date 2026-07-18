import type { SongMeta } from "../storage";

interface LibraryBarProps {
  name: string;
  currentId: string;
  songs: SongMeta[];
  onRename: (name: string) => void;
  onSwitch: (id: string) => void;
  onNew: () => void;
  onDelete: () => void;
}

export function LibraryBar({
  name,
  currentId,
  songs,
  onRename,
  onSwitch,
  onNew,
  onDelete,
}: LibraryBarProps) {
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
      </div>
    </div>
  );
}
