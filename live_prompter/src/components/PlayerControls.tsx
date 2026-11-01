import { PlayerState, Track } from '../types';
import { LinkStatus } from '../utils/peerLink';
import {
  Play,
  Pause,
  Square,
  SkipBack,
  SkipForward,
  RotateCcw,
  Volume2,
  Cast
} from 'lucide-react';

interface PlayerControlsProps {
  playerState: PlayerState;
  currentTrack: Track | null;
  gigAnimStatus: LinkStatus;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onRestart: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onVolumeChange: (volume: number) => void;
  onGigAnimLink: () => void;
}

const GIG_ANIM_LABELS: Record<LinkStatus, { label: string; dot: string }> = {
  off: { label: 'Link gig_anim', dot: 'bg-gray-300' },
  waiting: { label: 'gig_anim: linking…', dot: 'bg-amber-400' },
  linked: { label: 'gig_anim linked', dot: 'bg-green-500' },
  interrupted: { label: 'gig_anim: network dropped', dot: 'bg-amber-400 animate-pulse' },
  lost: { label: 'gig_anim link lost', dot: 'bg-red-500' },
};

export function PlayerControls({
  playerState,
  currentTrack,
  gigAnimStatus,
  onPlay,
  onPause,
  onStop,
  onRestart,
  onPrevious,
  onNext,
  onVolumeChange,
  onGigAnimLink
}: PlayerControlsProps) {
  const gigAnim = GIG_ANIM_LABELS[gigAnimStatus];

  return (
    <div className="bg-white rounded-xl shadow-lg p-4 h-full flex flex-col">
      {/* Current track info */}
      {currentTrack && (
        <div className="mb-6 p-3 bg-gray-50 rounded-lg">
          <h4 className="font-medium text-gray-900 text-sm truncate mb-1">
            {currentTrack.title}
          </h4>
          <p className="text-xs text-gray-600 truncate">
            {currentTrack.authors.join(', ')}
          </p>
        </div>
      )}

      {/* Main controls */}
      <div className="flex flex-col items-center gap-4 mb-6">
        {/* Navigation controls */}
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={onPrevious}
            className="p-2 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
            disabled={!currentTrack}
            title="Previous track (← Arrow key)"
          >
            <SkipBack className="w-4 h-4" />
          </button>

          <button
            onClick={onRestart}
            className="p-2 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
            disabled={!currentTrack}
            title="Restart track"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <button
            onClick={playerState.isPlaying ? onPause : onPlay}
            className="p-4 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white transition-colors disabled:opacity-50"
            disabled={!currentTrack}
            title={`${playerState.isPlaying ? 'Pause' : 'Play'} (Spacebar)`}
          >
            {playerState.isPlaying ? (
              <Pause className="w-6 h-6" />
            ) : (
              <Play className="w-6 h-6 ml-0.5" />
            )}
          </button>

          <button
            onClick={onStop}
            className="p-2 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
            disabled={!currentTrack}
            title="Stop"
          >
            <Square className="w-4 h-4" />
          </button>

          <button
            onClick={onNext}
            className="p-2 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
            disabled={!currentTrack}
            title="Next track (→ Arrow key)"
          >
            <SkipForward className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Optional link to gig_anim on another device */}
      <button
        onClick={onGigAnimLink}
        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 hover:bg-gray-100 text-sm text-gray-700 transition-colors"
        title="Let gig_anim follow the prompter"
      >
        <Cast className="w-4 h-4 text-gray-600" />
        {gigAnim.label}
        <span className={`ml-auto w-2 h-2 rounded-full ${gigAnim.dot}`} />
      </button>

      {/* Volume control */}
      <div className="mt-auto">
        <div className="flex items-center gap-3 mb-2">
          <Volume2 className="w-4 h-4 text-gray-600" />
          <span className="text-sm text-gray-600">Volume</span>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min="0"
            max="100"
            value={playerState.volume}
            onChange={(e) => onVolumeChange(Number(e.target.value))}
            className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            style={{
              background: `linear-gradient(to right, #4f46e5 0%, #4f46e5 ${playerState.volume}%, #e5e7eb ${playerState.volume}%, #e5e7eb 100%)`
            }}
          />
          <span className="text-sm text-gray-600 w-10 text-right">
            {playerState.volume}%
          </span>
        </div>
      </div>
    </div>
  );
}