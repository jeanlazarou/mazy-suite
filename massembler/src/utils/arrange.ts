import { AudioClip, Track, TrackClip } from '../types';
import { resolveClipPlaybackRate } from './clipEffects';
import { TrackClipRef, getGroupRefs } from './clipLinks';
import {
  OVERLAP_EPSILON,
  getEffectiveRange,
  getTrackClipDuration,
  getTrackClipEnd,
  spansOverlap,
} from './clipTiming';

/**
 * Editing the arrangement: splitting clips, and copying them to be placed
 * again. Pure: the store applies what these return.
 */

/**
 * Split a track clip at timeline time `at` into the part before and the part
 * after, each playing the audio it played there. The fade-in stays with the
 * first part, the fade-out goes to the second. Null when `at` is not inside
 * the clip, or the clip repeats - a cut through a repetition has no single
 * clip to describe either side.
 */
export function splitTrackClip(
  trackClip: TrackClip,
  clip: AudioClip,
  at: number,
  secondId: string
): [TrackClip, TrackClip] | null {
  const repeats = trackClip.repeat && (trackClip.repeatCount ?? 1) > 1;
  if (repeats) return null;

  const range = getEffectiveRange(trackClip, clip);
  const offset = at - trackClip.position; // timeline seconds into the clip
  if (offset <= OVERLAP_EPSILON || offset >= range.duration - OVERLAP_EPSILON) return null;

  // Where in the file the cut falls. A reversed clip plays its region from
  // the end; a pitch preset reads `rate` seconds of file per second played.
  const reversed = trackClip.effect === 'reverse';
  const rate = resolveClipPlaybackRate(trackClip.effect);
  const rest = range.duration - offset;

  const { fadeIn, fadeOut } = trackClip;

  const first: TrackClip = {
    ...trackClip,
    ...(reversed
      ? { trimStart: range.end - offset, trimEnd: range.end }
      : { trimStart: range.start, trimEnd: range.start + offset }),
    fadeIn: fadeIn === undefined ? undefined : Math.min(fadeIn, offset),
    fadeOut: undefined,
  };

  const second: TrackClip = {
    ...trackClip,
    id: secondId,
    position: at,
    ...(reversed
      ? { trimStart: range.start, trimEnd: range.start + rest }
      : { trimStart: range.start + offset * rate, trimEnd: range.start + offset * rate + rest }),
    fadeIn: undefined,
    fadeOut: fadeOut === undefined ? undefined : Math.min(fadeOut, rest),
    // It now touches the first part: the crossfade stays with the clip before.
    crossfade: undefined,
  };

  return [first, second];
}

/** A track clip taken for placing again: where it sat relative to the others. */
export interface CopiedClip {
  trackId: string;
  /** Seconds after the earliest of the copied clips. */
  offset: number;
  trackClip: TrackClip;
}

/**
 * Copy track clips for placing again. A link is kept only when its whole
 * group is among them: copies of part of a group would otherwise join the
 * original group, and move with clips nobody copied.
 */
export function copyTrackClips(tracks: Track[], refs: TrackClipRef[]): CopiedClip[] {
  const wanted = new Set(refs.map((r) => r.trackClipId));
  const found: Array<{ trackId: string; trackClip: TrackClip }> = [];
  for (const track of tracks) {
    for (const trackClip of track.clips) {
      if (wanted.has(trackClip.id)) found.push({ trackId: track.id, trackClip });
    }
  }
  if (found.length === 0) return [];

  const earliest = Math.min(...found.map((f) => f.trackClip.position));
  return found.map(({ trackId, trackClip }) => {
    const { linkId, ...rest } = trackClip;
    const wholeGroup =
      linkId !== undefined && getGroupRefs(tracks, linkId).every((r) => wanted.has(r.trackClipId));
    return {
      trackId,
      offset: trackClip.position - earliest,
      trackClip: wholeGroup ? trackClip : { ...rest },
    };
  });
}

/** How long a set of copies spans, from the earliest start to the latest end. */
export function copiedSpan(copied: CopiedClip[], clips: AudioClip[]): number {
  let span = 0;
  for (const { offset, trackClip } of copied) {
    const clip = clips.find((c) => c.id === trackClip.clipId);
    if (clip) span = Math.max(span, offset + getTrackClipDuration(trackClip, clip));
  }
  return span;
}

/**
 * Place copies so the earliest starts at `at`, each on the track it came
 * from, with fresh ids - and fresh links for copied groups. Null when one
 * would overlap a clip already there (unless `allowOverlap`: an Alt-drag's
 * copies start out on top of what they copy), or its track is gone.
 */
export function placeCopies(
  tracks: Track[],
  clips: AudioClip[],
  copied: CopiedClip[],
  at: number,
  newId: () => string,
  newLinkId: () => string,
  allowOverlap = false
): { tracks: Track[]; placed: TrackClipRef[] } | null {
  const links = new Map<string, string>();
  const placed: Array<{ trackId: string; trackClip: TrackClip }> = [];

  for (const { trackId, offset, trackClip } of copied) {
    const track = tracks.find((t) => t.id === trackId);
    const clip = clips.find((c) => c.id === trackClip.clipId);
    if (!track || !clip) return null;

    const position = at + offset;
    const end = position + getTrackClipDuration(trackClip, clip);
    const blocked = !allowOverlap && track.clips.some((other) => {
      const otherClip = clips.find((c) => c.id === other.clipId);
      return otherClip && spansOverlap(position, end, other.position, getTrackClipEnd(other, otherClip));
    });
    if (blocked) return null;

    let linkId = trackClip.linkId;
    if (linkId !== undefined) {
      if (!links.has(linkId)) links.set(linkId, newLinkId());
      linkId = links.get(linkId);
    }
    placed.push({ trackId, trackClip: { ...trackClip, id: newId(), position, linkId } });
  }

  return {
    tracks: tracks.map((t) => {
      const arriving = placed.filter((p) => p.trackId === t.id).map((p) => p.trackClip);
      return arriving.length ? { ...t, clips: [...t.clips, ...arriving] } : t;
    }),
    placed: placed.map((p) => ({ trackId: p.trackId, trackClipId: p.trackClip.id })),
  };
}
