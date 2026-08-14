import { Track } from '../types';

/**
 * Whether soloing is in effect anywhere in the project.
 *
 * Solo is additive: any number of tracks can be soloed, and while at least
 * one is, the rest are silenced. Exclusive soloing is just the case where
 * only one is on, so this covers both without forcing a choice.
 */
export function hasSoloedTrack(tracks: Track[]): boolean {
  return tracks.some((track) => track.solo);
}

/**
 * Whether a track should be heard.
 *
 * Mute is the stronger statement: a track you explicitly silenced stays
 * silent even when soloed, so soloing a group never resurrects something you
 * had deliberately taken out.
 */
export function isTrackAudible(track: Track, tracks: Track[]): boolean {
  if (track.muted) return false;
  return hasSoloedTrack(tracks) ? !!track.solo : true;
}

/**
 * Whether a track is silent only because something else is soloed. Used to
 * show why a track that is not muted is nonetheless not being heard.
 */
export function isSilencedBySolo(track: Track, tracks: Track[]): boolean {
  return !track.muted && !track.solo && hasSoloedTrack(tracks);
}
