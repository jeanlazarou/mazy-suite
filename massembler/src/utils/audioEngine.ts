import { Track, AudioClip, AudioFile } from '../types';
import { CLIP_EFFECTS, getEffectTailSeconds } from './clipEffects';
import { Scheduled, scheduleArrangement } from './scheduler';
import { isTrackAudible } from './trackAudibility';

/**
 * Fade used whenever playback is cut or replaced mid-sound: long enough to
 * avoid a click, too short to hear as a fade.
 */
const DECLICK_SECONDS = 0.015;

/** Scheduling slightly ahead, so new sources start exactly where intended. */
const LOOKAHEAD_SECONDS = 0.02;

const RING_OUT_SECONDS = Math.max(...CLIP_EFFECTS.map((e) => getEffectTailSeconds(e.id)));

/** One scheduling of the arrangement, with everything needed to end it. */
interface Run {
  bus: GainNode;
  trackGains: Map<string, GainNode>;
  scheduled: Scheduled;
}

const levelOf = (track: Track, tracks: Track[]) =>
  isTrackAudible(track, tracks) ? track.volume : 0;

export class AudioEngine {
  private audioContext: AudioContext;
  private run: Run | null = null;
  /** Context time at which timeline time zero plays. */
  private origin = 0;
  /** Timeline time the current run starts from. */
  private from = 0;

  constructor(audioContext: AudioContext) {
    this.audioContext = audioContext;
  }

  get playing(): boolean {
    return this.run !== null;
  }

  /**
   * Play the arrangement from timeline time `from`. While already playing,
   * the new scheduling crossfades in over the old one instead of cutting.
   */
  play(tracks: Track[], clips: AudioClip[], audioFiles: AudioFile[], from: number) {
    if (this.audioContext.state === 'suspended') void this.audioContext.resume();
    this.start(tracks, clips, audioFiles, from, this.audioContext.currentTime + LOOKAHEAD_SECONDS);
  }

  /** Pick up arrangement edits while playing, from wherever playback has got to. */
  replay(tracks: Track[], clips: AudioClip[], audioFiles: AudioFile[]) {
    if (!this.run) return;
    const shown = this.getCurrentTime();
    const at = this.audioContext.currentTime + LOOKAHEAD_SECONDS;
    this.start(tracks, clips, audioFiles, at - this.origin, at);
    // The playhead carries on from where it is, rather than leaping ahead.
    this.from = shown;
  }

  /** Follow volume, mute and solo changes while playing. */
  setTrackLevels(tracks: Track[]) {
    if (!this.run) return;
    const now = this.audioContext.currentTime;
    for (const track of tracks) {
      this.run.trackGains
        .get(track.id)
        ?.gain.setTargetAtTime(levelOf(track, tracks), now, DECLICK_SECONDS / 3);
    }
  }

  /**
   * Stop playing. With `ringOut`, as at the natural end, reverb tails are
   * left to die away rather than cut.
   */
  stop(ringOut = false) {
    this.release(ringOut, this.audioContext.currentTime);
  }

  getCurrentTime(): number {
    if (!this.run) return 0;
    // Not before the start: during the lookahead the clock has not reached it yet.
    return Math.max(this.from, this.audioContext.currentTime - this.origin);
  }

  private start(
    tracks: Track[],
    clips: AudioClip[],
    audioFiles: AudioFile[],
    from: number,
    at: number
  ) {
    const ctx = this.audioContext;
    this.release(false, at);

    const bus = ctx.createGain();
    bus.gain.setValueAtTime(0, at);
    bus.gain.setTargetAtTime(1, at, DECLICK_SECONDS / 3);
    bus.connect(ctx.destination);

    // Every track gets a gain, muted or silenced ones at zero, so turning one
    // back on mid-playback is heard at once.
    const trackGains = new Map<string, GainNode>();
    for (const track of tracks) {
      const gain = ctx.createGain();
      gain.gain.value = levelOf(track, tracks);
      gain.connect(bus);
      trackGains.set(track.id, gain);
    }

    const scheduled = scheduleArrangement(
      ctx,
      tracks,
      clips,
      audioFiles,
      (track) => trackGains.get(track.id) ?? null,
      from,
      at
    );

    this.run = { bus, trackGains, scheduled };
    this.origin = at - from;
    this.from = from;
  }

  /** End the current run: faded out from `when`, or left to ring out. */
  private release(ringOut: boolean, when: number) {
    const run = this.run;
    if (!run) return;
    this.run = null;

    let lingerSeconds = RING_OUT_SECONDS;
    if (!ringOut) {
      run.bus.gain.setTargetAtTime(0, when, DECLICK_SECONDS / 3);
      const end = when + DECLICK_SECONDS * 2;
      for (const source of run.scheduled.sources) {
        try {
          source.stop(end);
        } catch {
          // already stopped
        }
      }
      lingerSeconds = end - this.audioContext.currentTime;
    }

    setTimeout(() => {
      run.bus.disconnect();
      // Effect chains own generators (the LFOs) that outlive their sources.
      run.scheduled.chains.forEach((chain) => chain.dispose());
    }, lingerSeconds * 1000 + 100);
  }
}

export function generateWaveformData(
  buffer: AudioBuffer,
  samples: number = 500,
  viewStartTime?: number,
  viewEndTime?: number
): number[] {
  const rawData = buffer.getChannelData(0);
  const sampleRate = buffer.sampleRate;
  
  // If view times are provided, only process that portion
  const startTime = viewStartTime ?? 0;
  const endTime = viewEndTime ?? buffer.duration;
  
  const startSample = Math.floor(startTime * sampleRate);
  const endSample = Math.floor(endTime * sampleRate);
  const totalSamples = endSample - startSample;
  
  const blockSize = Math.floor(totalSamples / samples);
  const waveformData: number[] = [];

  for (let i = 0; i < samples; i++) {
    const start = startSample + (blockSize * i);
    const end = Math.min(start + blockSize, endSample);
    let sum = 0;
    let count = 0;
    
    for (let j = start; j < end; j++) {
      if (j < rawData.length) {
        sum += Math.abs(rawData[j]);
        count++;
      }
    }
    
    waveformData.push(count > 0 ? sum / count : 0);
  }

  return waveformData;
}
