import { AudioClip, Track, TrackClip } from '../types';
import { getEffectiveRange, getRepeatCount, getTrackClipEnd } from './clipTiming';

/**
 * Linked clips.
 *
 * A group is every track clip sharing a linkId. Two gestures act on it, and
 * they use deliberately different models:
 *
 * - Moving is a rigid body. Every member shifts by the same delta, and the
 *   whole gesture is refused if any one of them cannot land.
 * - Resizing is a plunger. The dragged edge carries along every member's edge
 *   it runs into, and leaves alone the ones it never reaches. Growing an edge
 *   therefore does nothing to the others: it only ever moves away from them.
 *
 * Everything here is pure, and every rule is computed from a snapshot taken
 * when the mouse went down rather than from live state. That keeps a gesture
 * reversible while it is still running: pull an edge past a member and back
 * out again and the member returns to where it started.
 */

/** Shortest a clip may be trimmed to. Matches what the resize handles allow. */
export const MIN_CLIP_DURATION = 0.1;

export interface TrackClipRef {
  trackId: string;
  trackClipId: string;
}

/** A change to one track clip, staying on its own track. */
export interface TrackClipPatch extends TrackClipRef {
  updates: Partial<TrackClip>;
}

/** A change that may also carry a clip to another track. */
export interface TrackClipMove extends TrackClipRef {
  targetTrackId: string;
  position: number;
}

/** A group member frozen at the start of a gesture. */
export interface LinkedMember extends TrackClipRef {
  trackClip: TrackClip;
  clip: AudioClip;
  /** Timeline start. */
  start: number;
  /** Timeline end, repeats included. */
  end: number;
  /** Length of one repetition. */
  unit: number;
  repeats: number;
}

/** Fields a linked gesture may touch, used to diff a gesture for the undo history. */
const GESTURE_KEYS = [
  'position',
  'trimStart',
  'trimEnd',
  'repeat',
  'repeatCount',
  'fadeIn',
  'fadeOut',
] as const;

export function findTrackClip(
  tracks: Track[],
  ref: TrackClipRef
): TrackClip | undefined {
  return tracks
    .find((t) => t.id === ref.trackId)
    ?.clips.find((tc) => tc.id === ref.trackClipId);
}

/** Every member of a clip's group, itself included. Empty when it is unlinked. */
export function getLinkedRefs(tracks: Track[], ref: TrackClipRef): TrackClipRef[] {
  const trackClip = findTrackClip(tracks, ref);
  if (!trackClip?.linkId) return [];
  return getGroupRefs(tracks, trackClip.linkId);
}

/** Every member of a named group. */
export function getGroupRefs(tracks: Track[], linkId: string): TrackClipRef[] {
  const refs: TrackClipRef[] = [];
  for (const track of tracks) {
    for (const trackClip of track.clips) {
      if (trackClip.linkId === linkId) {
        refs.push({ trackId: track.id, trackClipId: trackClip.id });
      }
    }
  }
  return refs;
}

/** How many clips are in a clip's group. 0 when it is unlinked. */
export function getLinkSize(tracks: Track[], ref: TrackClipRef): number {
  return getLinkedRefs(tracks, ref).length;
}

function measure(
  trackId: string,
  trackClip: TrackClip,
  clip: AudioClip
): LinkedMember {
  const unit = getEffectiveRange(trackClip, clip).duration;
  const repeats = getRepeatCount(trackClip);

  return {
    trackId,
    trackClipId: trackClip.id,
    trackClip,
    clip,
    start: trackClip.position,
    end: trackClip.position + unit * repeats,
    unit,
    repeats,
  };
}

/**
 * The group a gesture is about to act on, measured as it stands now. Returns
 * an empty array for an unlinked clip, which is the caller's cue to keep to
 * the plain single-clip path.
 */
export function snapshotGroup(
  tracks: Track[],
  clips: AudioClip[],
  ref: TrackClipRef
): LinkedMember[] {
  const members: LinkedMember[] = [];

  for (const memberRef of getLinkedRefs(tracks, ref)) {
    const trackClip = findTrackClip(tracks, memberRef);
    const clip = trackClip && clips.find((c) => c.id === trackClip.clipId);
    if (!trackClip || !clip) continue;
    members.push(measure(memberRef.trackId, trackClip, clip));
  }

  return members;
}

/**
 * The members a dragged edge can run into: the ones it is travelling towards.
 * A member that already ends later than the dragged clip is never reached by
 * its right edge however far it is pulled in, and the same in mirror for the
 * left.
 */
function carried(
  members: LinkedMember[],
  self: LinkedMember,
  edge: 'left' | 'right'
): LinkedMember[] {
  return members.filter((m) => {
    if (m.trackClipId === self.trackClipId) return false;
    return edge === 'right' ? m.end <= self.end : m.start >= self.start;
  });
}

/**
 * How far the dragged edge may travel before a carried member would be
 * squeezed below the minimum length. The gesture halts there rather than
 * letting the group come apart, so this is a hard stop for the dragged clip
 * too. Returns -Infinity (right) or Infinity (left) when nothing is carried.
 */
