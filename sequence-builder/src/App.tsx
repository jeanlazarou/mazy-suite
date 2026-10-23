import { useState, useRef, useEffect, useMemo } from 'react';
import { Album, DisplayedTrack, Track, Playlist, RawPlaylist } from './types';
import { loadAlbums, loadAlbum } from './api';
import TrackGrid, { TryMode } from './TrackGrid';
import TrackListPopup from './TrackListPopup';
import SequencesPopup from './SequencesPopup';
import { SavedSequence, listSequences } from './savedSequences';
import SequencePlayer from './SequencePlayer';
import PreviewDial, { MIN_PREVIEW, MAX_PREVIEW } from './PreviewDial';

const PREVIEW_KEY = 'sequence-builder:preview-seconds';

const ORDER_KEY = 'sequence-builder:grid-order';

/** The grid shows the album's order, or the sequence first in its order */
type GridOrder = 'album' | 'sequence';

function savedGridOrder(): GridOrder {
  try {
    return localStorage.getItem(ORDER_KEY) === 'sequence' ? 'sequence' : 'album';
  } catch {
    return 'album';
  }
}

/** What is playing: a click while building, one transition, the replay, a run of transitions */
type Playing = 'build' | 'transition' | 'replay' | 'audition';

function savedPreviewSeconds(): number {
  try {
    const s = Number(localStorage.getItem(PREVIEW_KEY));
    if (Number.isInteger(s) && s >= MIN_PREVIEW && s <= MAX_PREVIEW) return s;
  } catch {
    // storage unavailable: use the default
  }
  return 10;
}

