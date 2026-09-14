// The magnet, applied. Everything that places an edge — a drag, a click, a
// band-edge resize — goes through here, so one toggle governs all of them and
// they all stick to the same things.

import { useTwinStore } from '../state/store.js';
import { snapTime, snapRadius, boundaryTimes, rangeToBoundary } from '../model/snap.js';
import { mapTime } from '../model/bands.js';

function context(side, { ignoreSegment = -1 } = {}) {
  const { doc, durations, peaks, pxPerSec, position, clock, layout, lyrics } = useTwinStore.getState();
  const segments = doc.segments.filter((_, index) => index !== ignoreSegment);
  return {
    boundaries: boundaryTimes(segments, side, durations[side]),
    lyrics: (lyrics[side]?.cues ?? []).flatMap((cue) => [cue.from, cue.to]),
    peaks: peaks[side],
    // The playhead as this side sees it: on the silent side that is the
    // mapped position, which is where its counterpart currently is.
    playhead: side === clock ? position : mapTime(layout, clock, side, position),
    radius: snapRadius(pxPerSec),
  };
}

export function snap(side, t, options) {
  if (!useTwinStore.getState().magnet) return { time: t, to: null };
  return snapTime(t, context(side, options));
}

export function snapRange(side, [from, to], options) {
  return [snap(side, from, options).time, snap(side, to, options).time];
}

// One click, one region: from the previous boundary on that side to the
// clicked moment (or forward to the next one).
export function rangeFromClick(side, t, reach) {
  const { doc, durations } = useTwinStore.getState();
  const boundaries = boundaryTimes(doc.segments, side, durations[side]);
  return rangeToBoundary(boundaries, snap(side, t).time, reach);
}
