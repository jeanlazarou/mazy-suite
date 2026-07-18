import { useCallback, useRef, useEffect } from 'react';
import { getAudioContext, resumeAudioContext, getAnalyserNode, getPlaybackGainNode, setPlaybackGainDB } from '../audio/context';
import { useStore } from '../store/store';

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

  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const startTimeRef = useRef(0);
  const offsetRef = useRef(0);

  // Select the active buffer: processed if available and selected, otherwise original
  const getBuffer = useCallback((): AudioBuffer | null => {
    if (listenMode === 'processed' && processedBuffer) {
      return processedBuffer;
    }
    return originalBuffer;
  }, [listenMode, originalBuffer, processedBuffer]);

  const stopSource = useCallback(() => {
    if (sourceRef.current) {
      try {
        sourceRef.current.onended = null;
        sourceRef.current.stop();
      } catch {
        // Already stopped
      }
      sourceRef.current = null;
    }
  }, []);

  const play = useCallback(async () => {
    const buffer = getBuffer();
    if (!buffer) return;

    await resumeAudioContext();
    const ctx = getAudioContext();

    stopSource();

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(getPlaybackGainNode());

    source.onended = () => {
      sourceRef.current = null;
      setIsPlaying(false);
      setPlaybackPosition(0);
      offsetRef.current = 0;
    };

    const offset = Math.min(offsetRef.current, buffer.duration);
    source.start(0, offset);
    startTimeRef.current = ctx.currentTime - offset;
    sourceRef.current = source;
    setIsPlaying(true);
  }, [getBuffer, stopSource]);

  const pause = useCallback(() => {
    if (sourceRef.current) {
      const ctx = getAudioContext();
      offsetRef.current = ctx.currentTime - startTimeRef.current;
    }
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
    offsetRef.current = position;
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
      const ctx = getAudioContext();
      const pos = ctx.currentTime - startTimeRef.current;
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
    if (!isPlaying || !sourceRef.current) return;
    const buffer = listenMode === 'processed' && processedBuffer ? processedBuffer : originalBuffer;
    if (!buffer || sourceRef.current.buffer === buffer) return;
    const ctx = getAudioContext();
    offsetRef.current = ctx.currentTime - startTimeRef.current;
    stopSource();

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(getPlaybackGainNode());

    source.onended = () => {
      sourceRef.current = null;
      setIsPlaying(false);
      setPlaybackPosition(0);
      offsetRef.current = 0;
    };

    const offset = Math.min(offsetRef.current, buffer.duration);
    source.start(0, offset);
    startTimeRef.current = ctx.currentTime - offset;
    sourceRef.current = source;
  }, [listenMode, processedBuffer]);

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
    offsetRef.current = 0;
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
