import { Fragment, useEffect, useState } from 'react';
import { DisplayedTrack, Track } from './types';
import TrackTile from './TrackTile';
import { trackColor } from './trackColor';

/** A run of transitions tries the track against all others, or only those not in the sequence */
export type TryMode = 'all' | 'remaining';

interface TrackGridProps {
  /** The tracks in display order */
  items: DisplayedTrack[];
  /** Number of tracks in the album (for the colors) */
  total: number;
  sequence: string[];
  /** URL of the highlighted track: the one playing in the replay, or the candidate being tried */
  activeUrl: string | null;
  /** URL of the track a run of transitions starts from */
  sourceUrl: string | null;
  /**
   * The grid shows the sequence first, in its order: arrows between its
   * tracks play their transition, and a divider ends it
   */
  inSequenceOrder: boolean;
  /** Sequence index of the track whose transition into it is playing, lighting its arrow */
  litArrow: number | null;
  playingUrl: string | null;
  playProgress: number;
  playingSegment: 'start' | 'end' | null;
  onTrackClick: (track: Track) => void;
  onTrackHover: (title: string | null) => void;
  /** Play the transition from sequence index `to - 1` into `to` */
  onPlayTransition: (to: number) => void;
  /** Try `url`'s ending into the beginning of others, one after another */
  onTryFrom: (url: string, mode: TryMode) => void;
}

/**
 * TrackGrid Component
 *
 * Displays all tracks in a responsive grid, in the order given
 */
function TrackGrid({
  items, total, sequence, activeUrl, sourceUrl, inSequenceOrder, litArrow,
  playingUrl, playProgress, playingSegment, onTrackClick, onTrackHover, onPlayTransition, onTryFrom
}: TrackGridProps) {
  // The open menu of runs: its track, and whether it opens leftwards (a
  // tile on the right half would push it out of the page)
  const [menu, setMenu] = useState<{ url: string; alignRight: boolean } | null>(null);

  useEffect(() => {
    if (!menu) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!(e.target as Element).closest('.try-menu, .try-button')) setMenu(null);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(null);
    };
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [menu]);

  const toggleMenu = (url: string, button: HTMLButtonElement) => {
    const { left } = button.getBoundingClientRect();
    setMenu(menu?.url === url ? null : { url, alignRight: left > window.innerWidth / 2 });
  };

  const choose = (url: string, mode: TryMode) => {
    setMenu(null);
    onTryFrom(url, mode);
  };

  /**
   * Get sequence number for a track (1-based, or null if not in sequence)
   */
  const getSequenceNumber = (trackUrl: string): number | null => {
    const index = sequence.findIndex(url => url === trackUrl);
    return index >= 0 ? index + 1 : null;
  };

  // In sequence order the first sequence.length items are the sequence
  const sequenced = inSequenceOrder ? sequence.length : 0;

  return (
    <div className={`track-grid${inSequenceOrder ? ' sequence-order' : ''}`}>
      {items.map(({ track, index }, position) => {
        const isActive = activeUrl === track.url;
        const sequenceNumber = getSequenceNumber(track.url);
        const hasArrow = position > 0 && position < sequenced;

        return (
          <Fragment key={track.url}>
            {position === sequenced && sequenced > 0 && (
              <div className="sequence-divider">Not in the sequence</div>
            )}
            <div className="tile-slot">
              {hasArrow && (
                <button
                  className={`transition-arrow${litArrow === position ? ' lit' : ''}`}
                  onClick={() => onPlayTransition(position)}
                  title={`Play transition ${position} → ${position + 1}`}
                  aria-label={`Play transition ${position} → ${position + 1}`}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M3 12h16M13 6l6 6-6 6" />
                  </svg>
                </button>
              )}
              <TrackTile
                track={track}
                color={trackColor(index, total)}
                sequenceNumber={sequenceNumber}
                isActive={isActive}
                isSource={sourceUrl === track.url}
                tryOpen={menu?.url === track.url}
                progress={playingUrl === track.url ? playProgress : null}
                playingSegment={playingUrl === track.url ? playingSegment : null}
                onClick={onTrackClick}
                onHover={onTrackHover}
                onTryClick={button => toggleMenu(track.url, button)}
              />
              {menu?.url === track.url && (() => {
                const others = items.length - 1;
                const remaining = items.filter(d => d.track.url !== track.url && !sequence.includes(d.track.url)).length;
                return (
                  <div className={`try-menu${menu.alignRight ? ' align-right' : ''}`} role="menu">
                    <div className="try-menu-title">Try “{track.title}” into…</div>
                    <button role="menuitem" onClick={() => choose(track.url, 'all')} disabled={others === 0}>
                      All other tracks ({others})
                    </button>
                    <button role="menuitem" onClick={() => choose(track.url, 'remaining')} disabled={remaining === 0}>
                      Remaining tracks ({remaining})
                    </button>
                  </div>
                );
              })()}
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}

export default TrackGrid;
