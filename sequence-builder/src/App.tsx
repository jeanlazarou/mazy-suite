import { useState, useRef, useEffect } from 'react';
import { Album, Track, Playlist, RawPlaylist } from './types';
import { loadAlbums, loadAlbum } from './api';
import TrackGrid from './TrackGrid';
import TrackListPopup from './TrackListPopup';
import SequencePlayer from './SequencePlayer';
import PreviewDial, { MIN_PREVIEW, MAX_PREVIEW } from './PreviewDial';

const PREVIEW_KEY = 'sequence-builder:preview-seconds';

function savedPreviewSeconds(): number {
  try {
    const s = Number(localStorage.getItem(PREVIEW_KEY));
    if (Number.isInteger(s) && s >= MIN_PREVIEW && s <= MAX_PREVIEW) return s;
  } catch {
    // storage unavailable: use the default
  }
  return 10;
}

function App() {
  const [previewSeconds, setPreviewSeconds] = useState(savedPreviewSeconds);
  const [albums, setAlbums] = useState<Album[] | null>(null);
  const [albumsError, setAlbumsError] = useState<string | null>(null);
  const [albumName, setAlbumName] = useState('');
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

  useEffect(() => {
    playerRef.current.previewSeconds = previewSeconds;
    try {
      localStorage.setItem(PREVIEW_KEY, String(previewSeconds));
    } catch {
      // not remembered, still applied
    }
  }, [previewSeconds]);

  useEffect(() => {
    loadAlbums()
      .then(list => {
        setAlbums(list);
        // the album shown last is in the URL, so a reload keeps it
        const name = decodeURIComponent(window.location.hash.replace(/^#album=/, ''));
        if (list.some(a => a.name === name)) selectAlbum(name);
      })
      .catch(error => {
        console.error('Error loading albums:', error);
        setAlbumsError('Could not read albums.json — is the suite data linked? (scripts/link_data.sh)');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Load an album from the suite's albums and pre-load its segments
   */
  const selectAlbum = async (name: string) => {
    if (!name) return;

    const player = playerRef.current;
    player.stop();
    player.clearCache();

    setAlbumName(name);
    setSequence([]);
    setActiveIndex(-1);
    setIsReplaying(false);
    window.history.replaceState(null, '', `#album=${encodeURIComponent(name)}`);

    try {
      setIsLoading(true);
      const album = await loadAlbum(name);
      setPlaylist(album);
      await player.preloadTracks(album.tracks.map(t => t.url));
    } catch (error) {
      console.error('Error loading album:', error);
      alert('Failed to load album. Check console for details.');
      setPlaylist(null);
    } finally {
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

    // Same shape as the suite's album files, with the urls as they were written there
    const orderedTracks = sequence.map(url => {
      const { sourceUrl, ...track } = playlist.tracks.find(t => t.url === url)!;
      return { ...track, url: sourceUrl ?? track.url };
    });

    const newPlaylist: RawPlaylist = {
      title: `${playlist.title} - Sequenced`,
      playlist: orderedTracks
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
          <PreviewDial seconds={previewSeconds} onChange={setPreviewSeconds} />
          {albums && albums.length > 0 && (
            <select
              className="album-select"
              value={albumName}
              onChange={e => selectAlbum(e.target.value)}
              disabled={isLoading}
            >
              <option value="" disabled>Choose an album…</option>
              {albums.map(a => (
                <option key={a.name} value={a.name}>{a.title}</option>
              ))}
            </select>
          )}

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
          albums && albums.length > 0 ? (
            <div className="album-grid">
              {albums.map(a => (
                <button
                  key={a.name}
                  className="album-card"
                  onClick={() => selectAlbum(a.name)}
                  style={a.color ? { borderColor: a.color } : undefined}
                >
                  <img src={a.cover} alt="" loading="lazy" />
                  <span className="album-title">{a.title}</span>
                  <span className="album-count">{a.trackCount} tracks</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="welcome">
              <p>{albumsError ?? (albums ? 'No albums in albums.json' : 'Reading albums…')}</p>
            </div>
          )
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
