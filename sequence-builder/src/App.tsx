import React, { useState, useRef, useEffect } from 'react';
import { Track, Playlist, RawPlaylist } from './types';
import TrackGrid from './TrackGrid';
import TrackListPopup from './TrackListPopup';
import SequencePlayer from './SequencePlayer';

function App() {
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [sequence, setSequence] = useState<string[]>([]);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const [hoveredTitle, setHoveredTitle] = useState<string | null>(null);
  const [isReplaying, setIsReplaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [playingUrl, setPlayingUrl] = useState<string | null>(null);
  const [playProgress, setPlayProgress] = useState(0);
  const [playingSegment, setPlayingSegment] = useState<'start' | 'end' | null>(null);
  const [showTrackList, setShowTrackList] = useState(false);

  const playerRef = useRef<SequencePlayer>(new SequencePlayer());

  useEffect(() => {
    const player = playerRef.current;
    player.onProgress = (trackUrl, progress, segment) => {
      setPlayingUrl(trackUrl);
      setPlayProgress(progress);
      setPlayingSegment(segment);
    };
    return () => {
      player.onProgress = null;
    };
  }, []);

  /**
   * Handle playlist file selection
   */
  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setIsLoading(true);
      const text = await file.text();
      const rawData: RawPlaylist = JSON.parse(text);

      // Normalize: remap "playlist" to "tracks"
      const trackList = rawData.playlist;

      // Resolve URLs: absolute paths (starting with /) are served from public folder via symlinks
      const tracksWithResolvedUrls = trackList.map(track => {
        let resolvedUrl = track.url;

        // If it's already an absolute URL, leave it
        if (track.url.startsWith('http://') || track.url.startsWith('https://')) {
          resolvedUrl = track.url;
        }
        // If it starts with /, it's relative to server root (served via public folder symlinks)
        else if (track.url.startsWith('/')) {
          resolvedUrl = track.url; // Browser will resolve to http://localhost:3000/music/...
        }
        // Otherwise, make it relative to server root
        else {
          resolvedUrl = `/${track.url}`;
        }

        return { ...track, url: resolvedUrl };
      });

      const normalizedPlaylist: Playlist = {
        title: rawData.title,
        tracks: tracksWithResolvedUrls
      };

      setPlaylist(normalizedPlaylist);
      setSequence([]);
      setActiveIndex(-1);

      // Pre-load all tracks
      const urls = tracksWithResolvedUrls.map(t => t.url);
      await playerRef.current.preloadTracks(urls);

      setIsLoading(false);
    } catch (error) {
      console.error('Error loading playlist:', error);
      alert('Failed to load playlist. Check console for details.');
      setIsLoading(false);
    }
  };

  /**
   * Handle track click - add to sequence and play transition
   */
  const handleTrackClick = async (track: Track) => {
    // Allow undo even when playing
    if (sequence.length > 0 && sequence[sequence.length - 1] === track.url) {
      playerRef.current.stop();
      setSequence(sequence.slice(0, -1));
      return;
    }

    // Don't allow adding new tracks while replaying or playing
    if (isReplaying || playerRef.current.isPlaying) return;

    // Prevent adding duplicates
    if (sequence.includes(track.url)) {
      return;
    }

    const newSequence = [...sequence, track.url];
    setSequence(newSequence);

    try {
      if (newSequence.length === 1) {
        // First track - play ending only
        await playerRef.current.playEnding(track.url);
      } else {
        // Subsequent tracks - play transition
        const previousUrl = newSequence[newSequence.length - 2];
        await playerRef.current.playTransition(previousUrl, track.url);
      }
    } catch (error) {
      console.error('Playback error:', error);
    }
  };

  /**
   * Replay the entire sequence
   */
  const handleReplay = async () => {
    if (sequence.length === 0) return;

    setIsReplaying(true);
    setActiveIndex(0);

    await playerRef.current.playSequence(sequence, (index) => {
      setActiveIndex(index);
    });

    setIsReplaying(false);
    setActiveIndex(-1);
  };

  /**
   * Clear the sequence
   */
  const handleClear = () => {
    setSequence([]);
    setActiveIndex(-1);
    playerRef.current.stop();
  };

  /**
   * Save the sequence as a new playlist
   */
  const handleSave = () => {
    if (!playlist || sequence.length === 0) return;

    const orderedTracks = sequence.map(url =>
      playlist.tracks.find(t => t.url === url)!
    );

    const newPlaylist: Playlist = {
      title: `${playlist.title} - Sequenced`,
      tracks: orderedTracks
    };

    const blob = new Blob([JSON.stringify(newPlaylist, null, 2)], {
      type: 'application/json'
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${playlist.title}-sequenced.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const playingTrack = playingUrl
    ? playlist?.tracks.find(t => t.url === playingUrl)
    : null;
  const playingTitle = playingTrack ? `▶ ${playingTrack.title}` : null;

  // Hovering a track takes precedence over the currently playing one
  const footerTitle = hoveredTitle ?? playingTitle;

  return (
    <div className="app">
      <header className="header">
        <h1>Sequence Builder</h1>
        <div className="controls">
          <label className="file-input-label">
            Load Playlist
            <input
              type="file"
              accept=".json"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
          </label>

          {playlist && (
            <>
              <button onClick={() => setShowTrackList(true)}>
                Tracks
              </button>
              <button onClick={handleClear} disabled={sequence.length === 0}>
                Clear
              </button>
              <button
                onClick={handleReplay}
                disabled={sequence.length === 0 || isReplaying}
              >
                {isReplaying ? 'Playing...' : 'Replay'}
              </button>
              <button onClick={handleSave} disabled={sequence.length === 0}>
                Save
              </button>
              <span className="sequence-count">
                Sequence: {sequence.length} tracks
              </span>
            </>
          )}
        </div>
      </header>

      <main className="main">
        {isLoading && (
          <div className="loading">Loading tracks...</div>
        )}

        {playlist && !isLoading && (
          <TrackGrid
            tracks={playlist.tracks}
            sequence={sequence}
            activeIndex={activeIndex}
            playingUrl={playingUrl}
            playProgress={playProgress}
            playingSegment={playingSegment}
            onTrackClick={handleTrackClick}
            onTrackHover={setHoveredTitle}
          />
        )}

        {!playlist && !isLoading && (
          <div className="welcome">
            <p>Load a playlist JSON file to begin</p>
          </div>
        )}
      </main>

      {playlist && showTrackList && (
        <TrackListPopup
          tracks={playlist.tracks}
          sequence={sequence}
          onTrackClick={handleTrackClick}
          onClose={() => setShowTrackList(false)}
        />
      )}

      {footerTitle && (
        <footer className="footer">
          {footerTitle}
        </footer>
      )}
    </div>
  );
}

export default App;
