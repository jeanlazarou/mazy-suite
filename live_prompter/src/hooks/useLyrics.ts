import { useState, useEffect } from 'react';
import { LyricLine } from '../types';
import { parseSRT, getLyricFileName } from '../utils/srtParser';

export function useLyrics(trackTitle: string | null) {
  const [lyrics, setLyrics] = useState<LyricLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!trackTitle) {
      setLyrics([]);
      return;
    }

    const loadLyrics = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const fileName = getLyricFileName(trackTitle);
        const response = await fetch(`/data/lyrics/${fileName}.srt`);
        
        if (!response.ok) {
          throw new Error(`Lyrics not found for "${fileName}"`);
        }
        
        const srtContent = await response.text();
        const parsedLyrics = parseSRT(srtContent);
        setLyrics(parsedLyrics);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load lyrics');
        setLyrics([]);
      } finally {
        setLoading(false);
      }
    };

    loadLyrics();
  }, [trackTitle]);

  const getCurrentLyric = (currentTime: number): LyricLine | null => {
    return lyrics.find(lyric => 
      currentTime >= lyric.startTime && currentTime <= lyric.endTime
    ) || null;
  };

  const getUpcomingLyrics = (currentTime: number, count: number = 3): LyricLine[] => {
    const currentIndex = lyrics.findIndex(lyric => 
      currentTime >= lyric.startTime && currentTime <= lyric.endTime
    );
    
    if (currentIndex === -1) {
      const nextIndex = lyrics.findIndex(lyric => lyric.startTime > currentTime);
      return nextIndex !== -1 ? lyrics.slice(nextIndex, nextIndex + count) : [];
    }
    
    return lyrics.slice(currentIndex + 1, currentIndex + 1 + count);
  };

  return {
    lyrics,
    loading,
    error,
    getCurrentLyric,
    getUpcomingLyrics
  };
}