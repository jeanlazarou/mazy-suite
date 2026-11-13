import { AudioClip, AudioFile, Track, TrackClip } from '../types';
import {
  EffectChain,
  createEffectChain,
  resolveClipBuffer,
  resolveClipOffset,
  resolveClipPlaybackRate,
} from './clipEffects';
import { getEffectiveRange, getRepeatCount } from './clipTiming';
import { crossfadeReach } from './crossfades';

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

/**
 * How one pass rises and falls, in seconds of pass time: 0 is where the clip
 * starts, `length` where it ends. A crossfade reaches `crossIn` before the
 * start and `crossOut` past the end, curving with equal power - and takes the
 * place of the plain linear fade on its side.
 */
export interface PassShape {
  length: number;
  fadeIn: number;
  fadeOut: number;
  crossIn: number;
  crossOut: number;
}

/** Points a crossfade's curve is drawn through; linear in between. */
const CURVE_STEPS = 8;

/** Equal power: two such curves crossing keep the level steady. */
const equalPower = (x: number) => Math.sin((Math.max(0, Math.min(1, x)) * Math.PI) / 2);

/** A pass's gain at pass time `time`. */
export function passGainAt(shape: PassShape, time: number): number {
  const { length, fadeIn, fadeOut, crossIn, crossOut } = shape;
  const rising =
    crossIn > 0
      ? equalPower((time + crossIn) / (2 * crossIn))
      : fadeIn > 0
        ? time / fadeIn
        : 1;
  const falling =
    crossOut > 0
      ? equalPower((length + crossOut - time) / (2 * crossOut))
      : fadeOut > 0
        ? (length - time) / fadeOut
        : 1;
  return Math.max(0, Math.min(1, rising, falling));
}

/**
 * A pass's envelope as breakpoints over [-crossIn, length + crossOut], linear
 * in between. Overlapping linear fades meet in a peak below 1 instead of the
 * fade-out jumping in mid-ramp.
 */
export function passEnvelope(shape: PassShape): Array<{ time: number; gain: number }> {
  const { length, fadeIn, fadeOut, crossIn, crossOut } = shape;
  const first = -crossIn;
  const last = length + crossOut;
  const times = [first, last];

  const curve = (from: number, span: number) => {
    for (let step = 0; step <= CURVE_STEPS; step++) times.push(from + (span * step) / CURVE_STEPS);
  };
  if (crossIn > 0) curve(-crossIn, 2 * crossIn);
  else times.push(fadeIn);
  if (crossOut > 0) curve(length - crossOut, 2 * crossOut);
  else times.push(length - fadeOut);
  if (!crossIn && !crossOut && fadeIn > 0 && fadeOut > 0) {
    times.push((length * fadeIn) / (fadeIn + fadeOut));
  }

  return [...new Set(times.filter((t) => t >= first && t <= last))]
    .sort((a, b) => a - b)
    .map((time) => ({ time, gain: passGainAt(shape, time) }));
}

/** A pass's linear fade gain at `time` seconds into it. */
export function fadeGainAt(length: number, fadeIn: number, fadeOut: number, time: number): number {
  return passGainAt({ length, fadeIn, fadeOut, crossIn: 0, crossOut: 0 }, time);
}

/** The linear fade envelope of a pass, as breakpoints over [0, length]. */
export function fadeEnvelope(
  length: number,
  fadeIn: number,
  fadeOut: number
): Array<{ time: number; gain: number }> {
  return passEnvelope({ length, fadeIn, fadeOut, crossIn: 0, crossOut: 0 });
}

function schedulePass(
  ctx: BaseAudioContext,
  buffer: AudioBuffer,
  trackClip: TrackClip,
  range: { start: number; end: number; duration: number },
  passStart: number,
  reach: { before: number; after: number },
  destination: AudioNode,
  from: number,
  at: number,
  until: number,
  scheduled: Scheduled
) {
  const length = range.duration;
  // A crossfade lets a pass sound a little before its start, or past its end.
  const begins = passStart - reach.before;
  const ends = passStart + length + reach.after;
  if (ends <= from || begins >= until) return;

  // Where in the pass playback picks it up (pass time, so negative while a
  // crossfade reaches back), when that sounds, and how long it then sounds
  // before the pass - or `until` - ends it.
  const startsAt = Math.max(begins, from);
  const skip = startsAt - passStart;
  const when = at + (startsAt - from);
  const playing = Math.min(ends, until) - startsAt;

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

  // The clip's own volume scales its envelope.
  const level = trackClip.gain ?? 1;
  const shape: PassShape = {
    length,
    fadeIn: trackClip.fadeIn ?? 0,
    fadeOut: trackClip.fadeOut ?? 0,
    crossIn: reach.before,
    crossOut: reach.after,
  };
  if (shape.fadeIn > 0 || shape.fadeOut > 0 || shape.crossIn > 0 || shape.crossOut > 0) {
    fade.gain.setValueAtTime(level * passGainAt(shape, skip), when);
    for (const point of passEnvelope(shape)) {
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
    const reach = crossfadeReach(track, clips, audioFiles);

    for (const trackClip of track.clips) {
      const clip = clips.find((c) => c.id === trackClip.clipId);
      const audioFile = clip && audioFiles.find((f) => f.id === clip.audioFileId);
      if (!clip || !audioFile) continue;

      const range = getEffectiveRange(trackClip, clip);
      const repeats = getRepeatCount(trackClip);
      const crossfading = reach.get(trackClip.id);
      for (let i = 0; i < repeats; i++) {
        // A crossfade belongs to the first pass at the start, the last at the end.
        const passReach = {
          before: i === 0 ? (crossfading?.before ?? 0) : 0,
          after: i === repeats - 1 ? (crossfading?.after ?? 0) : 0,
        };
        schedulePass(
          ctx,
          audioFile.buffer,
          trackClip,
          range,
          trackClip.position + i * range.duration,
          passReach,
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
