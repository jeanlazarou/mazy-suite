import { useTwinStore } from '../state/store.js';
import { markOneSided, clearPending } from '../actions/pair_range.js';
import { clock as formatClock } from '../format.js';

// A stretch has been taken and is waiting. There are exactly two ways on —
// pair it with its match on the other side, or say it has none — and both are
// on screen with a button, rather than hidden in a toast. The one-sided
// button names what it will make ("added", "removed"), since that follows
// from the side the stretch is on.
export function PendingBar() {
  const pending = useTwinStore((s) => s.pending);
  const doc = useTwinStore((s) => s.doc);
  if (!pending || !doc) return null;

  const here = doc.sides[pending.side].label;
  const there = doc.sides[pending.side === 'a' ? 'b' : 'a'].label;
  const kind = pending.side === 'a' ? 'removed' : 'added';
  const [from, to] = pending.range;

  return (
    <div className={`pending-bar pending-${pending.side}`}>
      <span className="pending-what">
        <strong>{here}</strong> {formatClock(from)}–{formatClock(to)}
      </span>
      <span className="pending-then">
        drag (or Shift+click) its match on <strong>{there}</strong>
      </span>
      <span className="pending-or">or</span>
      <button type="button" className={`kind-button kind-${kind}`} onClick={markOneSided} title="a or r">
        only in {here} — {kind}
      </button>
      <button type="button" onClick={clearPending} title="Esc">
        cancel
      </button>
    </div>
  );
}
