import React, { useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { PerformanceData, Track } from './types';
import { fetchPerformanceData } from './api/endpoints';
import { EditMode } from './components/EditMode';
import { LyricDisplay } from './components/LyricDisplay';
import { ExternalCommandsProvider, useExternalCommands } from './context/ExternalCommandsContext';
import { PlaybackProvider, usePlayback } from './context/PlaybackContext';

import './App.css';

type Command =
  | { type: 'STOP' }
  | { type: 'START' }
  | { type: 'NEXT' }
  | { type: 'PREVIOUS' }
  | { type: 'TOGGLE_EDIT_MODE' };

// By url first, then by title: the performance usually plays the live
// playback files while the prompter's albums point at the studio ones
const findTrackIndex = (tracks: Track[], track: { url: string; title: string }) => {
  const byUrl = tracks.findIndex(t => t.id === track.url);
  return byUrl !== -1 ? byUrl : tracks.findIndex(t => t.title.toLowerCase() === track.title.toLowerCase());
};

const AppContent: React.FC = () => {
  const [performanceData, setPerformanceData] = useState<PerformanceData | null>(null);
  const [isEditMode, setIsEditMode] = useState<boolean>(false);
  const [performanceFile, setPerformanceFile] = useState<string>('default_performance.json');

  const { enabled, setEnabled, prompterState } = useExternalCommands();

  const {
    isPlaying,
    setIsPlaying,
    currentTrackIndex,
    setCurrentTrackIndex,
    currentTrack,
    setCurrentTrack
  } = usePlayback();

  const executeCommand = useCallback((command: Command) => {
    switch (command.type) {
      case 'STOP':
        setIsPlaying(false);
        break;
      case 'START':
        setIsPlaying(true);
        break;
      case 'NEXT':
        if (performanceData) {
          setCurrentTrackIndex((currentTrackIndex + 1) % performanceData.tracks.length);
        }
        break;
      case 'PREVIOUS':
        if (performanceData) {
          setCurrentTrackIndex(
            (currentTrackIndex - 1 + performanceData.tracks.length) % performanceData.tracks.length
          );
        }
        break;
      case 'TOGGLE_EDIT_MODE':
        // Follow the prompter in show mode only, the link stays up meanwhile
        setEnabled(isEditMode);
        setIsEditMode(!isEditMode);
        break;
    }
  }, [isEditMode, performanceData, setIsPlaying, currentTrackIndex, setCurrentTrackIndex, setEnabled]);

  // Follow the linked prompter: its track, shown while it plays. A track that
  // isn't in the performance shows nothing rather than another song's words.
  useEffect(() => {
    if (!enabled || !performanceData || !prompterState) return;

    const index = prompterState.track ? findTrackIndex(performanceData.tracks, prompterState.track) : -1;
    if (index !== -1) setCurrentTrackIndex(index);
    setIsPlaying(index !== -1 && prompterState.playing);
  }, [prompterState, enabled, performanceData, setCurrentTrackIndex, setIsPlaying]);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const editMode = urlParams.get("edit") === 'true';
    setIsEditMode(editMode);

    const file = urlParams.get("performance") || "default_performance.json";
    setPerformanceFile(file);

    const loadPerformanceData = async () => {
      try {
        const data = await fetchPerformanceData(file);
        setPerformanceData(data);
      } catch (error) {
        console.error("Error fetching performance data:", error);
      }
    };

    loadPerformanceData();
  }, []);

  useEffect(() => {
    if (!isEditMode) document.body.style.cursor = 'none';

    const handleKeyDown = (event: KeyboardEvent) => {
      // Typing in a field, like the prompter link's invite, isn't a command
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (event.key === 'ArrowRight') {
        executeCommand({ type: 'NEXT' });
      } else if (event.key === 'ArrowLeft') {
        executeCommand({ type: 'PREVIOUS' });
      }
      else if (event.key === ' ') {
        event.preventDefault();
        executeCommand(isPlaying ? { type: 'STOP' } : { type: 'START' });
      } else if (event.key === 'e' && event.ctrlKey) {
        event.preventDefault();
        executeCommand({ type: 'TOGGLE_EDIT_MODE' });
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.cursor = 'default';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isEditMode, isPlaying, executeCommand, performanceData]);

  useEffect(() => {
    if (performanceData === null) return;
    setCurrentTrack(performanceData.tracks[currentTrackIndex]);
  }, [performanceData, currentTrackIndex, setCurrentTrack]);

  if (!performanceData) {
    return <div>Loading...</div>;
  }

  if (isEditMode) {
    return <EditMode performanceFile={performanceFile} />;
  }

  return (
    <div className="app">
      <AnimatePresence mode="wait">
        {isPlaying && (
          <motion.div
            key={currentTrackIndex}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="app-content"
          >
            {currentTrack && <LyricDisplay
              performanceData={performanceData}
              currentTrack={currentTrack}
            />}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export const App: React.FC = () => {
  const urlParams = new URLSearchParams(window.location.search);
  const isEditMode = urlParams.get("edit") === 'true';

  return (
    <ExternalCommandsProvider startEnabled={!isEditMode}>
      <PlaybackProvider>
        <AppContent />
      </PlaybackProvider>
    </ExternalCommandsProvider>
  );
};