import { useRef } from 'react';

import { useTwinStore } from '../state/store.js';
import { GUTTER } from '../render/draw_twin.js';
import { loadLyricsFile } from '../actions/load_lyrics.js';
import { clock as formatClock } from '../format.js';

// Which side is which, pinned above the strips. The roles never swap: A stays
// left, B stays right, and the audible one is the one marked. Each side also
// says whether it has lyrics, and takes an SRT file when it has none.
export function SideHeaders() {
  const doc = useTwinStore((s) => s.doc);
  const durations = useTwinStore((s) => s.durations);
  const audible = useTwinStore((s) => s.audible);
  const lyrics = useTwinStore((s) => s.lyrics);
  const inputs = { a: useRef(null), b: useRef(null) };
  if (!doc) return null;

  const side = (key) => {
    const info = doc.sides[key];
    const hearing = audible === key || audible === 'both';
    const lines = lyrics[key]?.cues.length ?? 0;
    return (
      <div className={`side-header side-${key}${hearing ? ' is-audible' : ''}`}>
        <span className="side-label">{info.label}</span>
        {info.ai ? (
          <span className="ai-badge" title="machine-generated rendition">
            ⟨AI⟩
          </span>
        ) : null}
        <span className="side-meta">
          {formatClock(durations[key])}
          {info.album ? ` · ${info.album}` : ''}
        </span>
        <button
          type="button"
          className={`lyrics-button${lines ? ' has-lyrics' : ''}`}
          onClick={() => inputs[key].current?.click()}
          title={lines ? `${lyrics[key].source} — click to load another SRT` : 'load an SRT file for this side'}
        >
          {lines ? `♪ ${lines} lines` : '♪ lyrics…'}
        </button>
        <input
          ref={inputs[key]}
          type="file"
          accept=".srt,text/plain"
          hidden
          onChange={(event) => {
            const file = event.target.files[0];
            if (file) loadLyricsFile(key, file);
            event.target.value = '';
          }}
        />
      </div>
    );
  };

  return (
    <div className="side-headers">
      {side('a')}
      <div className="side-headers-gutter" style={{ width: GUTTER }}>
        {doc.title}
      </div>
      {side('b')}
    </div>
  );
}
