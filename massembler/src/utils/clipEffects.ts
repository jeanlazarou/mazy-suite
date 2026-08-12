import { ClipEffectId } from '../types';

/**
 * Preset clip effects.
 *
 * Every effect here is intentionally parameterless - picking it is the whole
 * interaction. The chains are built from the same code for realtime playback
 * (AudioContext) and for offline export (OfflineAudioContext), so what you
 * hear is what gets rendered.
 */

export interface ClipEffectInfo {
  id: ClipEffectId;
  label: string;
  description: string;
}

export const CLIP_EFFECTS: ClipEffectInfo[] = [
  { id: 'none', label: 'None', description: 'Play the clip untouched' },
  { id: 'reverse', label: 'Reverse', description: 'Play the clip backwards' },
  { id: 'underwater', label: 'Underwater', description: 'Muffled and slowly wobbling, as if submerged' },
  { id: 'telephone', label: 'Telephone', description: 'Thin, bandlimited and slightly crunchy' },
  { id: 'cathedral', label: 'Cathedral', description: 'Long reverberant tail, as in a big stone room' },
  { id: 'distant', label: 'Distant', description: 'Dulled and set back, as if heard through a wall' },
  { id: 'tremolo', label: 'Tremolo', description: 'Level pulsing at a steady rate' },
  { id: 'lofi', label: 'Lo-fi', description: 'Coarsely quantised and dulled, like cheap digital audio' },
  { id: 'deep', label: 'Deep', description: 'Slowed down and pitched below the original' },
];

export function getEffectInfo(effect: ClipEffectId | undefined): ClipEffectInfo {
  return CLIP_EFFECTS.find((e) => e.id === effect) ?? CLIP_EFFECTS[0];
}

/* -------------------------------------------------------------------------- */
/* Reverse                                                                     */
/* -------------------------------------------------------------------------- */

// Reversing is done on the buffer rather than in the node graph, so the result
// is cached per source buffer - otherwise every repeat would redo the copy.
const reversedBuffers = new WeakMap<AudioBuffer, AudioBuffer>();

function getReversedBuffer(ctx: BaseAudioContext, buffer: AudioBuffer): AudioBuffer {
  const cached = reversedBuffers.get(buffer);
  if (cached) return cached;

  const reversed = ctx.createBuffer(
    buffer.numberOfChannels,
    buffer.length,
    buffer.sampleRate
  );

  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const source = buffer.getChannelData(channel);
    const target = reversed.getChannelData(channel);
    const last = source.length - 1;
    for (let i = 0; i <= last; i++) {
      target[i] = source[last - i];
    }
  }

  reversedBuffers.set(buffer, reversed);
  return reversed;
}

/**
 * The buffer a clip should actually play. Only 'reverse' swaps it.
 */
export function resolveClipBuffer(
  ctx: BaseAudioContext,
  buffer: AudioBuffer,
  effect: ClipEffectId | undefined
): AudioBuffer {
  return effect === 'reverse' ? getReversedBuffer(ctx, buffer) : buffer;
}

/**
 * Where to start reading in that buffer.
 *
 * The whole buffer is reversed, so the region [start, end] of the original
 * lives at [duration - end, duration - start] in the reversed copy. Reading
 * from `duration - end` for the same length therefore plays exactly the
 * selected region, backwards.
 */
export function resolveClipOffset(
  buffer: AudioBuffer,
  effect: ClipEffectId | undefined,
  effectiveStartTime: number,
  effectiveEndTime: number
): number {
  if (effect !== 'reverse') return effectiveStartTime;
  return Math.max(0, buffer.duration - effectiveEndTime);
}

/* -------------------------------------------------------------------------- */
/* Playback rate                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Rate multiplier for pitch presets. 1 means "play at the recorded speed".
 *
 * The clip keeps the slot it occupies on the timeline: callers scale the
 * length of buffer they read by this factor, so the rendered result still
 * lasts exactly the clip's duration. A pitched-up preset would therefore
 * need to read past the trimmed region - which is why only the downward
 * direction is offered here.
 */
export function resolveClipPlaybackRate(effect: ClipEffectId | undefined): number {
  return effect === 'deep' ? 0.75 : 1;
}

/**
 * Seconds of decay an effect adds after its source stops. Export uses this to
 * size the render, otherwise reverb tails on the last clip get truncated.
 */
export function getEffectTailSeconds(effect: ClipEffectId | undefined): number {
  switch (effect) {
    case 'cathedral':
      return 3;
    case 'distant':
      return 1.4;
    default:
      return 0;
  }
}

/* -------------------------------------------------------------------------- */
/* Node chains                                                                 */
/* -------------------------------------------------------------------------- */

export interface EffectChain {
  /** Connect the buffer source to this. */
  input: AudioNode;
  /** Connect this to the clip's fade gain. */
  output: AudioNode;
  /** Stops any generators the chain owns. Realtime playback only. */
  dispose: () => void;
}

function createImpulseResponse(
  ctx: BaseAudioContext,
  duration: number,
  decay: number
): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(rate * duration));
  const impulse = ctx.createBuffer(2, length, rate);

  for (let channel = 0; channel < 2; channel++) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      // White noise with an exponential decay envelope - a cheap but
      // convincing room tail.
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }

  return impulse;
}

