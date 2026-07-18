import { useEffect, useState } from 'react';
import { fetchSuiteSongs } from '../api';
import { openSuiteSong } from '../actions/open_suite_song';

// Song picker over the suite's data/stems tree (via the suite bridge).
export default function SuiteBox() {
  const [open, setOpen] = useState(false);
  const [songs, setSongs] = useState(null); // null = loading

  useEffect(() => {
    if (!open) return undefined;
    setSongs(null);
    fetchSuiteSongs().then(setSongs);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button title="Open a song from the suite (data/stems)" onClick={() => setOpen(true)}>Suite…</button>
      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>data/stems</h2>
            {songs === null && <div className="dim">Loading…</div>}
            {songs && !songs.length && (
              <div className="dim">
                No songs found — expected data/stems/&lt;album&gt;/&lt;song&gt;/*.wav
                (needs the dev server's suite bridge).
              </div>
            )}
            {songs && songs.map((entry) => (
              <button
                key={`${entry.album}/${entry.song}`}
                className="song-entry"
                onClick={() => {
                  setOpen(false);
                  openSuiteSong(entry);
                }}
              >
                <span>{entry.album} / <b>{entry.song}</b></span>
                <span className="dim">
                  {entry.stems.length} stems
                  {entry.hasMix ? ' · mix.json' : ''}
                  {entry.srt ? ' · markers' : ''}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
