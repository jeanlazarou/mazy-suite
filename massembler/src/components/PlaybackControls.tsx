import { useEffect } from 'react';
import { useStoreFields } from '../store';
import { isTextEntry } from '../utils/keyboard';
import { pause, play, seek, stop, togglePlay } from '../utils/transport';

export function PlaybackControls() {
  // The one component that should redraw on every frame while playing.
  const { playbackState } = useStoreFields('playbackState');

  // Space plays and pauses, except while typing or with a dialog open. It is
  // taken from focused buttons too: after clicking "+ Track", Space should
  // play rather than add another track.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target;
      if (isTextEntry(target) || target instanceof HTMLSelectElement) return;
      // Not while a dialog is open, wherever focus is: the Waveform Editor
      // takes Space for its own preview.
      if (document.querySelector('[role="dialog"]')) return;

      e.preventDefault();
      togglePlay();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-gray-800 border-t border-gray-700 p-4">
      <div className="flex items-center gap-4">
        {/* Play/Pause/Stop buttons */}
        <div className="flex gap-2" data-tour="play">
          {!playbackState.isPlaying ? (
            <button
              onClick={play}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded font-semibold"
              title="Play (Space)"
            >
              ▶ Play
            </button>
          ) : (
            <button
              onClick={pause}
              className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 rounded font-semibold"
              title="Pause (Space)"
            >
              ⏸ Pause
            </button>
          )}
          <button
            onClick={stop}
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
            onChange={(e) => seek(parseFloat(e.target.value))}
            className="flex-1"
          />
        </div>
      </div>
    </div>
  );
}
