import { Fragment } from 'react';
import { DisplayedTrack, Track } from './types';
import TrackTile from './TrackTile';
import { trackColor } from './trackColor';

interface TrackGridProps {
  /** The tracks in display order */
  items: DisplayedTrack[];
  /** Number of tracks in the album (for the colors) */
  total: number;
  sequence: string[];
  activeIndex: number;
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
}

/**
 * TrackGrid Component
 *
 * Displays all tracks in a responsive grid, in the order given
 */
function TrackGrid({
  items, total, sequence, activeIndex, inSequenceOrder, litArrow,
  playingUrl, playProgress, playingSegment, onTrackClick, onTrackHover, onPlayTransition
}: TrackGridProps) {
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
        const isActive = activeIndex >= 0 && sequence[activeIndex] === track.url;
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
                progress={playingUrl === track.url ? playProgress : null}
                playingSegment={playingUrl === track.url ? playingSegment : null}
                onClick={onTrackClick}
                onHover={onTrackHover}
              />
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}

export default TrackGrid;
