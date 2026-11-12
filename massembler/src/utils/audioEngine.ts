import { Track, AudioClip, AudioFile, LoopRegion } from '../types';
import { CLIP_EFFECTS, getEffectTailSeconds } from './clipEffects';
import { activeLoop, timelinePosition } from './loop';
import { Scheduled, scheduleArrangement } from './scheduler';
import { isTrackAudible } from './trackAudibility';

/**
 * Fade used whenever playback is cut or replaced mid-sound: long enough to
 * avoid a click, too short to hear as a fade.
 */
const DECLICK_SECONDS = 0.015;

/** Scheduling slightly ahead, so new sources start exactly where intended. */
const LOOKAHEAD_SECONDS = 0.02;

/**
 * A loop is scheduled one pass at a time, each this far ahead of the clock:
 * enough to ride out a busy main thread or a throttled background tab.
 */
const LOOP_AHEAD_SECONDS = 1.5;

/** The fade at each join of a loop, so the cut back to its start does not click. */
const LOOP_JOIN_SECONDS = 0.005;

const RING_OUT_SECONDS = Math.max(...CLIP_EFFECTS.map((e) => getEffectTailSeconds(e.id)));

interface TrackNodes {
  gain: GainNode;
  panner: StereoPannerNode;
}

interface Arrangement {
  tracks: Track[];
  clips: AudioClip[];
  audioFiles: AudioFile[];
}

/** What one pass over the timeline scheduled; a loop adds one per time round. */
interface Pass extends Scheduled {
  /** The per-track join fades of a loop pass. */
  joins: GainNode[];
}

/** One scheduling of the arrangement, with everything needed to end it. */
interface Run {
  bus: GainNode;
  trackNodes: Map<string, TrackNodes>;
  passes: Pass[];
  arrangement: Arrangement;
  /** Context time at which playback reaches timeline time `from`. */
  at: number;
  from: number;
  loop: LoopRegion | null;
  /** The playhead before `at`, while the lookahead runs out. */
  before: (time: number) => number;
  timer: ReturnType<typeof setTimeout> | null;
}

const levelOf = (track: Track, tracks: Track[]) =>
  isTrackAudible(track, tracks) ? track.volume : 0;

export class AudioEngine {
  private audioContext: AudioContext;
  private run: Run | null = null;
  /** Every run plays through this: the master volume, then the meters. */
  private master: GainNode;
  private meters: AnalyserNode[];
  private meterData = new Float32Array(1024);

  constructor(audioContext: AudioContext, masterVolume = 1) {
    this.audioContext = audioContext;
    const ctx = audioContext;

    this.master = ctx.createGain();
    this.master.gain.value = masterVolume;
    this.master.connect(ctx.destination);

    const splitter = ctx.createChannelSplitter(2);
    this.master.connect(splitter);
    this.meters = [0, 1].map((channel) => {
      const meter = ctx.createAnalyser();
      meter.fftSize = this.meterData.length;
      splitter.connect(meter, channel);
      return meter;
    });
  }

  get playing(): boolean {
    return this.run !== null;
  }

  /** Whether playback is going round a loop, and so never reaches the end. */
  get looping(): boolean {
    return this.run?.loop != null;
  }

  /**
   * Play the arrangement from timeline time `from`, round `loop` when given
   * and `from` is before its end. While already playing, the new scheduling
   * crossfades in over the old one instead of cutting.
   */
  play(
    tracks: Track[],
    clips: AudioClip[],
    audioFiles: AudioFile[],
    from: number,
    loop: LoopRegion | null = null
  ) {
    if (this.audioContext.state === 'suspended') void this.audioContext.resume();
    const at = this.audioContext.currentTime + LOOKAHEAD_SECONDS;
    this.start({ tracks, clips, audioFiles }, from, at, loop, () => from);
  }

  /** Pick up edits while playing - to the arrangement or the loop - from wherever playback has got to. */
  replay(tracks: Track[], clips: AudioClip[], audioFiles: AudioFile[], loop: LoopRegion | null = null) {
    const run = this.run;
    if (!run) return;
    const now = this.audioContext.currentTime;
    const at = now + LOOKAHEAD_SECONDS;

    // Until the new run takes over, the playhead carries on from where it
    // is: continuous, and without keeping the old run around.
    const shown = this.positionIn(run, now);
    this.start({ tracks, clips, audioFiles }, this.positionIn(run, at), at, loop, (time) =>
      shown + Math.max(0, time - now)
    );
  }

  /** Follow volume, pan, mute and solo changes while playing. */
  setTrackLevels(tracks: Track[]) {
    if (!this.run) return;
    const now = this.audioContext.currentTime;
    for (const track of tracks) {
      const nodes = this.run.trackNodes.get(track.id);
      if (!nodes) continue;
      nodes.gain.gain.setTargetAtTime(levelOf(track, tracks), now, DECLICK_SECONDS / 3);
      nodes.panner.pan.setTargetAtTime(track.pan ?? 0, now, DECLICK_SECONDS / 3);
    }
  }

  setMasterVolume(volume: number) {
    this.master.gain.setTargetAtTime(volume, this.audioContext.currentTime, DECLICK_SECONDS / 3);
  }

