import { AudioClip, Track } from '../types';
import { getTrackClipEnd } from './clipTiming';

/**
 * Snapping: while a clip is dragged or resized, an edge that comes within
 * reach of another clip's edge, the playhead or the start of the timeline is
 * pulled onto it.
 */

/** How close an edge must come to a target to be pulled onto it, in pixels. */
export const SNAP_PX = 8;

/**
 * Timeline times worth snapping to: where every clip starts and stops (on any
 * track, repeats included), the playhead, and zero. Clips in `exclude` - the
 * ones being moved - are left out.
 */
export function snapTargets(
  tracks: Track[],
  clips: AudioClip[],
  playhead: number,
  exclude: Set<string> = new Set()
): number[] {
  const targets = new Set<number>([0, playhead]);

  for (const track of tracks) {
    for (const trackClip of track.clips) {
      if (exclude.has(trackClip.id)) continue;
      const clip = clips.find((c) => c.id === trackClip.clipId);
      if (!clip) continue;
      targets.add(trackClip.position);
      targets.add(getTrackClipEnd(trackClip, clip));
    }
  }

  return [...targets];
}

/** The target nearest `value` within `reach`, or null. */
export function snapPoint(value: number, targets: number[], reach: number): number | null {
  let best: number | null = null;
  for (const target of targets) {
    const distance = Math.abs(target - value);
    if (distance <= reach && (best === null || distance < Math.abs(best - value))) {
      best = target;
    }
  }
  return best;
}

/**
 * Snap a span being moved: whichever of its two edges is nearer a target
 * decides. Returns the new start and the target it lined up with, or null
 * when neither edge is within reach.
 */
export function snapSpan(
  start: number,
  length: number,
  targets: number[],
  reach: number
): { start: number; at: number } | null {
  const options: Array<{ start: number; at: number; shift: number }> = [];

  const byStart = snapPoint(start, targets, reach);
  if (byStart !== null) {
    options.push({ start: byStart, at: byStart, shift: Math.abs(byStart - start) });
  }

  // A span cannot be pulled to before the timeline begins.
  const byEnd = snapPoint(start + length, targets, reach);
  if (byEnd !== null && byEnd - length >= 0) {
    options.push({ start: byEnd - length, at: byEnd, shift: Math.abs(byEnd - (start + length)) });
  }

  if (options.length === 0) return null;
  const best = options.reduce((a, b) => (b.shift < a.shift ? b : a));
  return { start: best.start, at: best.at };
}
