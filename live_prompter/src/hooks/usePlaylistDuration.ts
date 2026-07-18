import { useEffect, useState, useRef, useMemo } from 'react';
import { Track } from '../types';

/**
 * Hook to calculate the total duration of a playlist
 * Fetches audio metadata for each track to get durations
 */
export function usePlaylistDuration(tracks: Track[]) {
  const [totalDuration, setTotalDuration] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);

  // Use a ref to track the current request to prevent race conditions
  const currentRequestId = useRef<number>(0);

  // Memoize track URLs to avoid re-fetching when array reference changes but content is the same
  const trackUrls = useMemo(() => tracks.map(t => t.url).join('|'), [tracks]);

  useEffect(() => {
    if (!tracks || tracks.length === 0) {
      setTotalDuration(0);
      setLoading(false);
      return;
    }

    // Increment request ID to invalidate previous requests
    const requestId = ++currentRequestId.current;
    setLoading(true);

    const fetchDurations = async () => {
      try {
        const durations = await Promise.all(
          tracks.map(track => getAudioDuration(track.url))
        );

        // Only update if this is still the current request
        if (requestId === currentRequestId.current) {
          const total = durations.reduce((sum, duration) => sum + (duration || 0), 0);
          setTotalDuration(total);
          setLoading(false);
        }
      } catch (error) {
        console.warn('Error fetching playlist durations:', error);
        if (requestId === currentRequestId.current) {
          setLoading(false);
        }
      }
    };

    fetchDurations();

    return () => {
      // Cleanup: next request will have a different ID
    };
  }, [trackUrls, tracks]);

  return { totalDuration, loading };
}

/**
 * Get duration of an audio file without fully loading it
 * Times out after 5 seconds to prevent hanging
 */
function getAudioDuration(url: string): Promise<number> {
  return new Promise((resolve) => {
    const audio = new Audio();
    let isResolved = false;

    // Set a timeout to prevent hanging indefinitely
    const timeout = setTimeout(() => {
      if (!isResolved) {
        console.warn(`Timeout loading duration for: ${url}`);
        isResolved = true;
        cleanup();
        resolve(0);
      }
    }, 5000);

    const handleLoadedMetadata = () => {
      if (!isResolved) {
        isResolved = true;
        clearTimeout(timeout);
        resolve(audio.duration);
        cleanup();
      }
    };

    const handleError = () => {
      if (!isResolved) {
        console.warn(`Failed to load duration for: ${url}`);
        isResolved = true;
        clearTimeout(timeout);
        cleanup();
        resolve(0);
      }
    };

    const cleanup = () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('error', handleError);
      audio.src = '';
      audio.load(); // Force cleanup
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('error', handleError);
    audio.preload = 'metadata'; // Only load metadata, not the full file
    audio.src = url;
  });
}

/**
 * Format seconds to HH:MM:SS or MM:SS
 */
export function formatDuration(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return '0:00';

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}
