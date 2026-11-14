import { useCallback, useEffect } from 'react';
import { getAudioContext, resumeAudioContext, getAnalyserNode, getPlaybackInputNode, setPlaybackGainDB } from '../audio/context';
import { useStore } from '../store/store';
import { stopTransition } from '../audio/transition';

// Playback source state is module-level: there is exactly one playing
// source at a time no matter how many components use this hook, and
// components that unmount (e.g. the transport when the Chain X-Ray view
// takes over) must not orphan a playing source.
const playback = {
  source: null as AudioBufferSourceNode | null,
  startTime: 0,
  offset: 0,
  // The loop the playing source was started with.
  loop: null as { start: number; end: number } | null,
};

// Where the playing source is in the track: time since it started,
// folded back into the loop once it has passed the loop's end.
function currentPosition(): number {
  const raw = getAudioContext().currentTime - playback.startTime;
  const loop = playback.loop;
  if (loop && raw >= loop.end) return loop.start + ((raw - loop.start) % (loop.end - loop.start));
  return raw;
}

/** Stop any playing source. Safe to call from outside the hook (e.g.
 *  when a view without a transport takes over the screen). */
export function stopPlayback(): void {
  stopTransition();
  if (useStore.getState().transitionPlaying !== null) useStore.getState().setTransitionPlaying(null);
  if (playback.source) {
    try {
      playback.source.onended = null;
      playback.source.stop();
    } catch {
      // Already stopped
    }
    playback.source = null;
  }
  playback.offset = 0;
  useStore.getState().setIsPlaying(false);
  useStore.getState().setPlaybackPosition(0);
}

export function usePlayback() {
  // Individual selectors: a whole-store subscription here would re-render
  // the consumer on every playback-position tick.
  const originalBuffer = useStore((s) => s.originalBuffer);
  const processedBuffer = useStore((s) => s.processedBuffer);
  const listenMode = useStore((s) => s.listenMode);
  const isPlaying = useStore((s) => s.isPlaying);
  const setIsPlaying = useStore((s) => s.setIsPlaying);
  const setPlaybackPosition = useStore((s) => s.setPlaybackPosition);
  const seekRequest = useStore((s) => s.seekRequest);
  const clearSeekRequest = useStore((s) => s.clearSeekRequest);
  const loudnessMatch = useStore((s) => s.loudnessMatch);
  const matchGainDB = useStore((s) => s.matchGainDB);
  const loopRegion = useStore((s) => s.loopRegion);

  // Select the active buffer: processed if available and selected, otherwise original
  const getBuffer = useCallback((): AudioBuffer | null => {
    if (listenMode === 'processed' && processedBuffer) {
      return processedBuffer;
    }
    return originalBuffer;
  }, [listenMode, originalBuffer, processedBuffer]);

  const stopSource = useCallback(() => {
    if (playback.source) {
      try {
        playback.source.onended = null;
        playback.source.stop();
      } catch {
        // Already stopped
      }
      playback.source = null;
    }
  }, []);

  // Start a source at a position; with a loop region set it repeats that
  // part (the source loops natively, so the repeat is seamless), starting
  // from the region's beginning when the position is outside it.
  const startSource = useCallback((buffer: AudioBuffer, at: number) => {
    const ctx = getAudioContext();
    const region = useStore.getState().loopRegion;
    const loop = region && region.start < buffer.duration
      ? { start: region.start, end: Math.min(region.end, buffer.duration) } : null;
    let offset = Math.min(at, buffer.duration);
    if (loop && (offset < loop.start || offset >= loop.end)) offset = loop.start;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    if (loop) {
      source.loop = true;
      source.loopStart = loop.start;
      source.loopEnd = loop.end;
    }
    source.connect(getPlaybackInputNode());
    source.onended = () => {
      playback.source = null;
      setIsPlaying(false);
      setPlaybackPosition(0);
      playback.offset = 0;
    };
    source.start(0, offset);
    playback.startTime = ctx.currentTime - offset;
    playback.loop = loop;
    playback.source = source;
  }, []);

  const play = useCallback(async () => {
    const buffer = getBuffer();
    if (!buffer) return;

    await resumeAudioContext();

    stopSource();
    // An album transition preview and the transport never play together.
    stopTransition();
    useStore.getState().setTransitionPlaying(null);

    startSource(buffer, playback.offset);
    setIsPlaying(true);
  }, [getBuffer, stopSource]);

  const pause = useCallback(() => {
    if (playback.source) playback.offset = currentPosition();
    stopSource();
    setIsPlaying(false);
  }, [stopSource]);

  const togglePlayback = useCallback(() => {
    if (isPlaying) {
      pause();
    } else {
      play();
    }
  }, [isPlaying, play, pause]);

  const seek = useCallback((position: number) => {
    playback.offset = position;
    setPlaybackPosition(position);
    if (isPlaying) {
      stopSource();
      play();
    }
  }, [isPlaying, stopSource, play]);

  // Update playback position for UI. Throttled to ~10Hz: every store write
  // re-renders the position consumers, and 60Hz updates added no visible
  // smoothness while costing a full render pass per frame.
  useEffect(() => {
    if (!isPlaying) return;
    let raf: number;
    let lastPos = -1;
    const update = () => {
      const pos = currentPosition();
      if (Math.abs(pos - lastPos) > 0.1) {
        lastPos = pos;
        setPlaybackPosition(pos);
      }
      raf = requestAnimationFrame(update);
    };
    raf = requestAnimationFrame(update);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying]);

  // Switch buffer seamlessly when the A/B toggle changes during playback,
  // or when a processed result arrives while already listening in B mode.
  useEffect(() => {
    if (!isPlaying || !playback.source) return;
    const buffer = listenMode === 'processed' && processedBuffer ? processedBuffer : originalBuffer;
    if (!buffer || playback.source.buffer === buffer) return;
    playback.offset = currentPosition();
    stopSource();
    startSource(buffer, playback.offset);
  }, [listenMode, processedBuffer]);

  // A loop region set, moved or removed: playback goes on from where it
  // is when that is inside the region, else from the region's start.
  useEffect(() => {
    if (playback.source && playback.source.buffer) {
      const buffer = playback.source.buffer;
      playback.offset = currentPosition();
      stopSource();
      startSource(buffer, playback.offset);
    } else if (loopRegion && (playback.offset < loopRegion.start || playback.offset >= loopRegion.end)) {
      playback.offset = loopRegion.start;
      setPlaybackPosition(loopRegion.start);
    }
  }, [loopRegion]);

  // Loudness-matched A/B: trim processed playback to the original's
  // integrated loudness so comparisons aren't biased by level.
  useEffect(() => {
    const matching = loudnessMatch && matchGainDB !== null && listenMode === 'processed';
    setPlaybackGainDB(matching ? matchGainDB! : 0);
  }, [loudnessMatch, matchGainDB, listenMode]);

  // Stop playback when the active audio changes (new file or track switch).
  useEffect(() => {
    stopSource();
    setIsPlaying(false);
    playback.offset = 0;
    setPlaybackPosition(0);
  }, [originalBuffer]);

  // Handle seek requests from other components (e.g. Waveform click)
  useEffect(() => {
    if (seekRequest === null) return;
    seek(seekRequest);
    clearSeekRequest();
  }, [seekRequest]);

  return {
    play,
    pause,
    togglePlayback,
    seek,
    analyser: getAnalyserNode(),
  };
}
