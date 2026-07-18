import { useRef } from 'react';
import { useWaveform } from '../hooks/useWaveform';
import { LyricLine } from '../types';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.js';

interface WaveformProps {
  audioUrl: string | null;
  lyrics: LyricLine[];
  className?: string;
  currentTrack?: {
    title: string;
    authors: string[];
  } | null;
  onTimeUpdate?: (currentTime: number) => void;
  currentTime?: number;
  duration?: number;
  isPlaying?: boolean;
  wavesurferRef: React.RefObject<WaveSurfer>;
  regionsPluginRef: React.RefObject<RegionsPlugin>;
  initializeWaveSurfer: (container: HTMLElement) => WaveSurfer;
  createLyricRegions: (lyrics: LyricLine[]) => void;
  isWaveSurferReady: boolean;
}

export function Waveform({
  audioUrl,
  lyrics,
  className = '',
  currentTrack,
  onTimeUpdate,
  currentTime = 0,
  duration = 0,
  isPlaying = false,
  wavesurferRef,
  regionsPluginRef,
  initializeWaveSurfer,
  createLyricRegions,
  isWaveSurferReady
}: WaveformProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const {
    regionsPlugin
  } = useWaveform(
    containerRef,
    wavesurferRef,
    regionsPluginRef,
    initializeWaveSurfer,
    createLyricRegions,
    lyrics,
    isWaveSurferReady,
    onTimeUpdate
  );

  const formatTime = (seconds: number): string => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className={`bg-white rounded-xl shadow-lg p-4 ${className}`}>
      {/* Header with track info and time display */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex-1 min-w-0">
          {currentTrack ? (
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold text-gray-900 truncate">
                  {currentTrack.title}
                </h3>
                {isPlaying && (
                  <div className="flex items-center gap-1 text-green-600">
                    <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                  </div>
                )}
              </div>
              <p className="text-sm text-gray-600 truncate">
                {currentTrack.authors.join(', ')}
              </p>
            </div>
          ) : (
            <h3 className="text-lg font-semibold text-gray-900">
              Select a track
            </h3>
          )}
        </div>

        {/* Time display */}
        <div className="flex-shrink-0 ml-4">
          <div className="text-right">
            <div className="text-lg font-mono font-semibold text-gray-900">
              {formatTime(currentTime)}
            </div>
            <div className="text-sm text-gray-500">
              {duration > 0 ? formatTime(duration) : '--:--'}
            </div>
            {/* Progress bar */}
            {duration > 0 && (
              <div className="w-20 h-1 bg-gray-200 rounded-full mt-1">
                <div
                  className="h-full bg-indigo-600 rounded-full transition-all duration-100"
                  style={{ width: `${(currentTime / duration) * 100}%` }}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Waveform container */}
      <div className="relative">
        <div
          ref={containerRef}
          className="w-full relative bg-gray-50 rounded-lg overflow-hidden border-2 border-gray-100"
          style={{ minHeight: '220px', height: '220px' }}
        />

        {!audioUrl && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-500 pointer-events-none">
            <div className="text-center">
              <div className="text-4xl mb-2">🎵</div>
              <p>Select a track to view waveform</p>
            </div>
          </div>
        )}

        {audioUrl && !isWaveSurferReady && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-500 pointer-events-none bg-gray-50 bg-opacity-75">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto mb-2"></div>
              <p>Loading waveform...</p>
            </div>
          </div>
        )}
      </div>

      {/* Legend and info */}
      <div className="mt-3 flex items-center justify-between text-sm text-gray-600">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: '#94a3b8' }}></div>
            <span>Waveform</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: '#6366f1' }}></div>
            <span>Progress</span>
          </div>
          {lyrics.length > 0 && (
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded" style={{ backgroundColor: 'rgba(99, 102, 241, 0.2)', border: '1px solid rgba(99, 102, 241, 0.3)' }}></div>
              <span>Lyric Regions ({lyrics.length})</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          {isWaveSurferReady && duration > 0 && (
            <span className="text-xs text-gray-500">
              Click waveform to seek
            </span>
          )}
          {regionsPlugin && (
            <span className="text-xs text-green-600">
              Regions: {regionsPlugin.getRegions().length}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}