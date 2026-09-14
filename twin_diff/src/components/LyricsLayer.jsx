import { useTwinStore } from '../state/store.js';
import { columns } from '../render/draw_twin.js';

const LINE = 19; // px — one line of lyric text, chip included

// The sung lines, beside each waveform at the moment they are sung. A thin
// bar along the outer edge spans each line at its true timing; the text sits
// at its start — or just below the line above it, when two lines are sung
// closer together than the text is tall, so they never print over each other.
// When both sides have lyrics, the words one side sings and the other does not
// are highlighted inline — which is where a misheard lyric shows itself.
export function LyricsLayer({ view, width, viewHeight }) {
  const lyrics = useTwinStore((s) => s.lyrics);
  const marks = useTwinStore((s) => s.wordMarks);
  const show = useTwinStore((s) => s.showLyrics);
  if (!show || !width) return null;

  const cols = columns(width);
  const items = [];

  for (const side of ['a', 'b']) {
    const column = cols[side];
    let textBelow = -Infinity; // where the previous line's text ends, on this side
    (lyrics[side]?.cues ?? []).forEach((cue, index) => {
      const top = view.y(side, cue.from);
      const bottom = view.y(side, cue.to);
      const textTop = Math.max(top, textBelow);
      textBelow = textTop + LINE;
      if (Math.max(bottom, textBelow) < -LINE || Math.min(top, textTop) > viewHeight) return;

      const words =
        marks?.[side]?.[index] ??
        String(cue.text)
          .split(/\s+/)
          .filter(Boolean)
          .map((word) => ({ word, same: true }));
      const placement = { left: column.left, width: column.width };

      items.push(
        <div
          key={`${side}-bar-${index}`}
          className={`cue-bar cue-bar-${side}`}
          style={{ ...placement, top, height: Math.max(2, bottom - top) }}
        />,
        <div key={`${side}-text-${index}`} className={`cue-line cue-line-${side}`} style={{ ...placement, top: textTop }}>
          <span className="cue-text">
            {words.map((w, k) => (
              <span key={k}>
                {k ? ' ' : ''}
                <span className={w.same ? undefined : 'cue-word-changed'}>{w.word}</span>
              </span>
            ))}
          </span>
        </div>,
      );
    });
  }

  return <div className="lyrics-layer">{items}</div>;
}
