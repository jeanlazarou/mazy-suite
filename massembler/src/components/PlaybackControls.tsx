import { useEffect, useRef } from 'react';
import { useStore } from '../store';
import { AudioEngine } from '../utils/audioEngine';

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

  const updatePlaybackTime = () => {
    if (audioEngineRef.current) {
      const currentTime = audioEngineRef.current.getCurrentTime();
      setPlaybackState({ currentTime });

      if (currentTime < playbackState.duration) {
        animationFrameRef.current = requestAnimationFrame(updatePlaybackTime);
      } else {
        handleStop();
      }
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

    // Calculate total duration
    const maxDuration = Math.max(
      1,
      ...tracks.flatMap((track) =>
        track.clips.map((tc) => {
          const clip = clips.find((c) => c.id === tc.clipId);
          if (!clip) return 0;
          const duration = tc.repeat && tc.repeatCount
            ? clip.duration * tc.repeatCount
            : clip.duration;
          return tc.position + duration;
        })
      )
    );

    audioEngineRef.current.play(
      tracks,
      clips,
      audioFiles,
      playbackState.currentTime
    );

    setPlaybackState({ isPlaying: true, duration: maxDuration });
    animationFrameRef.current = requestAnimationFrame(updatePlaybackTime);
  };

  const handlePause = () => {
    if (audioEngineRef.current) {
      audioEngineRef.current.pause(playbackState.currentTime);
    }

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    setPlaybackState({ isPlaying: false });
  };

  const handleStop = () => {
    if (audioEngineRef.current) {
      audioEngineRef.current.stop();
    }

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    setPlaybackState({ isPlaying: false, currentTime: 0 });
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setPlaybackState({ currentTime: time });

    if (playbackState.isPlaying) {
      handlePause();
      setTimeout(() => {
        setPlaybackState({ currentTime: time });
        handlePlay();
      }, 50);
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
