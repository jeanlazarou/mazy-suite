import { AudioClip, Track, TrackClip } from '../types';

/**
 * How long a track clip occupies the timeline.
 *
 * This lives in one place on purpose. The same arithmetic was previously
 * repeated at every call site, and the copies drifted: some honoured the
 * trim overrides and some used the library clip's untrimmed length, so a
 * trimmed clip reported the wrong duration.
 */

/** The region of source audio a track clip plays, honouring its trim overrides. */
export function getEffectiveRange(trackClip: TrackClip, clip: AudioClip) {
  const start = trackClip.trimStart ?? clip.startTime;
  const end = trackClip.trimEnd ?? clip.endTime;
  return { start, end, duration: end - start };
}

/** How many times it plays. Mirrors what the audio engine actually schedules. */
export function getRepeatCount(trackClip: TrackClip): number {
  return trackClip.repeat && trackClip.repeatCount ? trackClip.repeatCount : 1;
}

/** Seconds of timeline it occupies, repeats included. */
export function getTrackClipDuration(trackClip: TrackClip, clip: AudioClip): number {
  return getEffectiveRange(trackClip, clip).duration * getRepeatCount(trackClip);
}

/** Timeline position where it stops sounding. */
export function getTrackClipEnd(trackClip: TrackClip, clip: AudioClip): number {
  return trackClip.position + getTrackClipDuration(trackClip, clip);
}

/** Length of the whole project: the furthest point any clip reaches. */
export function getProjectDuration(
  tracks: Track[],
  clips: AudioClip[],
  minimum: number = 0
): number {
  let furthest = minimum;

  for (const track of tracks) {
    for (const trackClip of track.clips) {
      const clip = clips.find((c) => c.id === trackClip.clipId);
      if (!clip) continue;
      furthest = Math.max(furthest, getTrackClipEnd(trackClip, clip));
    }
  }

  return furthest;
}
