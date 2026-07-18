import type { Song } from "../types";

interface SectionBarProps {
  song: Song;
  currentId: string;
  playingIndex: number | null; // arrangement index currently sounding, if any
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onAppend: () => void;
  onRemoveAt: (index: number) => void;
}

export function SectionBar({
  song,
  currentId,
  playingIndex,
  onSelect,
  onAdd,
  onRemove,
  onAppend,
  onRemoveAt,
}: SectionBarProps) {
  const nameOf = (id: string) =>
    song.sections.find((s) => s.id === id)?.name ?? "?";
  const current = song.sections.find((s) => s.id === currentId);

  return (
    <div className="song-bar">
      <div className="song-row">
        <span className="song-label">Sections</span>
        {song.sections.map((section) => (
          <span
            key={section.id}
            className={`section-chip ${section.id === currentId ? "active" : ""}`}
          >
            <button
              className="section-select"
              onClick={() => onSelect(section.id)}
              title="Edit this section"
            >
              {section.name}
            </button>
            {song.sections.length > 1 && (
              <button
                className="section-delete"
                onClick={() => onRemove(section.id)}
                title="Delete this section (and its arrangement entries)"
              >
                ×
              </button>
            )}
          </span>
        ))}
        <button
          className="tool-button section-add"
          onClick={onAdd}
          title="New section, starting from a copy of the current one"
        >
          + New
        </button>
      </div>

      <div className="song-row">
        <span className="song-label">Arrangement</span>
        {song.arrangement.length === 0 && (
          <span className="arr-empty">empty — add sections to build a song</span>
        )}
        {song.arrangement.map((id, i) => (
          <button
            key={`${id}-${i}`}
            className={`arr-chip ${i === playingIndex ? "playing" : ""}`}
            onClick={() => onRemoveAt(i)}
            title="Click to remove from the arrangement"
          >
            {nameOf(id)}
          </button>
        ))}
        <button
          className="tool-button arr-append"
          onClick={onAppend}
          title="Append the current section to the arrangement"
        >
          + {current?.name ?? ""}
        </button>
      </div>
    </div>
  );
}
