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
  playingUrl: string | null;
  playProgress: number;
  playingSegment: 'start' | 'end' | null;
  onTrackClick: (track: Track) => void;
  onTrackHover: (title: string | null) => void;
}

/**
 * TrackGrid Component
 *
 * Displays all tracks in a responsive grid, in the order given
 */
function TrackGrid({ items, total, sequence, activeIndex, playingUrl, playProgress, playingSegment, onTrackClick, onTrackHover }: TrackGridProps) {
  /**
   * Get sequence number for a track (1-based, or null if not in sequence)
   */
  const getSequenceNumber = (trackUrl: string): number | null => {
    const index = sequence.findIndex(url => url === trackUrl);
    return index >= 0 ? index + 1 : null;
  };

  return (
    <div className="track-grid">
      {items.map(({ track, index }) => {
        const isActive = activeIndex >= 0 && sequence[activeIndex] === track.url;
        const sequenceNumber = getSequenceNumber(track.url);

        return (
          <TrackTile
            key={track.url}
            track={track}
            color={trackColor(index, total)}
            sequenceNumber={sequenceNumber}
            isActive={isActive}
            progress={playingUrl === track.url ? playProgress : null}
            playingSegment={playingUrl === track.url ? playingSegment : null}
            onClick={onTrackClick}
            onHover={onTrackHover}
          />
        );
      })}
    </div>
  );
}

export default TrackGrid;
