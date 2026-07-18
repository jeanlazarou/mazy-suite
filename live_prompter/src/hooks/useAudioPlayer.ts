import { useState, useRef, useCallback } from 'react';
import { PlayerState, Track, LyricLine } from '../types';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.js';

export function useAudioPlayer() {
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const regionsPluginRef = useRef<RegionsPlugin | null>(null);
  const [playerState, setPlayerState] = useState<PlayerState>({
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: 85
  });
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [pendingTrack, setPendingTrack] = useState<{ track: Track; autoPlay: boolean } | null>(null);

  const updatePlayerState = useCallback(() => {
    if (wavesurferRef.current && isReady) {
      const currentTime = wavesurferRef.current.getCurrentTime() || 0;
      const duration = wavesurferRef.current.getDuration() || 0;

      setPlayerState(prev => ({
        ...prev,
        currentTime,
        duration
      }));
    }
  }, [isReady]);

  const initializeWaveSurfer = useCallback((container: HTMLElement) => {
    // Destroy existing instance if any
    if (wavesurferRef.current) {
      wavesurferRef.current.destroy();
      wavesurferRef.current = null;
    }

    // Create regions plugin
    const regionsPlugin = RegionsPlugin.create();
    regionsPluginRef.current = regionsPlugin;

    // Create WaveSurfer with regions plugin
    const wavesurfer = WaveSurfer.create({
      container,
      waveColor: '#94a3b8',
      progressColor: '#6366f1',
      cursorColor: '#ef4444',
      height: 220,
      normalize: true,
      backend: 'WebAudio',
      mediaControls: false,
      interact: true,
      fillParent: true,
      minPxPerSec: 50,
      hideScrollbar: true,
      plugins: [regionsPlugin],
    });

    const handleReady = () => {
      setIsReady(true);
      updatePlayerState();
      setError(null);

      // Load pending track if any
      if (pendingTrack) {
        const { track, autoPlay } = pendingTrack;
        setPendingTrack(null);

        // Reset state for pending track
        setPlayerState(prev => ({
          ...prev,
          volume: track.volume,
          isPlaying: false,
          currentTime: 0,
          duration: 0
        }));

        // Load the track
        setTimeout(() => {
          if (wavesurferRef.current) {
            try {
              wavesurferRef.current.load(track.url);
              wavesurferRef.current.setVolume(track.volume / 100);

              const handlePendingTrackReady = () => {
                const duration = wavesurferRef.current?.getDuration() || 0;

                // Explicitly seek to beginning for pending tracks too
                if (wavesurferRef.current) {
                  wavesurferRef.current.seekTo(0);
                }

                setPlayerState(prev => ({
                  ...prev,
                  duration,
                  currentTime: 0
                }));

                if (autoPlay) {
                  wavesurferRef.current?.play().then(() => {
                    setPlayerState(prev => ({ ...prev, isPlaying: true }));
                  }).catch(error => {
                    console.error('Auto-play failed:', error);
                    setError('Auto-play failed. Please try playing manually.');
                  });
                }
                wavesurferRef.current?.un('ready', handlePendingTrackReady);
              };

              wavesurferRef.current.on('ready', handlePendingTrackReady);
            } catch (error) {
              console.error('Failed to load pending track:', error);
              setError('Failed to load audio track');
            }
          }
        }, 100);
      }
    };

    const handleTimeUpdate = () => {
      if (wavesurferRef.current) {
        const currentTime = wavesurferRef.current.getCurrentTime() || 0;
        const duration = wavesurferRef.current.getDuration() || 0;

        setPlayerState(prev => ({
          ...prev,
          currentTime,
          duration
        }));
      }
    };

    const handlePlay = () => {
      setPlayerState(prev => ({ ...prev, isPlaying: true }));
    };

    const handlePause = () => {
      setPlayerState(prev => ({ ...prev, isPlaying: false }));
    };

    const handleFinish = () => {
      setPlayerState(prev => ({ ...prev, isPlaying: false }));
    };

    const handleError = (error: unknown) => {
      console.error('WaveSurfer error:', error);
      setError('Unable to load or play this audio file. The file may be missing or corrupted.');
      setPlayerState(prev => ({ ...prev, isPlaying: false }));
      setIsReady(false);
    };

    const handleLoadStart = () => {
      setError(null);
      setIsReady(false);
    };

    // Add event listeners
    wavesurfer.on('ready', handleReady);
    wavesurfer.on('audioprocess', handleTimeUpdate);
    wavesurfer.on('seeking', handleTimeUpdate);
    wavesurfer.on('play', handlePlay);
    wavesurfer.on('pause', handlePause);
    wavesurfer.on('finish', handleFinish);
    wavesurfer.on('error', handleError);
    wavesurfer.on('loading', handleLoadStart);

    wavesurferRef.current = wavesurfer;
    return wavesurfer;
  }, [updatePlayerState, pendingTrack]);

  const createLyricRegions = useCallback((lyrics: LyricLine[]) => {
    if (!regionsPluginRef.current || !wavesurferRef.current || !isReady || lyrics.length === 0) {
      return;
    }

    const regionsPlugin = regionsPluginRef.current;
    const wavesurfer = wavesurferRef.current;
    const duration = wavesurfer.getDuration();

    if (!duration) return;

    // Clear existing regions
    regionsPlugin.clearRegions();

    // Create regions for each lyric
    lyrics.forEach((lyric) => {
      try {
        regionsPlugin.addRegion({
          start: lyric.startTime,
          end: lyric.endTime,
          color: 'rgba(99, 102, 241, 0.2)',
          drag: false,
          resize: false,
          id: `lyric-${lyric.id}`,
          content: lyric.text,
        });
      } catch (error) {
        console.warn(`Failed to create region for lyric ${lyric.id}:`, error);
      }
    });
  }, [isReady]);

  const loadTrack = useCallback((track: Track, autoPlay: boolean = false) => {

    if (!wavesurferRef.current) {
      setPendingTrack({ track, autoPlay });
      setCurrentTrack(track);
      setPlayerState(prev => ({
        ...prev,
        volume: track.volume,
        isPlaying: false,
        currentTime: 0,
        duration: 0
      }));
      return;
    }

    setError(null);
    setCurrentTrack(track);
    setPendingTrack(null);

    // Reset player state immediately for new track
    setPlayerState(prev => ({
      ...prev,
      volume: track.volume,
      isPlaying: false,
      currentTime: 0,
      duration: 0
    }));

    // Clear existing regions
    if (regionsPluginRef.current) {
      regionsPluginRef.current.clearRegions();
    }

    // Set up one-time event listener for auto-play
    const handleTrackReady = () => {
      const duration = wavesurferRef.current?.getDuration() || 0;

      // Explicitly seek to beginning
      if (wavesurferRef.current) {
        wavesurferRef.current.seekTo(0);
      }

      setPlayerState(prev => ({
        ...prev,
        duration,
        currentTime: 0
      }));
      setIsReady(true);

      if (autoPlay && wavesurferRef.current) {
        wavesurferRef.current.play().then(() => {
          setPlayerState(prev => ({ ...prev, isPlaying: true }));
        }).catch(error => {
          console.error('Auto-play failed:', error);
          setError('Auto-play failed. Please try playing manually.');
        });
      }
      wavesurferRef.current?.un('ready', handleTrackReady);
    };

    wavesurferRef.current.on('ready', handleTrackReady);

    // Load the track
    try {
      // Stop current playback and reset position before loading new track
      if (wavesurferRef.current.isPlaying()) {
        wavesurferRef.current.pause();
      }
      wavesurferRef.current.seekTo(0);

      wavesurferRef.current.load(track.url);
      wavesurferRef.current.setVolume(track.volume / 100);
    } catch (error) {
      console.error('Failed to load track:', error);
      setError('Failed to load audio track');
    }
  }, []);

  const play = useCallback(() => {
    if (wavesurferRef.current && isReady) {
      wavesurferRef.current.play().then(() => {
        setPlayerState(prev => ({ ...prev, isPlaying: true }));
        setError(null);
      }).catch(error => {
        console.error('Play failed:', error);
        setError('Unable to play this audio file. The file may be missing, corrupted, or in an unsupported format.');
        setPlayerState(prev => ({ ...prev, isPlaying: false }));
      });
    }
  }, [isReady]);

  const pause = useCallback(() => {
    if (wavesurferRef.current) {
      wavesurferRef.current.pause();
      setPlayerState(prev => ({ ...prev, isPlaying: false }));
    }
  }, []);

  const stop = useCallback(() => {
    if (wavesurferRef.current) {
      wavesurferRef.current.stop();
      setPlayerState(prev => ({ ...prev, isPlaying: false, currentTime: 0 }));
    }
  }, []);

  const seekTo = useCallback((time: number) => {
    if (wavesurferRef.current && isReady) {
      const duration = wavesurferRef.current.getDuration();
      if (duration > 0) {
        wavesurferRef.current.seekTo(time / duration);
        updatePlayerState();
      }
    }
  }, [isReady, updatePlayerState]);

  const setVolume = useCallback((volume: number) => {
    if (wavesurferRef.current) {
      wavesurferRef.current.setVolume(volume / 100);
      setPlayerState(prev => ({ ...prev, volume }));
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    wavesurferRef,
    regionsPluginRef,
    playerState,
    currentTrack,
    error,
    isReady,
    initializeWaveSurfer,
    createLyricRegions,
    loadTrack,
    play,
    pause,
    stop,
    seekTo,
    setVolume,
    clearError
  };
}