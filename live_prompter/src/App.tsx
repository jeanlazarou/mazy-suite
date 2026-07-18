import { useState, useEffect, useCallback } from 'react';
import { Album, AlbumData, Track, CustomPlaylistTrack } from './types';
import { arrayMove } from '@dnd-kit/sortable';
import { useAudioPlayer } from './hooks/useAudioPlayer';
import { useLyrics } from './hooks/useLyrics';
import { useLocalStorage } from './hooks/useLocalStorage';
import { Sidebar } from './components/Sidebar';
import { PlayerControls } from './components/PlayerControls';
import { LyricDisplay } from './components/LyricDisplay';
import { Waveform } from './components/Waveform';

interface AlbumWithTitle extends Album {
  title?: string;
}

function App() {
  const [albums, setAlbums] = useState<AlbumWithTitle[]>([]);
  const [selectedAlbum, setSelectedAlbum] = useLocalStorage<string | null>('live-prompter-selected-album', null);
  const [albumData, setAlbumData] = useState<AlbumData | null>(null);
  const [currentTrackIndex, setCurrentTrackIndex] = useLocalStorage<number>('live-prompter-track-index', -1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useLocalStorage<boolean>('live-prompter-sidebar-collapsed', false);
  const [customPlaylist, setCustomPlaylist] = useLocalStorage<CustomPlaylistTrack[]>('live-prompter-custom-playlist', []);
  const [customPlaylistVisible, setCustomPlaylistVisible] = useLocalStorage<boolean>('live-prompter-custom-playlist-visible', false);
  const [isPlayingFromCustomPlaylist, setIsPlayingFromCustomPlaylist] = useState(false);

  // Add waveform current time state
  const [waveformCurrentTime, setWaveformCurrentTime] = useState<number>(0);

  const {
    wavesurferRef,
    regionsPluginRef,
    playerState,
    currentTrack,
    error: audioError,
    isReady: isWaveSurferReady,
    initializeWaveSurfer,
    createLyricRegions,
    loadTrack,
    play,
    pause,
    stop,
    seekTo,
    setVolume,
    clearError
  } = useAudioPlayer();

  const {
    lyrics,
    loading: lyricsLoading,
    error: lyricsError,
    getCurrentLyric,
    getUpcomingLyrics
  } = useLyrics(currentTrack?.title || null);

  // Load albums on mount
  useEffect(() => {
    const loadAlbums = async () => {
      try {
        const response = await fetch('/data/albums.json');
        if (!response.ok) {
          throw new Error('Failed to load albums');
        }
        const albumsData = await response.json();

        // Load titles for each album
        const albumsWithTitles = await Promise.all(
          albumsData.map(async (album: Album) => {
            try {
              const albumResponse = await fetch(`/data/${album.name}.json`);
              if (albumResponse.ok) {
                const albumInfo = await albumResponse.json();
                return { ...album, title: albumInfo.title };
              }
            } catch {
              console.warn(`Failed to load title for album: ${album.name}`);
            }
            // Fallback to capitalized name if title can't be loaded
            return { ...album, title: album.name.charAt(0).toUpperCase() + album.name.slice(1) };
          })
        );

        // Sort albums alphabetically by title
        const sortedAlbums = albumsWithTitles.sort((a: AlbumWithTitle, b: AlbumWithTitle) => {
          const titleA = a.title || a.name;
          const titleB = b.title || b.name;
          return titleA.localeCompare(titleB);
        });

        setAlbums(sortedAlbums);
      } catch (error) {
        console.error('Failed to load albums:', error);
        setError('Failed to load albums');
      } finally {
        setLoading(false);
      }
    };

    loadAlbums();
  }, []);

  // Load album data when album is selected
  useEffect(() => {
    if (!selectedAlbum || selectedAlbum === '__custom_playlist__') return;

    const loadAlbumData = async () => {
      try {
        setAlbumData(null);

        const response = await fetch(`/data/${selectedAlbum}.json`);
        if (!response.ok) {
          throw new Error(`Failed to load album: ${selectedAlbum}`);
        }
        const data = await response.json();
        setAlbumData(data);
        setCurrentTrackIndex(-1);
      } catch (error) {
        console.error('Failed to load album data:', error);
        setError(`Failed to load album: ${selectedAlbum}`);
      }
    };

    loadAlbumData();
  }, [selectedAlbum, setCurrentTrackIndex]);

  // Sync waveform time with player time
  useEffect(() => {
    setWaveformCurrentTime(playerState.currentTime);
  }, [playerState.currentTime]);

  // Auto-load saved track when album data is loaded
  useEffect(() => {
    if (albumData && currentTrackIndex >= 0 && currentTrackIndex < albumData.playlist.length && !currentTrack) {
      const savedTrack = albumData.playlist[currentTrackIndex];
      if (savedTrack) {
        loadTrack(savedTrack, false); // Don't auto-play on restore
      }
    }
  }, [albumData, currentTrackIndex, currentTrack, loadTrack]);

  // Create lyric regions when lyrics are loaded and WaveSurfer is ready
  useEffect(() => {
    if (isWaveSurferReady && lyrics.length > 0 && currentTrack) {
      createLyricRegions(lyrics);
    }
  }, [isWaveSurferReady, lyrics, currentTrack, createLyricRegions]);

  // Clear audio errors when they occur
  useEffect(() => {
    if (audioError) {
      console.error('Audio error:', audioError);
      // Auto-clear error after 5 seconds
      const timeout = setTimeout(() => {
        clearError();
      }, 5000);
      return () => clearTimeout(timeout);
    }
  }, [audioError, clearError]);

  const handleTrackSelect = useCallback((track: Track) => {
    const trackIndex = albumData?.playlist.findIndex(t => t.url === track.url) ?? -1;
    setCurrentTrackIndex(trackIndex);
    setIsPlayingFromCustomPlaylist(false);
    loadTrack(track, true);
  }, [albumData, loadTrack, setCurrentTrackIndex]);

  const handlePrevious = useCallback(() => {
    if (!albumData || albumData.playlist.length === 0) return;

    const newIndex = currentTrackIndex === 0
      ? albumData.playlist.length - 1
      : currentTrackIndex - 1;

    setCurrentTrackIndex(newIndex);
    loadTrack(albumData.playlist[newIndex], true);
  }, [albumData, currentTrackIndex, loadTrack, setCurrentTrackIndex]);

  const handleNext = useCallback(() => {
    if (!albumData || albumData.playlist.length === 0) return;

    const newIndex = currentTrackIndex >= albumData.playlist.length - 1
      ? 0
      : currentTrackIndex + 1;

    setCurrentTrackIndex(newIndex);
    loadTrack(albumData.playlist[newIndex], true);
  }, [albumData, currentTrackIndex, loadTrack, setCurrentTrackIndex]);

  const handleRestart = useCallback(() => {
    seekTo(0);
  }, [seekTo]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Prevent shortcuts when typing in input fields
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (event.code) {
        case 'Space':
          event.preventDefault();
          if (currentTrack) {
            if (playerState.isPlaying) {
              pause();
            } else {
              play();
            }
          }
          break;
        case 'ArrowLeft':
          event.preventDefault();
          handlePrevious();
          break;
        case 'ArrowRight':
          event.preventDefault();
          handleNext();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [currentTrack, playerState.isPlaying, play, pause, handlePrevious, handleNext]);

  const handleBackToAlbums = useCallback(() => {
    setSelectedAlbum(null);
    setAlbumData(null);
    setCurrentTrackIndex(-1);
    setIsPlayingFromCustomPlaylist(false);
  }, [setSelectedAlbum, setCurrentTrackIndex]);

  // Custom playlist callbacks
  const handleToggleCustomPlaylist = useCallback(() => {
    setCustomPlaylistVisible(prev => !prev);
  }, [setCustomPlaylistVisible]);

  const handleAddToCustomPlaylist = useCallback((track: Track, albumName: string) => {
    setCustomPlaylist(prev => [
      ...prev,
      { id: crypto.randomUUID(), track, sourceAlbum: albumName }
    ]);
    setCustomPlaylistVisible(true);
  }, [setCustomPlaylist, setCustomPlaylistVisible]);

  const handleRemoveFromCustomPlaylist = useCallback((id: string) => {
    setCustomPlaylist(prev => prev.filter(item => item.id !== id));
  }, [setCustomPlaylist]);

  const handleReorderCustomPlaylist = useCallback((activeId: string, overId: string) => {
    setCustomPlaylist(prev => {
      const oldIndex = prev.findIndex(item => item.id === activeId);
      const newIndex = prev.findIndex(item => item.id === overId);
      if (oldIndex === -1 || newIndex === -1) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  }, [setCustomPlaylist]);

  const handleSelectCustomPlaylist = useCallback(() => {
    const customAlbumData: AlbumData = {
      title: 'Custom Playlist',
      playlist: customPlaylist.map(item => item.track),
    };
    setSelectedAlbum('__custom_playlist__');
    setAlbumData(customAlbumData);
    setCurrentTrackIndex(-1);
  }, [customPlaylist, setSelectedAlbum, setCurrentTrackIndex]);

  const handleCustomPlaylistTrackSelect = useCallback((track: Track, index: number) => {
    const customAlbumData: AlbumData = {
      title: 'Custom Playlist',
      playlist: customPlaylist.map(item => item.track),
    };
    setAlbumData(customAlbumData);
    setSelectedAlbum('__custom_playlist__');
    setCurrentTrackIndex(index);
    setIsPlayingFromCustomPlaylist(true);
    loadTrack(track, true);
  }, [customPlaylist, loadTrack, setSelectedAlbum, setCurrentTrackIndex]);

  // Sync albumData with customPlaylist when playing from it and playlist changes
  useEffect(() => {
    if (isPlayingFromCustomPlaylist && selectedAlbum === '__custom_playlist__') {
      const newPlaylist = customPlaylist.map(item => item.track);
      setAlbumData(prev => prev ? { ...prev, playlist: newPlaylist } : prev);
      if (currentTrack) {
        const newIndex = newPlaylist.findIndex(t => t.url === currentTrack.url);
        if (newIndex !== -1 && newIndex !== currentTrackIndex) {
          setCurrentTrackIndex(newIndex);
        }
      }
    }
  }, [customPlaylist, isPlayingFromCustomPlaylist, selectedAlbum, currentTrack, currentTrackIndex, setCurrentTrackIndex]);

  // Handle waveform time updates and sync with player state
  const handleWaveformTimeUpdate = useCallback((currentTime: number) => {
    setWaveformCurrentTime(currentTime);
  }, []);

  // Get current and upcoming lyrics based on current time
  // Use the most up-to-date time from either player or waveform
  const currentTime = Math.max(playerState.currentTime, waveformCurrentTime);
  const currentLyric = getCurrentLyric(currentTime);
  const upcomingLyrics = getUpcomingLyrics(currentTime, 3);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading Lyric Prompter...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-pink-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-600 text-xl mb-4">Error</div>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-gradient-to-br from-indigo-50 to-purple-50 flex overflow-hidden">
      {/* Error display for audio issues */}
      {audioError && (
        <div className="fixed top-4 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded z-50 max-w-md">
          <div className="flex">
            <div className="py-1">
              <strong className="font-bold">Audio Error: </strong>
              <span className="block sm:inline">{audioError}</span>
            </div>
            <div className="pl-4">
              <button
                onClick={clearError}
                className="text-red-700 hover:text-red-900"
              >
                ×
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar - Fixed height */}
      <div className={`${sidebarCollapsed ? 'w-16' : 'w-80'} transition-all duration-300 ease-in-out flex-shrink-0`}>
        <Sidebar
          albums={albums}
          selectedAlbum={selectedAlbum}
          albumData={albumData}
          currentTrack={currentTrack}
          onAlbumSelect={setSelectedAlbum}
          onTrackSelect={handleTrackSelect}
          onBackToAlbums={handleBackToAlbums}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
          loading={false}
          customPlaylist={customPlaylist}
          customPlaylistVisible={customPlaylistVisible}
          onToggleCustomPlaylist={handleToggleCustomPlaylist}
          onAddToCustomPlaylist={handleAddToCustomPlaylist}
          onRemoveFromCustomPlaylist={handleRemoveFromCustomPlaylist}
          onReorderCustomPlaylist={handleReorderCustomPlaylist}
          onSelectCustomPlaylist={handleSelectCustomPlaylist}
          onCustomPlaylistTrackSelect={handleCustomPlaylistTrackSelect}
          isPlayingFromCustomPlaylist={isPlayingFromCustomPlaylist}
        />
      </div>

      {/* Main Content - Fixed height, no scrolling */}
      <div className="flex-1 min-w-0 h-screen overflow-hidden">
        <div className="h-full flex flex-col p-4 gap-4">
          {/* Waveform at the top - Always present */}
          <div className="flex-shrink-0">
            <Waveform
              audioUrl={currentTrack?.url || null}
              lyrics={lyrics}
              currentTrack={currentTrack ? {
                title: currentTrack.title,
                authors: currentTrack.authors
              } : null}
              currentTime={playerState.currentTime}
              duration={playerState.duration}
              isPlaying={playerState.isPlaying}
              wavesurferRef={wavesurferRef}
              regionsPluginRef={regionsPluginRef}
              initializeWaveSurfer={initializeWaveSurfer}
              createLyricRegions={createLyricRegions}
              isWaveSurferReady={isWaveSurferReady}
              onTimeUpdate={handleWaveformTimeUpdate}
            />
          </div>

          {/* Player Controls and Lyrics side by side */}
          <div className="flex-1 min-h-0 flex gap-4">
            {/* Player Controls - Left side */}
            <div className="w-80 flex-shrink-0">
              <PlayerControls
                playerState={playerState}
                currentTrack={currentTrack}
                onPlay={play}
                onPause={pause}
                onStop={stop}
                onRestart={handleRestart}
                onPrevious={handlePrevious}
                onNext={handleNext}
                onVolumeChange={setVolume}
              />
            </div>

            {/* Lyrics Display - Right side, takes remaining space */}
            <div className="flex-1 min-w-0">
              <LyricDisplay
                currentLyric={currentLyric}
                upcomingLyrics={upcomingLyrics}
                loading={lyricsLoading}
                error={lyricsError}
                currentTime={currentTime}
                currentTrack={currentTrack || null}
                nextTrack={albumData && currentTrackIndex >= 0 && currentTrackIndex < albumData.playlist.length - 1
                  ? albumData.playlist[currentTrackIndex + 1]
                  : null}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;