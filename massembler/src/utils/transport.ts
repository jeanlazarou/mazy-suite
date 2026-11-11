import { useStore } from '../store';
import { AudioClip, AudioFile, Track } from '../types';
import { AudioEngine } from './audioEngine';
import { getProjectDuration } from './clipTiming';

/**
 * Play, pause, stop and seek, for whatever drives them: the transport
 * buttons, the seek bar, the ruler, the space bar. Owns the audio engine and
 * the animation loop that moves the playhead.
 */

/**
 * Arrangement edits made while playing are picked up once they pause for
 * this long, so a drag is not rescheduled on every mouse move.
 */
const RESCHEDULE_DELAY_MS = 120;

let engine: AudioEngine | null = null;
let frame: number | null = null;
let rescheduleTimer: ReturnType<typeof setTimeout> | undefined;

function getEngine(): AudioEngine {
  if (!engine) {
    const store = useStore.getState();
    let ctx = store.audioContext;
    if (!ctx) {
      ctx = new AudioContext();
      store.setAudioContext(ctx);
    }
    engine = new AudioEngine(ctx);
  }
  return engine;
}

function tick() {
  if (!engine) return;
  const { playbackState, setPlaybackState } = useStore.getState();

  // Stopped from elsewhere - a project was loaded over this one.
  if (!playbackState.isPlaying) {
    engine.stop();
    frame = null;
    return;
  }

  const currentTime = engine.getCurrentTime();
  if (currentTime < playbackState.duration) {
    setPlaybackState({ currentTime });
    frame = requestAnimationFrame(tick);
  } else {
    end(true, true);
  }
}

function end(rewind: boolean, ringOut = false) {
  engine?.stop(ringOut);
  if (frame !== null) cancelAnimationFrame(frame);
  frame = null;
  clearTimeout(rescheduleTimer);
  useStore
    .getState()
    .setPlaybackState(rewind ? { isPlaying: false, currentTime: 0 } : { isPlaying: false });
}

export function play() {
  const { tracks, clips, audioFiles, playbackState, setPlaybackState } = useStore.getState();
  if (playbackState.isPlaying) return;

  const duration = getProjectDuration(tracks, clips, 1);
  // From the end there is nothing to hear: start over.
  const from = playbackState.currentTime >= duration ? 0 : playbackState.currentTime;

  getEngine().play(tracks, clips, audioFiles, from);
  setPlaybackState({ isPlaying: true, duration, currentTime: from });
  frame = requestAnimationFrame(tick);
}

export const pause = () => end(false);
export const stop = () => end(true);

export function togglePlay() {
  if (useStore.getState().playbackState.isPlaying) pause();
  else play();
}

/** Move the playhead; while playing, playback carries on from there. */
export function seek(time: number) {
  const { tracks, clips, audioFiles, playbackState, setPlaybackState } = useStore.getState();
  const to = Math.max(0, time);
  setPlaybackState({ currentTime: to });
  if (playbackState.isPlaying && engine?.playing) {
    engine.play(tracks, clips, audioFiles, to);
  }
}

interface Arrangement {
  tracks: Track[];
  clips: AudioClip[];
  audioFiles: AudioFile[];
}

/** Whether only track settings (volume, mute, solo, name) differ. */
function sameArrangement(a: Arrangement, b: Arrangement): boolean {
  return (
    a.clips === b.clips &&
    a.audioFiles === b.audioFiles &&
    a.tracks.length === b.tracks.length &&
    a.tracks.every((track, i) => track.id === b.tracks[i].id && track.clips === b.tracks[i].clips)
  );
}

// While playing, edits are heard: track settings at once, the arrangement
// after a short pause.
useStore.subscribe((state, previous) => {
  if (!engine?.playing || !state.playbackState.isPlaying) return;
  if (
    state.tracks === previous.tracks &&
    state.clips === previous.clips &&
    state.audioFiles === previous.audioFiles
  ) {
    return;
  }

  engine.setTrackLevels(state.tracks);
  if (sameArrangement(state, previous)) return;

  clearTimeout(rescheduleTimer);
  rescheduleTimer = setTimeout(() => {
    if (!engine?.playing) return;
    const { tracks, clips, audioFiles, setPlaybackState } = useStore.getState();
    engine.replay(tracks, clips, audioFiles);
    setPlaybackState({ duration: getProjectDuration(tracks, clips, 1) });
  }, RESCHEDULE_DELAY_MS);
});
