/**
 * The maths behind selecting a region in the Waveform Editor: what a press
 * grabs, where a drag takes the selection, zooming, and where a looping
 * preview's playhead is. Times are seconds into the audio file.
 */

export interface Selection {
  start: number;
  end: number;
}

/** What a press on the waveform grabs. */
export type SelectionGrab = 'new' | 'start' | 'end' | 'move';

/** Shortest selection allowed, so one edge can never cross the other. */
export const MIN_SELECTION_SECONDS = 0.01;

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

/**
 * What a press at pixel `x` grabs: an edge within `reach` pixels of it, the
 * middle of the selection, or - anywhere else - the start of a new one.
 */
export function grabAt(
  x: number,
  selection: Selection | null,
  toX: (time: number) => number,
  reach: number
): SelectionGrab {
  if (!selection) return 'new';
  const startX = toX(selection.start);
  const endX = toX(selection.end);

  // Nearest edge first: on a narrow selection both are within reach.
  const toStart = Math.abs(x - startX);
  const toEnd = Math.abs(x - endX);
  if (Math.min(toStart, toEnd) <= reach) return toStart <= toEnd ? 'start' : 'end';
  if (x > startX && x < endX) return 'move';
  return 'new';
}

/**
 * The selection after a drag that grabbed `grab` at `fromTime` has reached
 * `time`, kept inside [0, duration] and never shorter than the minimum.
 */
export function dragSelection(
  grab: SelectionGrab,
  origin: Selection | null,
  fromTime: number,
  time: number,
  duration: number
): Selection {
  const at = clamp(time, 0, duration);

  if (grab === 'new' || !origin) {
    return { start: Math.min(fromTime, at), end: Math.max(fromTime, at) };
  }
  if (grab === 'start') {
    return { start: Math.min(at, origin.end - MIN_SELECTION_SECONDS), end: origin.end };
  }
  if (grab === 'end') {
    return { start: origin.start, end: Math.max(at, origin.start + MIN_SELECTION_SECONDS) };
  }

  const length = origin.end - origin.start;
  const start = clamp(origin.start + (time - fromTime), 0, duration - length);
  return { start, end: start + length };
}

/**
 * Zoom the view by `factor` (above 1 zooms in), keeping the time under
 * `anchor` - a fraction of the view's width - where it is. Never zooms out
 * past the whole file or in past `maxZoom`.
 */
export function zoomView(
  view: Selection,
  factor: number,
  anchor: number,
  duration: number,
  maxZoom: number
): Selection {
  const span = view.end - view.start;
  const nextSpan = clamp(span / factor, duration / maxZoom, duration);
  const anchorTime = view.start + anchor * span;
  const start = clamp(anchorTime - anchor * nextSpan, 0, duration - nextSpan);
  return { start, end: start + nextSpan };
}

/** Slide the view by `seconds`, staying inside the file. */
export function panView(view: Selection, seconds: number, duration: number): Selection {
  const span = view.end - view.start;
  const start = clamp(view.start + seconds, 0, duration - span);
  return { start, end: start + span };
}

/**
 * Where a preview's playhead is after `elapsed` more seconds. Looping, it
 * wraps back into the selection on reaching its end, as the audio does -
 * even when the selection has just been moved behind it.
 */
export function advancePlayhead(
  position: number,
  elapsed: number,
  selection: Selection,
  loop: boolean
): number {
  const next = position + elapsed;
  const length = selection.end - selection.start;
  if (!loop || next < selection.end || length <= 0) return next;
  return selection.start + ((next - selection.start) % length);
}
