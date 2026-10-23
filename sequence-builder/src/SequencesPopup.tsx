import { useState } from 'react';
import { SavedSequence, listSequences, saveSequence, deleteSequence } from './savedSequences';

interface SequencesPopupProps {
  album: string;
  albumTitle: string;
  /** The current sequence, as the album writes its track urls */
  current: string[];
  /** Name the current sequence was last saved or loaded under */
  currentName: string | null;
  onSaved: (name: string) => void;
  onLoad: (saved: SavedSequence) => void;
  onClose: () => void;
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });

/**
 * SequencesPopup Component
 *
 * Saves the current sequence under a name, and lists the album's saved
 * sequences to load or delete. Kept in this browser only.
 */
function SequencesPopup({ album, albumTitle, current, currentName, onSaved, onLoad, onClose }: SequencesPopupProps) {
  const [list, setList] = useState(() => listSequences(album));
  const [name, setName] = useState(currentName ?? `Sequence ${list.length + 1}`);
  const [message, setMessage] = useState<string | null>(null);

  const trimmed = name.trim();
  const exists = list.some(s => s.name === trimmed);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!trimmed || current.length === 0) return;
    if (!saveSequence(album, trimmed, current)) {
      setMessage('Not saved: this browser does not allow storing it.');
      return;
    }
    setList(listSequences(album));
    setMessage(`Saved "${trimmed}".`);
    onSaved(trimmed);
  };

  const handleDelete = (saved: SavedSequence) => {
    deleteSequence(album, saved.name);
    setList(listSequences(album));
    setMessage(null);
  };

  return (
    <div
      className="track-list-overlay"
      onClick={onClose}
      onKeyDown={e => {
        if (e.key === 'Escape') {
          e.stopPropagation(); // closes the popup, does not stop the music
          onClose();
        }
      }}
    >
      <div className="track-list-popup" onClick={event => event.stopPropagation()}>
        <div className="track-list-header">
          <h2>Sequences</h2>
          <button className="track-list-close" onClick={onClose}>×</button>
        </div>

        <form className="sequences-form" onSubmit={handleSave}>
          <input
            className="sequences-name"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Name"
            aria-label="Sequence name"
            autoFocus
          />
          <button type="submit" disabled={!trimmed || current.length === 0}>
            {exists ? 'Replace' : 'Save'}
          </button>
        </form>
        <p className="sequences-note">
          {message ?? (current.length === 0
            ? 'The sequence is empty: nothing to save yet.'
            : `${current.length} tracks of ${albumTitle} · kept in this browser`)}
        </p>

        <ul className="track-list">
          {list.length === 0 && (
            <li className="sequences-empty">No saved sequence for this album yet.</li>
          )}
          {list.map(saved => (
            <li key={saved.name} className="track-list-item sequences-item">
              <span className="track-list-title">{saved.name}</span>
              <span className="sequences-meta">
                {saved.tracks.length} tracks · {formatDate(saved.savedAt)}
              </span>
              <button onClick={() => onLoad(saved)}>Load</button>
              <button
                className="sequences-delete"
                onClick={() => handleDelete(saved)}
                title={`Delete "${saved.name}"`}
                aria-label={`Delete "${saved.name}"`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default SequencesPopup;