/** A random order of the items (Fisher–Yates) */
function shuffled<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function App() {
  const [previewSeconds, setPreviewSeconds] = useState(savedPreviewSeconds);
  const [gridOrder, setGridOrder] = useState<GridOrder>(savedGridOrder);
  const [albums, setAlbums] = useState<Album[] | null>(null);
  const [albumsError, setAlbumsError] = useState<string | null>(null);
  const [albumName, setAlbumName] = useState('');
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [sequence, setSequence] = useState<string[]>([]);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const [hoveredTitle, setHoveredTitle] = useState<string | null>(null);
  const [playing, setPlaying] = useState<Playing | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [playingUrl, setPlayingUrl] = useState<string | null>(null);
  const [playProgress, setPlayProgress] = useState(0);
  const [playingSegment, setPlayingSegment] = useState<'start' | 'end' | null>(null);
  const [showTrackList, setShowTrackList] = useState(false);
  const [showSequences, setShowSequences] = useState(false);
  /** A run of transitions: one track's ending into each candidate's beginning */
  const [audition, setAudition] = useState<{ source: string; candidates: string[]; index: number } | null>(null);
  /** Sequence index whose transition into it was asked for by its arrow */
  const [transitionTo, setTransitionTo] = useState<number | null>(null);
  /** Name the sequence was last saved or loaded under */
  const [sequenceName, setSequenceName] = useState<string | null>(null);

  const playerRef = useRef<SequencePlayer>(new SequencePlayer());
  const runId = useRef(0);

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
    try {
      localStorage.setItem(ORDER_KEY, gridOrder);
    } catch {
      // not remembered, still applied
    }
  }, [gridOrder]);

  // The tracks as the grid shows them: the album's order, or the sequence
  // first, in its order, then the others in the album's order
  const displayed = useMemo<DisplayedTrack[]>(() => {
    const all = (playlist?.tracks ?? []).map((track, index) => ({ track, index }));
    if (gridOrder === 'album') return all;
    const byUrl = new Map(all.map(d => [d.track.url, d]));
    return [
      ...sequence.map(url => byUrl.get(url)!).filter(Boolean),
      ...all.filter(d => !sequence.includes(d.track.url))
    ];
  }, [playlist, sequence, gridOrder]);

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

  // Esc stops whatever plays
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') stopAll();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Play something, marking what plays until it ends. A play that was
   * stopped, or replaced by a newer one, leaves the newer state alone.
   */
  const run = async (kind: Playing, play: () => Promise<void>) => {
    const id = ++runId.current;
    setPlaying(kind);
    try {
      await play();
    } catch (error) {
      console.error('Playback error:', error);
    } finally {
      if (runId.current === id) {
        setPlaying(null);
        setActiveIndex(-1);
      }
    }
  };

  /**
   * Stop whatever plays
   */
  const stopAll = () => {
    runId.current++;
    playerRef.current.stop();
    setPlaying(null);
    setActiveIndex(-1);
    setAudition(null);
  };

  /** The run of transitions playing, if one is */
  const auditioning = playing === 'audition' ? audition : null;

  /**
   * Load an album from the suite's albums and pre-load its segments
   */
  const selectAlbum = async (name: string) => {
    if (!name) return;

    const player = playerRef.current;
    stopAll();
    player.clearCache();

    setAlbumName(name);
    setSequence([]);
    setSequenceName(null);
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
    // During a run of transitions, a click picks the track to follow the
    // source: put right after it (the source joining the sequence first if
    // needed). Nothing replays -- it was just heard.
    if (auditioning) {
      const { source } = auditioning;
      stopAll();
      if (track.url === source) return;
      const next = sequence.filter(url => url !== track.url);
      if (!next.includes(source)) next.push(source);
      next.splice(next.indexOf(source) + 1, 0, track.url);
      setSequence(next);
      return;
    }

    // Allow undo even when playing
    if (sequence.length > 0 && sequence[sequence.length - 1] === track.url) {
      stopAll();
      setSequence(sequence.slice(0, -1));
      return;
    }

    // Don't allow adding new tracks while replaying or playing
    if (playing) return;

    // Prevent adding duplicates
    if (sequence.includes(track.url)) {
      return;
    }

    const newSequence = [...sequence, track.url];
    setSequence(newSequence);

    const player = playerRef.current;
    await run('build', () =>
      newSequence.length === 1
        ? player.playEnding(track.url) // first track: its ending only
        : player.playTransition(newSequence[newSequence.length - 2], track.url)
    );
  };

  /**
   * Replay the entire sequence
   */
  const handleReplay = async () => {
    if (sequence.length === 0) return;

    setActiveIndex(0);
    await run('replay', () => playerRef.current.playSequence(sequence, setActiveIndex));
  };

  /**
   * Play one transition of the sequence (from its arrow): `to - 1` into `to`
   */
  const handlePlayTransition = async (to: number) => {
    stopAll();
    setTransitionTo(to);
    await run('transition', () => playerRef.current.playTransition(sequence[to - 1], sequence[to]));
  };

  /**
   * Try a track's ending into the beginning of the others, one after the
   * other, in the grid's order: all of them, or those not in the sequence
   */
  const handleTryFrom = async (source: string, mode: TryMode) => {
    const candidates = displayed
      .map(d => d.track.url)
      .filter(url => url !== source && (mode === 'all' || !sequence.includes(url)));
    if (candidates.length === 0) return;

    stopAll();
    setAudition({ source, candidates, index: 0 });
    await run('audition', () =>
      playerRef.current.playTransitionsFrom(source, candidates, index =>
        setAudition(a => a && { ...a, index })
      )
    );
  };

  /**
   * Shuffle the sequence, or make a random one of all the tracks when it
   * is empty
   */
  const handleShuffle = () => {
    if (!playlist) return;

    const source = sequence.length > 0 ? sequence : playlist.tracks.map(t => t.url);
    let next = shuffled(source);
    // a shuffle that gives the same order back looks like a broken button
    while (sequence.length > 1 && next.every((url, i) => url === sequence[i])) {
      next = shuffled(source);
    }

    stopAll();
    setSequence(next);
  };

  /**
   * Clear the sequence
   */
  const handleClear = () => {
    stopAll();
    setSequence([]);
    setSequenceName(null);
  };

  /** The sequence as the album writes its track urls (how it is saved) */
  const sequenceSources = (urls: string[]) =>
    urls.map(url => playlist?.tracks.find(t => t.url === url)?.sourceUrl ?? url);

  /**
   * Replace the sequence by a saved one. Asks first when the current
   * sequence would be lost, i.e. it is not one of the saved ones.
   */
  const handleLoadSaved = (saved: SavedSequence) => {
    if (!playlist) return;

    const current = sequenceSources(sequence).join('\n');
    const isSaved = listSequences(albumName).some(s => s.tracks.join('\n') === current);
    if (sequence.length > 0 && !isSaved &&
        !window.confirm(`Replace the current sequence (${sequence.length} tracks)? It is not saved.`)) {
      return;
    }

    const bySource = new Map(playlist.tracks.map(t => [t.sourceUrl ?? t.url, t.url]));
    const urls = Array.from(new Set(saved.tracks.map(u => bySource.get(u)).filter((u): u is string => !!u)));

    stopAll();
    setSequence(urls);
    setSequenceName(saved.name);
    setShowSequences(false);

    const dropped = saved.tracks.length - urls.length;
    if (dropped > 0) {
      window.alert(`${dropped} track${dropped > 1 ? 's' : ''} of "${saved.name}" ` +
        `${dropped > 1 ? 'are' : 'is'} no longer in this album and ${dropped > 1 ? 'were' : 'was'} left out.`);
    }
  };

  /**
   * Export the sequence as a new playlist file
   */
  const handleExport = () => {
    if (!playlist || sequence.length === 0) return;

    // Same shape as the suite's album files, with the urls as they were written there
    const orderedTracks = sequence.map(url => {
      const { sourceUrl, ...track } = playlist.tracks.find(t => t.url === url)!;
      return { ...track, url: sourceUrl ?? track.url };
    });

    const newPlaylist: RawPlaylist = {
      title: `${playlist.title} - ${sequenceName ?? 'Sequenced'}`,
      playlist: orderedTracks
    };

    const blob = new Blob([JSON.stringify(newPlaylist, null, 2)], {
      type: 'application/json'
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = sequenceName ? `${newPlaylist.title}.json` : `${playlist.title}-sequenced.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const playingTrack = playingUrl
    ? playlist?.tracks.find(t => t.url === playingUrl)
    : null;
  const playingTitle = playingTrack ? `▶ ${playingTrack.title}` : null;

  // Hovering a track takes precedence over the currently playing one
  const footerTitle = hoveredTitle ?? playingTitle;

  const titleOf = (url: string) => playlist?.tracks.find(t => t.url === url)?.title ?? url;

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
              <button
                onClick={() => setGridOrder(gridOrder === 'album' ? 'sequence' : 'album')}
                aria-pressed={gridOrder === 'sequence'}
                title="Show the tracks in the album's order, or the sequence first in its order"
              >
                Order: {gridOrder === 'album' ? 'Album' : 'Sequence'}
              </button>
              <button
                onClick={handleShuffle}
                title={sequence.length > 0 ? 'Shuffle the sequence' : 'A random sequence of all the tracks'}
              >
                Shuffle
              </button>
              <button onClick={handleClear} disabled={sequence.length === 0}>
                Clear
              </button>
              {playing ? (
                <button onClick={stopAll} title="Stop (Esc)">
                  ■ Stop
                </button>
              ) : (
                <button onClick={handleReplay} disabled={sequence.length === 0}>
                  Replay
                </button>
              )}
              <button onClick={() => setShowSequences(true)} title="Save the sequence by name, or load a saved one">
                Sequences
              </button>
              <button
                onClick={handleExport}
                disabled={sequence.length === 0}
                title="Download the sequence as a playlist file"
              >
                Export
              </button>
              <span className="sequence-count">
                Sequence: {sequence.length} track{sequence.length === 1 ? '' : 's'}
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
            items={displayed}
            total={playlist.tracks.length}
            sequence={sequence}
            activeUrl={auditioning
              ? auditioning.candidates[auditioning.index]
              : activeIndex >= 0 ? sequence[activeIndex] : null}
            sourceUrl={auditioning?.source ?? null}
            inSequenceOrder={gridOrder === 'sequence'}
            litArrow={playing === 'transition' ? transitionTo : null}
            playingUrl={playingUrl}
            playProgress={playProgress}
            playingSegment={playingSegment}
            onTrackClick={handleTrackClick}
            onTrackHover={setHoveredTitle}
            onPlayTransition={handlePlayTransition}
            onTryFrom={handleTryFrom}
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
          items={displayed}
          total={playlist.tracks.length}
          sequence={sequence}
          onTrackClick={handleTrackClick}
          onClose={() => setShowTrackList(false)}
        />
      )}

      {playlist && showSequences && (
        <SequencesPopup
          album={albumName}
          albumTitle={playlist.title}
          current={sequenceSources(sequence)}
          currentName={sequenceName}
          onSaved={setSequenceName}
          onLoad={handleLoadSaved}
          onClose={() => setShowSequences(false)}
        />
      )}

      {auditioning ? (
        <footer className="footer run-bar">
          <span className="run-pair">
            <strong>{titleOf(auditioning.source)}</strong>
            {' → '}
            <strong>{titleOf(auditioning.candidates[auditioning.index])}</strong>
          </span>
          <span className="run-count">
            {auditioning.index + 1} / {auditioning.candidates.length}
          </span>
          <button onClick={() => playerRef.current.skip()} title="Next candidate">
            Skip ⏭
          </button>
          <span className="run-hint">Click a tile to pick it · Esc stops</span>
        </footer>
      ) : footerTitle && (
        <footer className="footer">
          {footerTitle}
        </footer>
      )}
    </div>
  );
}

export default App;
