import React, { useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { PerformanceData } from './types';
import { fetchPerformanceData } from './api/endpoints';
import { EditMode } from './components/EditMode';
import { LyricDisplay } from './components/LyricDisplay';
import { useWebSocket } from './hooks/useWebSocket';
import { ExternalCommandsProvider, useExternalCommands } from './context/ExternalCommandsContext';
import { PlaybackProvider, usePlayback } from './context/PlaybackContext';

import './App.css';

type Command =
  | { type: 'STOP' }
  | { type: 'START' }
  | { type: 'NEXT' }
  | { type: 'PREVIOUS' }
  | { type: 'PLAY_TRACK', trackName: string }
  | { type: 'TOGGLE_EDIT_MODE' };

const AppContent: React.FC = () => {
  const [performanceData, setPerformanceData] = useState<PerformanceData | null>(null);
  const [isEditMode, setIsEditMode] = useState<boolean>(false);
  const [performanceFile, setPerformanceFile] = useState<string>('default_performance.json');

  const { wsUrl, enabled, setEnabled, setWsUrl } = useExternalCommands();

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
      case 'PLAY_TRACK':
        if (performanceData) {
          const trackIndex = performanceData.tracks.findIndex(
            track => track.title.toLowerCase() === command.trackName.toLowerCase()
          );
          if (trackIndex !== -1) {
            setCurrentTrackIndex(trackIndex);
            setIsPlaying(true);
          }
        }
        break;
      case 'TOGGLE_EDIT_MODE':
        setEnabled(false);
        setIsEditMode(prev => !prev);
        break;
    }
  }, [enabled, performanceData, setIsPlaying, currentTrackIndex, setCurrentTrackIndex]);

  const handleWebSocketMessage = useCallback((message: { type: string; trackId?: string }) => {
    if (!enabled) return;

    switch (message.type) {
      case 'trackStart':
        if (message.trackId && performanceData) {
          const track = performanceData.tracks.find(t => t.id === message.trackId);
          if (track) {
            executeCommand({ type: 'PLAY_TRACK', trackName: track.title });
          }
        }
        break;
      case 'trackStop':
        executeCommand({ type: 'STOP' });
        break;
    }
  }, [executeCommand, performanceData, enabled]);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const editMode = urlParams.get("edit") === 'true';
    setIsEditMode(editMode);

    const file = urlParams.get("performance") || "default_performance.json";
    setPerformanceFile(file);

    // Get WebSocket URL from URL parameters or use default
    const wsUrl = urlParams.get("wsUrl");
    if (wsUrl) {
      setWsUrl(`ws://${wsUrl}`);
    }

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

  const { error } = useWebSocket({
    wsUrl,
    onMessage: handleWebSocketMessage,
  });

  if (!performanceData) {
    return <div>Loading...</div>;
  }

  if (isEditMode) {
    return <EditMode
      performanceFile={performanceFile}
      wsUrl={wsUrl}
      onWsUrlChange={setWsUrl}
    />;
  }

  return (
    <div className="app">
      {error && (
        <div style={{
          position: 'fixed',
          top: 10,
          right: 10,
          padding: '8px',
          background: 'rgba(255, 0, 0, 0.2)',
          color: 'white',
          borderRadius: '4px',
          fontSize: '12px'
        }}>
          {error}
        </div>
      )}
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