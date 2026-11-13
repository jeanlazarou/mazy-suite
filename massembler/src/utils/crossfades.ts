import { AudioClip, AudioFile, Track, TrackClip } from '../types';
import { resolveClipPlaybackRate } from './clipEffects';
import { getEffectiveRange, getTrackClipEnd } from './clipTiming';

/**
 * Crossfades at joins: where one clip ends exactly as the next begins on the
 * same track, the later clip's `crossfade` lets the two overlap in sound
 * though not on the timeline. Centred on the join, the earlier clip plays on
 * past its end while fading out, and the later starts before its start while
 * fading in, each borrowing audio from beyond its own cut - as audio editors
 * crossfade at a cut. Clips never overlap, so nothing about moving, trimming
 * or snapping changes.
 */

/** How close an end and a start must be to count as touching. */
const JOIN_TOLERANCE = 1e-4;

/** The clip on the same track that ends exactly where this one starts, if any. */
export function clipBefore(track: Track, trackClip: TrackClip, clips: AudioClip[]): TrackClip | null {
  for (const other of track.clips) {
    if (other.id === trackClip.id) continue;
    const clip = clips.find((c) => c.id === other.clipId);
    if (clip && Math.abs(getTrackClipEnd(other, clip) - trackClip.position) < JOIN_TOLERANCE) {
      return other;
    }
  }
  return null;
}

export interface JoinSide {
  trackClip: TrackClip;
  clip: AudioClip;
  /** Length of the clip's audio file. */
  fileDuration: number;
}

/**
 * Seconds of timeline a clip can reach past its end, or back before its
 * start, into the file around the stretch it plays - read backwards for a
 * reversed clip, at its own rate for a pitched one.
 */
function room({ trackClip, clip, fileDuration }: JoinSide, edge: 'start' | 'end'): number {
  const { start, duration } = getEffectiveRange(trackClip, clip);
  const rate = resolveClipPlaybackRate(trackClip.effect);

  if (trackClip.effect === 'reverse') {
    return edge === 'end' ? start : fileDuration - (start + duration);
  }
  return edge === 'end' ? (fileDuration - start) / rate - duration : start / rate;
}

/**
 * Half the crossfade that is actually heard at a join: half of what the later
 * clip asks for, cut down to the audio there is beyond each cut, and to half
 * of either clip.
 */
export function crossfadeHalf(earlier: JoinSide, later: JoinSide, length: number): number {
  const earlierLength = getEffectiveRange(earlier.trackClip, earlier.clip).duration;
  const laterLength = getEffectiveRange(later.trackClip, later.clip).duration;
  return Math.max(
    0,
    Math.min(
      length / 2,
      room(earlier, 'end'),
      room(later, 'start'),
      earlierLength / 2,
      laterLength / 2
    )
  );
}

function sideOf(trackClip: TrackClip, clips: AudioClip[], audioFiles: AudioFile[]): JoinSide | null {
  const clip = clips.find((c) => c.id === trackClip.clipId);
  const file = clip && audioFiles.find((f) => f.id === clip.audioFileId);
  return clip && file ? { trackClip, clip, fileDuration: file.duration } : null;
}

/**
 * How long the crossfade at this clip's start actually lasts: 0 without one,
 * or with no clip touching it; otherwise what was asked, or less.
 */
export function heardCrossfade(
  track: Track,
  trackClip: TrackClip,
  clips: AudioClip[],
  audioFiles: AudioFile[]
): number {
  if (!trackClip.crossfade || trackClip.crossfade <= 0) return 0;
  const earlier = clipBefore(track, trackClip, clips);
  const earlierSide = earlier && sideOf(earlier, clips, audioFiles);
  const laterSide = sideOf(trackClip, clips, audioFiles);
  if (!earlierSide || !laterSide) return 0;
  return 2 * crossfadeHalf(earlierSide, laterSide, trackClip.crossfade);
}

/**
 * For each clip on a track that crossfades with a neighbour: how far its first
 * pass reaches back before its start, and its last pass on after its end.
 */
export function crossfadeReach(
  track: Track,
  clips: AudioClip[],
  audioFiles: AudioFile[]
): Map<string, { before: number; after: number }> {
  const reach = new Map<string, { before: number; after: number }>();
  const at = (id: string) => {
    let entry = reach.get(id);
    if (!entry) {
      entry = { before: 0, after: 0 };
      reach.set(id, entry);
    }
    return entry;
  };
  for (const later of track.clips) {
    const half = heardCrossfade(track, later, clips, audioFiles) / 2;
    if (half < 0.001) continue;
    const earlier = clipBefore(track, later, clips) as TrackClip;
    at(later.id).before = half;
    at(earlier.id).after = half;
  }

  return reach;
}
