import { useEffect, useRef } from 'react';
import { useStore } from '../store';
import { AudioClip, AudioFile, Track } from '../types';
import { AudioEngine } from '../utils/audioEngine';
import { getProjectDuration } from '../utils/clipTiming';

/**
 * Arrangement edits made while playing are picked up once they pause for
 * this long, so a drag is not rescheduled on every mouse move.
 */
const RESCHEDULE_DELAY_MS = 120;

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

export function PlaybackControls() {
  const {
    playbackState,
    setPlaybackState,
    tracks,
    clips,
    audioFiles,
    audioContext,
    setAudioContext,
  } = useStore();

  const audioEngineRef = useRef<AudioEngine | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (audioContext && !audioEngineRef.current) {
      audioEngineRef.current = new AudioEngine(audioContext);
    }
  }, [audioContext]);

  // While playing, edits are heard: track settings at once, the arrangement
  // after a short pause.
  useEffect(() => {
    if (!playbackState.isPlaying) return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = useStore.subscribe((state, previous) => {
      const engine = audioEngineRef.current;
      if (!engine || !state.playbackState.isPlaying) return;
      if (
        state.tracks === previous.tracks &&
        state.clips === previous.clips &&
        state.audioFiles === previous.audioFiles
      ) {
        return;
      }

      engine.setTrackLevels(state.tracks);
      if (sameArrangement(state, previous)) return;

      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!engine.playing) return;
        const { tracks, clips, audioFiles } = useStore.getState();
        engine.replay(tracks, clips, audioFiles);
        setPlaybackState({ duration: getProjectDuration(tracks, clips, 1) });
      }, RESCHEDULE_DELAY_MS);
    });

    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
  }, [playbackState.isPlaying, setPlaybackState]);

  const endPlayback = (rewind: boolean, ringOut = false) => {
    audioEngineRef.current?.stop(ringOut);
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    setPlaybackState(rewind ? { isPlaying: false, currentTime: 0 } : { isPlaying: false });
  };

  const updatePlaybackTime = () => {
    const engine = audioEngineRef.current;
    if (!engine) return;

    // Read live rather than from this callback's closure: the loop
    // re-schedules itself, so it would keep whatever was current when play
    // started.
    const { duration, isPlaying } = useStore.getState().playbackState;

    // Stopped from elsewhere - a project was loaded over this one.
    if (!isPlaying) {
      engine.stop();
      return;
    }

    const currentTime = engine.getCurrentTime();
    if (currentTime < duration) {
      setPlaybackState({ currentTime });
      animationFrameRef.current = requestAnimationFrame(updatePlaybackTime);
    } else {
      endPlayback(true, true);
    }
  };

  const handlePlay = () => {
    // Initialize audio context if it doesn't exist
    let ctx = audioContext;
    if (!ctx) {
      ctx = new AudioContext();
      setAudioContext(ctx);
    }

    if (!audioEngineRef.current) {
      audioEngineRef.current = new AudioEngine(ctx);
    }

    audioEngineRef.current.play(tracks, clips, audioFiles, playbackState.currentTime);

    setPlaybackState({ isPlaying: true, duration: getProjectDuration(tracks, clips, 1) });
    animationFrameRef.current = requestAnimationFrame(updatePlaybackTime);
  };

  const handlePause = () => endPlayback(false);
  const handleStop = () => endPlayback(true);

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setPlaybackState({ currentTime: time });

    // Reschedule in place; the running animation loop follows the engine.
    if (playbackState.isPlaying && audioEngineRef.current) {
      audioEngineRef.current.play(tracks, clips, audioFiles, time);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-gray-800 border-t border-gray-700 p-4">
      <div className="flex items-center gap-4">
        {/* Play/Pause/Stop buttons */}
        <div className="flex gap-2">
          {!playbackState.isPlaying ? (
            <button
              onClick={handlePlay}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded font-semibold"
            >
              ▶ Play
            </button>
          ) : (
            <button
              onClick={handlePause}
              className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 rounded font-semibold"
            >
              ⏸ Pause
            </button>
          )}
          <button
            onClick={handleStop}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded font-semibold"
          >
            ⏹ Stop
          </button>
        </div>

        {/* Time display */}
        <div className="text-sm">
          {formatTime(playbackState.currentTime)} / {formatTime(playbackState.duration)}
        </div>

        {/* Seek bar */}
        <div className="flex-1 flex items-center gap-2">
          <input
            type="range"
            min="0"
            max={playbackState.duration || 1}
            step="0.1"
            value={playbackState.currentTime}
            onChange={handleSeek}
            className="flex-1"
          />
        </div>
      </div>
    </div>
  );
}