  /** The loudest sample on each channel just now, after the master volume. */
  readLevels(): [number, number] {
    const [left, right] = this.meters.map((meter) => {
      meter.getFloatTimeDomainData(this.meterData);
      let peak = 0;
      for (const sample of this.meterData) {
        const level = Math.abs(sample);
        if (level > peak) peak = level;
      }
      return peak;
    });
    return [left, right];
  }

  /**
   * Stop playing. With `ringOut`, as at the natural end, reverb tails are
   * left to die away rather than cut.
   */
  stop(ringOut = false) {
    this.release(ringOut, this.audioContext.currentTime);
  }

  getCurrentTime(): number {
    return this.run ? this.positionIn(this.run, this.audioContext.currentTime) : 0;
  }

  private positionIn(run: Run, time: number): number {
    return time < run.at ? run.before(time) : timelinePosition(run.from, time - run.at, run.loop);
  }

  private start(
    arrangement: Arrangement,
    from: number,
    at: number,
    loop: LoopRegion | null,
    before: (time: number) => number
  ) {
    const ctx = this.audioContext;
    this.release(false, at);

    const bus = ctx.createGain();
    bus.gain.setValueAtTime(0, at);
    bus.gain.setTargetAtTime(1, at, DECLICK_SECONDS / 3);
    bus.connect(this.master);

    // Every track gets a gain, muted or silenced ones at zero, so turning one
    // back on mid-playback is heard at once; then its pan.
    const { tracks } = arrangement;
    const trackNodes = new Map<string, TrackNodes>();
    for (const track of tracks) {
      const gain = ctx.createGain();
      gain.gain.value = levelOf(track, tracks);
      const panner = ctx.createStereoPanner();
      panner.pan.value = track.pan ?? 0;
      gain.connect(panner);
      panner.connect(bus);
      trackNodes.set(track.id, { gain, panner });
    }

    const run: Run = {
      bus,
      trackNodes,
      passes: [],
      arrangement,
      at,
      from,
      loop: activeLoop(loop, from),
      before,
      timer: null,
    };
    this.run = run;

    this.schedulePass(run, from, at);
    if (run.loop) this.planNextPass(run, at + (run.loop.end - from));
  }

  /** Schedule timeline time `from` onwards at context time `at` - up to the loop's end, when looping. */
  private schedulePass(run: Run, from: number, at: number) {
    const ctx = this.audioContext;
    const { tracks, clips, audioFiles } = run.arrangement;
    const joins = new Map<string, GainNode>();
    const loop = run.loop;

    const inputFor = (track: Track): AudioNode | null => {
      const nodes = run.trackNodes.get(track.id);
      if (!nodes) return null;
      if (!loop) return nodes.gain;

      // Each pass of a loop fades in and out over a few milliseconds, so the
      // join back to its start does not click.
      let join = joins.get(track.id);
      if (!join) {
        const end = at + (loop.end - from);
        join = ctx.createGain();
        join.gain.setValueAtTime(0, at);
        join.gain.linearRampToValueAtTime(1, at + LOOP_JOIN_SECONDS);
        join.gain.setValueAtTime(1, end - LOOP_JOIN_SECONDS);
        join.gain.linearRampToValueAtTime(0, end);
        join.connect(nodes.gain);
        joins.set(track.id, join);
      }
      return join;
    };

    const scheduled = scheduleArrangement(
      ctx, tracks, clips, audioFiles, inputFor, from, at, loop?.end ?? Infinity
    );
    run.passes.push({ ...scheduled, joins: [...joins.values()] });
  }

  /** Schedule the loop's next time round shortly before it is due, and the one after that. */
  private planNextPass(run: Run, nextAt: number) {
    const delay = Math.max(0, (nextAt - LOOP_AHEAD_SECONDS - this.audioContext.currentTime) * 1000);
    run.timer = setTimeout(() => {
      if (this.run !== run || !run.loop) return;
      this.schedulePass(run, run.loop.start, nextAt);

      // Passes long finished have nothing left to stop.
      while (run.passes.length > 3) disposePass(run.passes.shift() as Pass);

      this.planNextPass(run, nextAt + (run.loop.end - run.loop.start));
    }, delay);
  }

  /** End the current run: faded out from `when`, or left to ring out. */
  private release(ringOut: boolean, when: number) {
    const run = this.run;
    if (!run) return;
    this.run = null;
    if (run.timer !== null) clearTimeout(run.timer);

    let lingerSeconds = RING_OUT_SECONDS;
    if (!ringOut) {
      run.bus.gain.setTargetAtTime(0, when, DECLICK_SECONDS / 3);
      const end = when + DECLICK_SECONDS * 2;
      for (const pass of run.passes) {
        for (const source of pass.sources) {
          try {
            source.stop(end);
          } catch {
            // already stopped
          }
        }
      }
      lingerSeconds = end - this.audioContext.currentTime;
    }

    setTimeout(() => {
      run.bus.disconnect();
      run.passes.forEach(disposePass);
    }, lingerSeconds * 1000 + 100);
  }
}

function disposePass(pass: Pass) {
  // Effect chains own generators (the LFOs) that outlive their sources.
  pass.chains.forEach((chain) => chain.dispose());
  pass.joins.forEach((join) => join.disconnect());
}
