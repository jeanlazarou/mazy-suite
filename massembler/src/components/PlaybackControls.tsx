import { useEffect } from 'react';
import { useStoreFields } from '../store';
import { isTextEntry } from '../utils/keyboard';
import { pause, play, seek, stop, toggleLoop, togglePlay } from '../utils/transport';
import { LevelMeter } from './LevelMeter';
import { VolumeKnob } from './VolumeKnob';

export function PlaybackControls() {
  // The one component that should redraw on every frame while playing.
  const { playbackState, loopRegion, loopEnabled, masterVolume, setMasterVolume } = useStoreFields(
    'playbackState',
    'loopRegion',
    'loopEnabled',
    'masterVolume',
    'setMasterVolume'
  );

  // Space plays and pauses, and L switches looping, except while typing or
  // with a dialog open. Space is taken from focused buttons too: after
  // clicking "+ Track", it should play rather than add another track.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const isSpace = e.code === 'Space';
      const isLoopKey = e.key.toLowerCase() === 'l' && !e.shiftKey;
      if (!isSpace && !isLoopKey) return;

      const target = e.target;
      if (isTextEntry(target) || target instanceof HTMLSelectElement) return;
      // Not while a dialog is open, wherever focus is: the Waveform Editor
      // takes Space for its own preview.
      if (document.querySelector('[role="dialog"]')) return;

      e.preventDefault();
      if (isSpace) togglePlay();
      else toggleLoop();
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
    // Padded on the right to keep clear of the Speed Dial in the corner.
    <div className="bg-gray-800 border-t border-gray-700 p-4 pr-24">
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
          <button
            onClick={toggleLoop}
            className={`px-3 py-2 rounded font-semibold ${
              loopEnabled
                ? 'bg-emerald-600 hover:bg-emerald-700'
                : loopRegion
                  ? 'bg-gray-700 hover:bg-gray-600'
                  : 'bg-gray-700 hover:bg-gray-600 text-gray-400'
            }`}
            title={
              loopRegion
                ? `${loopEnabled ? 'Stop looping' : 'Loop'} the marked region (L)`
                : 'Loop (L): first Shift-drag on the ruler to mark the region'
            }
            aria-pressed={loopEnabled}
          >
            🔁 Loop
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

        {/* Master: the whole mix's volume, and the level it comes out at */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">Master</span>
          <VolumeKnob
            value={masterVolume}
            onChange={setMasterVolume}
            size={32}
            defaultValue={1}
            label="Master volume"
          />
          <LevelMeter active={playbackState.isPlaying} />
        </div>
      </div>
    </div>
  );
}
