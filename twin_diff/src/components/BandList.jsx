import { useTwinStore } from '../state/store.js';
import { selectBand } from '../actions/select_band.js';
import { mergeWith } from '../actions/merge_segments.js';
import { seedFromLyrics } from '../actions/seed_from_lyrics.js';
import { mergeNeighbour, isSliver, gapOptions } from '../model/edits.js';
import { classifyBand, describeOption } from '../actions/classify_gap.js';
import { openPublishedVersion } from '../actions/open_twin.js';
import { mayLeaveTwin } from '../actions/guard_unsaved.js';
import { clock as formatClock } from '../format.js';

// The band list doubles as a table of contents, the way a diff viewer lists
// its hunks. It shows what the document says — including the gaps it does
// not classify, which is most of an unclassified twin.
export function BandList() {
  const layout = useTwinStore((s) => s.layout);
  const selected = useTwinStore((s) => s.selected);
  const problems = useTwinStore((s) => s.problems);
  const doc = useTwinStore((s) => s.doc);
  const lyrics = useTwinStore((s) => s.lyrics);
  const localCopy = useTwinStore((s) => s.localCopy);

  if (!doc) return null;
  const classified = layout.filter((b) => b.kind !== 'unknown').length;
  const canSeed = !!(lyrics.a && lyrics.b);

  return (
    <aside className="band-list">
      <div className="band-list-head">
        <span>
          {classified ? `${classified} segment${classified === 1 ? '' : 's'}` : 'nothing classified yet'}
        </span>
        {canSeed ? (
          <button
            type="button"
            className="seed-button"
            onClick={seedFromLyrics}
            title="g — propose segments from the two lyric tracks, around what is already marked"
          >
            seed from lyrics
          </button>
        ) : null}
      </div>
      {localCopy ? (
        <div className="local-copy">
          <span title={`saved ${new Date(localCopy.savedAt).toLocaleString()}`}>
            your version, saved in this browser
          </span>
          <button
            type="button"
            onClick={() => {
              if (mayLeaveTwin('published', 'click it again')) openPublishedVersion();
            }}
            title="forget the browser's copy and open the published version — ⤓ first to keep yours as a file"
          >
            published version
          </button>
        </div>
      ) : null}
      <ol>
        {layout.map((band, index) => {
          if (isSliver(band)) return null;
          // Where a segment touches the next one of its kind, the seam
          // between the two rows offers to join them.
          const next = band.segment === null ? -1 : mergeNeighbour(doc.segments, band.segment, 1);
          return (
            <li key={index}>
              <button
                type="button"
                className={`band-row kind-${band.kind}${index === selected ? ' is-selected' : ''}`}
                onClick={() => selectBand(index)}
              >
                <span className="dot" />
                <span className="row-kind">{band.kind}</span>
                <span className="row-label">{band.label ?? ''}</span>
                <span className="row-times">
                  {band.hasA ? formatClock(band.a[0]) : '—'}
                  {' / '}
                  {band.hasB ? formatClock(band.b[0]) : '—'}
                </span>
              </button>
              {gapOptions(doc.segments, band).length ? (
                <div className="gap-actions">
                  <span>mark as</span>
                  {gapOptions(doc.segments, band).map((option) => (
                    <button
                      key={`${option.kind}-${option.extend}`}
                      type="button"
                      className={`kind-button kind-${option.kind}`}
                      onClick={() => classifyBand(index, option)}
                      title={
                        option.extend
                          ? `${option.kind === 'same' ? 's' : 'c'} — the ${option.kind} segment${option.extend === 'both' ? 's around it take' : ` ${option.extend === 'before' ? 'above' : 'below'} takes`} this gap in`
                          : option.kind === 'same'
                            ? 's'
                            : option.kind === 'changed'
                              ? 'c'
                              : 'a or r'
                      }
                    >
                      {describeOption(option)}
                    </button>
                  ))}
                </div>
              ) : null}
              {next >= 0 ? (
                <button
                  type="button"
                  className={`join-seam kind-${band.kind}`}
                  onClick={() => mergeWith(band.segment, next)}
                  title="j on the selected segment"
                >
                  ⤓ join with the next {band.kind}
                </button>
              ) : null}
            </li>
          );
        })}
      </ol>
      {problems.length ? (
        <div className="problems">
          <div className="problems-head">the document says</div>
          <ul>
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </aside>
  );
}
