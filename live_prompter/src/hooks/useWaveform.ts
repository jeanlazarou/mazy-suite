import { useEffect } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.js';
import { LyricLine } from '../types';

export function useWaveform(
  containerRef: React.RefObject<HTMLDivElement>,
  wavesurferRef: React.RefObject<WaveSurfer>,
  regionsPluginRef: React.RefObject<RegionsPlugin>,
  initializeWaveSurfer: (container: HTMLElement) => WaveSurfer,
  createLyricRegions: (lyrics: LyricLine[]) => void,
  lyrics: LyricLine[],
  isReady: boolean,
  onTimeUpdate?: (currentTime: number) => void
) {
  // Initialize WaveSurfer when container is available
  useEffect(() => {
    if (!containerRef.current || wavesurferRef.current) {
      return;
    }

    const wavesurfer = initializeWaveSurfer(containerRef.current);

    // Set up time update forwarding to parent
    if (onTimeUpdate) {
      const handleTimeUpdate = () => {
        const currentTime = wavesurfer.getCurrentTime();
        onTimeUpdate(currentTime);
      };

      wavesurfer.on('audioprocess', handleTimeUpdate);
      wavesurfer.on('seeking', handleTimeUpdate);

      // Cleanup function will be handled by the parent's wavesurfer cleanup
    }
  }, [containerRef, wavesurferRef, initializeWaveSurfer, onTimeUpdate]);

  // Create lyric regions when ready and lyrics are available
  useEffect(() => {
    if (isReady && lyrics.length > 0) {
      const timeout = setTimeout(() => {
        createLyricRegions(lyrics);
      }, 300);
      return () => clearTimeout(timeout);
    }
  }, [isReady, lyrics, createLyricRegions]);

  return {
    // Return current state from the WaveSurfer instance
    isReady,
    wavesurfer: wavesurferRef.current,
    regionsPlugin: regionsPluginRef.current,
  };
}