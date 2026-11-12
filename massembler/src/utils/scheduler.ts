import { AudioClip, AudioFile, Track, TrackClip } from '../types';
import {
  EffectChain,
  createEffectChain,
  resolveClipBuffer,
  resolveClipOffset,
  resolveClipPlaybackRate,
} from './clipEffects';
import { getEffectiveRange, getRepeatCount } from './clipTiming';

/**
 * Turns the arrangement into scheduled Web Audio nodes. Realtime playback and
 * the offline export both come through here, so what is heard is what gets
 * rendered.
 */

export interface Scheduled {
  sources: AudioBufferSourceNode[];
  /** Effect chains, some of which own generators that must be stopped. */
  chains: EffectChain[];
}

/** A clip pass's fade gain at `time` seconds into it. */
export function fadeGainAt(length: number, fadeIn: number, fadeOut: number, time: number): number {
  return Math.max(
    0,
    Math.min(1, fadeIn > 0 ? time / fadeIn : 1, fadeOut > 0 ? (length - time) / fadeOut : 1)
  );
}

/**
 * The fade envelope of one pass, as breakpoints over [0, length] that are
 * linear in between. When the fades overlap they meet in a peak below 1
 * instead of the fade-out jumping in mid-ramp.
 */
export function fadeEnvelope(
  length: number,
  fadeIn: number,
  fadeOut: number
): Array<{ time: number; gain: number }> {
  const times = [0, length, fadeIn, length - fadeOut];
  if (fadeIn > 0 && fadeOut > 0) times.push((length * fadeIn) / (fadeIn + fadeOut));

  return [...new Set(times.filter((t) => t >= 0 && t <= length))]
    .sort((a, b) => a - b)
    .map((time) => ({ time, gain: fadeGainAt(length, fadeIn, fadeOut, time) }));
}

function schedulePass(
  ctx: BaseAudioContext,
  buffer: AudioBuffer,
  trackClip: TrackClip,
  range: { start: number; end: number; duration: number },
  passStart: number,
  destination: AudioNode,
  from: number,
  at: number,
  until: number,
  scheduled: Scheduled
) {
  const length = range.duration;
  if (passStart + length <= from || passStart >= until) return;

  // Seconds of this pass already behind the playhead, when it sounds, and
  // how much of it sounds before `until` cuts it.
  const skip = Math.max(0, from - passStart);
  const when = at + Math.max(0, passStart - from);
  const playing = Math.min(length - skip, until - Math.max(passStart, from));

  const source = ctx.createBufferSource();
  source.buffer = resolveClipBuffer(ctx, buffer, trackClip.effect);
  // Pitch presets read `rate` seconds of buffer per second of timeline, so
  // the clip still fills exactly its slot.
  const rate = resolveClipPlaybackRate(trackClip.effect);
  source.playbackRate.value = rate;

  const fade = ctx.createGain();
  const chain = createEffectChain(ctx, trackClip.effect);
  if (chain) {
    source.connect(chain.input);
    chain.output.connect(fade);
    scheduled.chains.push(chain);
  } else {
    source.connect(fade);
  }
  fade.connect(destination);

  // The clip's own volume scales its fade envelope.
  const level = trackClip.gain ?? 1;
  const fadeIn = trackClip.fadeIn ?? 0;
  const fadeOut = trackClip.fadeOut ?? 0;
  if (fadeIn > 0 || fadeOut > 0) {
    fade.gain.setValueAtTime(level * fadeGainAt(length, fadeIn, fadeOut, skip), when);
    for (const point of fadeEnvelope(length, fadeIn, fadeOut)) {
      if (point.time > skip) {
        fade.gain.linearRampToValueAtTime(level * point.gain, when + point.time - skip);
      }
    }
  } else if (level !== 1) {
    fade.gain.value = level;
  }

  const offset = resolveClipOffset(source.buffer, trackClip.effect, range.start, range.end);
  source.start(when, offset + skip * rate, playing * rate);
  scheduled.sources.push(source);
}

/**
 * Schedule every clip pass that sounds at or after timeline time `from`, so
 * that `from` lands on context time `at` - and, given `until`, nothing at or
 * past it: a loop's pass ends there. Each track's clips go to the node
 * `inputFor` returns; a track it returns null for is left out.
 */
export function scheduleArrangement(
  ctx: BaseAudioContext,
  tracks: Track[],
  clips: AudioClip[],
  audioFiles: AudioFile[],
  inputFor: (track: Track) => AudioNode | null,
  from: number,
  at: number,
  until = Infinity
): Scheduled {
  const scheduled: Scheduled = { sources: [], chains: [] };

  for (const track of tracks) {
    const destination = inputFor(track);
    if (!destination) continue;

    for (const trackClip of track.clips) {
      const clip = clips.find((c) => c.id === trackClip.clipId);
      const audioFile = clip && audioFiles.find((f) => f.id === clip.audioFileId);
      if (!clip || !audioFile) continue;

      const range = getEffectiveRange(trackClip, clip);
      for (let i = 0; i < getRepeatCount(trackClip); i++) {
        schedulePass(
          ctx,
          audioFile.buffer,
          trackClip,
          range,
          trackClip.position + i * range.duration,
          destination,
          from,
          at,
          until,
          scheduled
        );
      }
    }
  }

  return scheduled;
}
