import React, { createContext, useContext, useState, ReactNode } from 'react';
import { Track } from '../types';

interface PlaybackContextType {
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
  currentTrackIndex: number;
  setCurrentTrackIndex: (index: number) => void;
  currentTrack: Track | null;
  setCurrentTrack: (track: Track | null) => void;
}

const PlaybackContext = createContext<PlaybackContextType | null>(null);

interface PlaybackProviderProps {
  children: ReactNode;
}

export const PlaybackProvider: React.FC<PlaybackProviderProps> = ({ children }) => {
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);

  return (
    <PlaybackContext.Provider value={{
      isPlaying,
      setIsPlaying,
      currentTrackIndex,
      setCurrentTrackIndex,
      currentTrack,
      setCurrentTrack,
    }}>
      {children}
    </PlaybackContext.Provider>
  );
};

export const usePlayback = () => {
  const context = useContext(PlaybackContext);
  if (!context) {
    throw new Error('usePlayback must be used within a PlaybackProvider');
  }
  return context;
};