export function linkedResizeLimit(
  members: LinkedMember[],
  self: LinkedMember,
  edge: 'left' | 'right'
): number {
  let limit = edge === 'right' ? -Infinity : Infinity;

  for (const m of carried(members, self, edge)) {
    limit =
      edge === 'right'
        ? Math.max(limit, m.start + MIN_CLIP_DURATION)
        : Math.min(limit, m.end - MIN_CLIP_DURATION);
  }

  return limit;
}

/** Turn a repetition count back into the pair of fields that expresses it. */
function repeatFields(count: number): Partial<TrackClip> {
  return count > 1
    ? { repeat: true, repeatCount: count }
    : { repeat: false, repeatCount: undefined };
}

/** Fades cannot outlast the clip they are drawn on. */
function clampFades(trackClip: TrackClip, duration: number): Partial<TrackClip> {
  const updates: Partial<TrackClip> = {};

  if (trackClip.fadeIn && trackClip.fadeIn > duration) updates.fadeIn = duration;
  if (trackClip.fadeOut && trackClip.fadeOut > duration) updates.fadeOut = duration;

  return updates;
}

/**
 * A carried member cut down to `length`, keeping the given end of it pinned.
 *
 * A repeating clip is treated as one long clip: what gives way first is the
 * repetition count, one whole repetition at a time, and only once the last
 * one is gone does the trim itself start moving.
 */
function shorten(
  m: LinkedMember,
  length: number,
  edge: 'left' | 'right'
): TrackClipPatch {
  const ref = { trackId: m.trackId, trackClipId: m.trackClipId };
  const range = getEffectiveRange(m.trackClip, m.clip);

  if (length >= m.unit) {
    // Still more than one repetition long: drop whole repetitions and leave
    // the clip itself untouched.
    const repeats = Math.floor(length / m.unit);
    const updates: Partial<TrackClip> = repeatFields(repeats);
    if (edge === 'left') updates.position = m.end - repeats * m.unit;
    return { ...ref, updates };
  }

  // Down to a single pass: trim it the ordinary way.
  const updates: Partial<TrackClip> = {
    ...repeatFields(1),
    ...clampFades(m.trackClip, length),
  };

  if (edge === 'right') {
    updates.trimEnd = range.start + length;
  } else {
    updates.trimStart = range.end - length;
    updates.position = m.end - length;
  }

  return { ...ref, updates };
}

/**
 * What the rest of the group does when one member's edge is dragged to
 * `edgeValue` (a timeline position). Pass an edge already clamped by
 * linkedResizeLimit.
 */
export function solveLinkedResize(
  members: LinkedMember[],
  self: LinkedMember,
  edge: 'left' | 'right',
  edgeValue: number
): TrackClipPatch[] {
  const patches: TrackClipPatch[] = [];

  for (const m of carried(members, self, edge)) {
    if (edge === 'right') {
      // Not reached yet - and never reached at all when growing.
      if (edgeValue >= m.end) continue;
      patches.push(shorten(m, edgeValue - m.start, edge));
    } else {
      if (edgeValue <= m.start) continue;
      patches.push(shorten(m, m.end - edgeValue, edge));
    }
  }

  return patches;
}

/**
 * Where the whole group lands when it is dragged by `deltaSeconds` and
 * `deltaTracks`. Null when any member would fall off the timeline, off the
 * end of the track list, or onto a clip outside the group: the group moves
 * as one or not at all.
 */
export function solveLinkedMove(
  tracks: Track[],
  clips: AudioClip[],
  members: LinkedMember[],
  deltaSeconds: number,
  deltaTracks: number,
  options: { allowOverlap?: boolean } = {}
): TrackClipMove[] | null {
  const moves: TrackClipMove[] = [];
  const movedIds = new Set(members.map((m) => m.trackClipId));

  for (const m of members) {
    const from = tracks.findIndex((t) => t.id === m.trackId);
    const to = from + deltaTracks;
    if (from < 0 || to < 0 || to >= tracks.length) return null;

    const position = m.start + deltaSeconds;
    if (position < 0) return null;

    const target = tracks[to];
    const end = position + (m.end - m.start);

    // Members vacate their own slots as part of the same move, so only clips
    // outside the group can stand in the way.
    const blocked =
      !options.allowOverlap &&
      target.clips.some((tc) => {
        if (movedIds.has(tc.id)) return false;
        const other = clips.find((c) => c.id === tc.clipId);
        if (!other) return false;
        return position < getTrackClipEnd(tc, other) && end > tc.position;
      });
    if (blocked) return null;

    moves.push({
      trackId: m.trackId,
      trackClipId: m.trackClipId,
      targetTrackId: target.id,
      position,
    });
  }

  return moves;
}

/**
 * What a gesture did to one clip, as old and new values. Null when it left
 * the clip alone, so carried members that were never reached stay out of the
 * undo history.
 */
export function diffTrackClip(
  before: TrackClip,
  after: TrackClip
): { oldValues: Partial<TrackClip>; newValues: Partial<TrackClip> } | null {
  const oldValues: Partial<TrackClip> = {};
  const newValues: Partial<TrackClip> = {};
  let changed = false;

  for (const key of GESTURE_KEYS) {
    if (before[key] === after[key]) continue;
    Object.assign(oldValues, { [key]: before[key] });
    Object.assign(newValues, { [key]: after[key] });
    changed = true;
  }

  return changed ? { oldValues, newValues } : null;
}
