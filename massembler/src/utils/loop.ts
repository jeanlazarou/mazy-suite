import { LoopRegion } from '../types';

/** Shortest loop region allowed, in seconds. */
export const MIN_LOOP_SECONDS = 0.2;

/**
 * Whether playback started at `from` goes round `region`: only from before
 * its end - started past it, playback simply carries on.
 */
export function activeLoop(region: LoopRegion | null, from: number): LoopRegion | null {
  if (!region || region.end - region.start < MIN_LOOP_SECONDS) return null;
  return from < region.end ? region : null;
}

/**
 * Where on the timeline playback is, `elapsed` seconds after starting at
 * `from`: straight on, or - looping - back round to the start of the region
 * each time it reaches the end.
 */
export function timelinePosition(from: number, elapsed: number, loop: LoopRegion | null): number {
  if (!loop || from >= loop.end) return from + elapsed;
  const first = loop.end - from;
  if (elapsed < first) return from + elapsed;
  return loop.start + ((elapsed - first) % (loop.end - loop.start));
}