function createQuantizeCurve(levels: number) {
  const samples = 1024;
  const curve = new Float32Array(
    new ArrayBuffer(samples * Float32Array.BYTES_PER_ELEMENT)
  );
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    // Staircase transfer function: the amplitude equivalent of dropping bits.
    curve[i] = Math.round(x * levels) / levels;
  }
  return curve;
}

function createDriveCurve(amount: number) {
  const samples = 1024;
  // Backed by an explicit ArrayBuffer: WaveShaper.curve rejects a possibly
  // shared buffer, which is what `new Float32Array(n)` widens to.
  const curve = new Float32Array(
    new ArrayBuffer(samples * Float32Array.BYTES_PER_ELEMENT)
  );
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    // Unity slope at zero, compressing towards the rails. Without the
    // normalisation this shape has a gain of (1 + amount) on quiet signals,
    // which would amplify whatever the filters just removed.
    curve[i] = x / (1 + amount * Math.abs(x));
  }
  return curve;
}

/**
 * Build the node chain for an effect, or null when the clip plays dry.
 *
 * 'reverse' returns null on purpose - it is handled at the buffer level.
 */
export function createEffectChain(
  ctx: BaseAudioContext,
  effect: ClipEffectId | undefined
): EffectChain | null {
  switch (effect) {
    case 'underwater': {
      const lowpass = ctx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = 480;
      // Enough resonance to colour the wobble, not enough to spike the level
      lowpass.Q.value = 2;

      // Slow drift on the cutoff is what sells "submerged" rather than
      // just "muffled".
      const wobble = ctx.createOscillator();
      wobble.frequency.value = 0.35;
      const wobbleDepth = ctx.createGain();
      wobbleDepth.gain.value = 180;
      wobble.connect(wobbleDepth);
      wobbleDepth.connect(lowpass.frequency);
      wobble.start(0);

      // Just under unity: the resonant peak already adds level around the
      // cutoff, and anything above 1.0 clips once the mix is written to WAV.
      const makeup = ctx.createGain();
      makeup.gain.value = 0.8;
      lowpass.connect(makeup);

      return {
        input: lowpass,
        output: makeup,
        dispose: () => {
          try {
            wobble.stop();
          } catch {
            // already stopped
          }
          wobble.disconnect();
          wobbleDepth.disconnect();
        },
      };
    }

    case 'telephone': {
      const highpass = ctx.createBiquadFilter();
      highpass.type = 'highpass';
      highpass.frequency.value = 700;

      const lowpass = ctx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = 2800;

      const drive = ctx.createWaveShaper();
      drive.curve = createDriveCurve(2);

      const makeup = ctx.createGain();
      makeup.gain.value = 1.8;

      highpass.connect(lowpass);
      lowpass.connect(drive);
      drive.connect(makeup);

      return { input: highpass, output: makeup, dispose: () => {} };
    }

    case 'cathedral': {
      const input = ctx.createGain();
      const output = ctx.createGain();

      const convolver = ctx.createConvolver();
      convolver.buffer = createImpulseResponse(ctx, 2.8, 2.2);

      const dry = ctx.createGain();
      dry.gain.value = 0.7;
      const wet = ctx.createGain();
      wet.gain.value = 0.9;

      input.connect(dry);
      dry.connect(output);
      input.connect(convolver);
      convolver.connect(wet);
      wet.connect(output);

      return { input, output, dispose: () => {} };
    }

    case 'distant': {
      const input = ctx.createGain();
      const output = ctx.createGain();
      // Sits behind everything else in the mix - that is most of the illusion.
      output.gain.value = 0.85;

      const muffle = ctx.createBiquadFilter();
      muffle.type = 'lowpass';
      muffle.frequency.value = 900;

      const convolver = ctx.createConvolver();
      convolver.buffer = createImpulseResponse(ctx, 1.2, 3);

      const dry = ctx.createGain();
      dry.gain.value = 0.6;
      const wet = ctx.createGain();
      wet.gain.value = 0.4;

      input.connect(muffle);
      muffle.connect(dry);
      dry.connect(output);
      muffle.connect(convolver);
      convolver.connect(wet);
      wet.connect(output);

      return { input, output, dispose: () => {} };
    }

    case 'tremolo': {
      const chop = ctx.createGain();
      // Centre + depth are chosen so the gain swings across 0.1 .. 1.0: a deep
      // pulse whose loudest point is still unity, so nothing clips.
      chop.gain.value = 0.55;

      const lfo = ctx.createOscillator();
      lfo.frequency.value = 6.5;
      const depth = ctx.createGain();
      depth.gain.value = 0.45;
      lfo.connect(depth);
      depth.connect(chop.gain);
      lfo.start(0);

      const makeup = ctx.createGain();
      makeup.gain.value = 1;
      chop.connect(makeup);

      return {
        input: chop,
        output: makeup,
        dispose: () => {
          try {
            lfo.stop();
          } catch {
            // already stopped
          }
          lfo.disconnect();
          depth.disconnect();
        },
      };
    }

    case 'lofi': {
      const crush = ctx.createWaveShaper();
      crush.curve = createQuantizeCurve(12);

      // Quantisation throws off a lot of harsh harmonics; tame the top.
      const dull = ctx.createBiquadFilter();
      dull.type = 'lowpass';
      dull.frequency.value = 3500;

      const makeup = ctx.createGain();
      makeup.gain.value = 0.9;

      crush.connect(dull);
      dull.connect(makeup);

      return { input: crush, output: makeup, dispose: () => {} };
    }

    default:
      return null;
  }
}
