import { useTwinStore } from '../state/store.js';
import { mapTime } from '../model/bands.js';
import { togglePlay } from '../actions/toggle_play.js';
import { setAudible } from '../actions/set_audible.js';
import { swapAudible } from '../actions/swap_audible.js';
import { seekHome } from '../actions/seek.js';
import { zoomBy, toggleFollow } from '../actions/set_zoom.js';
import { saveTwin } from '../actions/save_twin.js';
import { downloadTwin } from '../actions/download_twin.js';
import { stepTwin } from '../actions/step_twin.js';
import { placeInSet } from '../model/sets.js';
import { toggleLayoutMode, toggleMagnet } from '../actions/set_view_mode.js';
import { undo, redo } from '../state/history.js';
import { clock as formatClock } from '../format.js';

export function Transport({ onOpen, onHelp }) {
  const doc = useTwinStore((s) => s.doc);
  const playing = useTwinStore((s) => s.playing);
  const audible = useTwinStore((s) => s.audible);
  const clockSide = useTwinStore((s) => s.clock);
  const position = useTwinStore((s) => s.position);
  const durations = useTwinStore((s) => s.durations);
  const layout = useTwinStore((s) => s.layout);
  const follow = useTwinStore((s) => s.follow);
  const status = useTwinStore((s) => s.status);
  const dirty = useTwinStore((s) => s.dirty);
  const past = useTwinStore((s) => s.past);
  const future = useTwinStore((s) => s.future);
  const layoutMode = useTwinStore((s) => s.layoutMode);
  const magnet = useTwinStore((s) => s.magnet);
  const twins = useTwinStore((s) => s.twins);
  const file = useTwinStore((s) => s.file);
  const place = placeInSet(twins, file);

  const ready = status === 'ready';
  const other = clockSide === 'a' ? 'b' : 'a';
  const times = {
    [clockSide]: position,
    [other]: mapTime(layout, clockSide, other, position),
  };

  return (
    <header className="transport">
      <div className="transport-left">
        <button type="button" className="primary" onClick={togglePlay} disabled={!ready}>
          {playing ? '❚❚' : '▶'}
        </button>
        <button type="button" onClick={seekHome} disabled={!ready}>
          ⤒
        </button>
        <span className="position">
          <strong>{formatClock(times.a)}</strong>
          <span className="of"> / {formatClock(durations.a)}</span>
          <span className="sep">·</span>
          <strong>{formatClock(times.b)}</strong>
          <span className="of"> / {formatClock(durations.b)}</span>
        </span>
      </div>

      <div className="transport-middle">
        <span className="label">hear</span>
        <div className="hear">
          {['a', 'b', 'both'].map((mode) => (
            <button
              key={mode}
              type="button"
              className={audible === mode ? 'is-on' : ''}
              onClick={() => setAudible(mode)}
              disabled={!ready}
            >
              {mode === 'both' ? 'both' : (doc?.sides?.[mode]?.label ?? mode.toUpperCase())}
            </button>
          ))}
        </div>
        <button type="button" onClick={swapAudible} disabled={!ready} title="Tab">
          ⇄ swap
        </button>
        {audible === 'both' ? (
          <span className="warn" title="No time-stretching: the two drift apart as much as the recordings disagree">
            drifts
          </span>
        ) : null}
      </div>

      <div className="transport-right">
        <button type="button" onClick={undo} disabled={!past.length} title="Ctrl+Z">
          ↶
        </button>
        <button type="button" onClick={redo} disabled={!future.length} title="Ctrl+Y">
          ↷
        </button>
        <button type="button" onClick={saveTwin} disabled={!ready} title="Ctrl+S">
          {dirty ? 'save *' : 'save'}
        </button>
        <button
          type="button"
          onClick={downloadTwin}
          disabled={!ready}
          title="Ctrl+Shift+S — download the twin document as a file"
        >
          ⤓
        </button>
        <button type="button" onClick={() => zoomBy(1 / 1.4)} disabled={!ready}>
          −
        </button>
        <button type="button" onClick={() => zoomBy(1.4)} disabled={!ready}>
          +
        </button>
        <button
          type="button"
          className={layoutMode === 'true' ? 'is-on' : ''}
          onClick={toggleLayoutMode}
          disabled={!ready}
          title="t — true scale shows which side is longer; aligned stretches both to fill the band"
        >
          true scale
        </button>
        <button
          type="button"
          className={magnet ? 'is-on' : ''}
          onClick={toggleMagnet}
          disabled={!ready}
          title="m — edges stick to boundaries, the playhead and quiet moments"
        >
          magnet
        </button>
        <button type="button" className={follow ? 'is-on' : ''} onClick={toggleFollow} disabled={!ready}>
          follow
        </button>
        {place && place.count > 1 ? (
          <div className="set-stepper" title={`${place.set} — ← / → step through its twins`}>
            <button type="button" onClick={() => stepTwin(-1)} disabled={!place.previous}>
              ‹
            </button>
            <span className="place">
              {place.index + 1} / {place.count}
            </span>
            <button type="button" onClick={() => stepTwin(1)} disabled={!place.next}>
              ›
            </button>
          </div>
        ) : null}
        <button type="button" onClick={onOpen}>
          open…
        </button>
        <button type="button" onClick={onHelp} title="Hotkeys">
          ?
        </button>
      </div>
    </header>
  );
}
