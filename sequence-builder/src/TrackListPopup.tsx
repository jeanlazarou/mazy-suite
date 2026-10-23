import { DisplayedTrack, Track } from './types';
import { trackColor } from './trackColor';

interface TrackListPopupProps {
  /** The tracks in display order */
  items: DisplayedTrack[];
  /** Number of tracks in the album (for the colors) */
  total: number;
  sequence: string[];
  onTrackClick: (track: Track) => void;
  onClose: () => void;
}

/**
 * TrackListPopup Component
 *
 * Popup listing all tracks by title, each with a small color square
 * matching its tile in the grid. Clicking an entry behaves like
 * clicking the tile itself.
 */
function TrackListPopup({ items, total, sequence, onTrackClick, onClose }: TrackListPopupProps) {
  const getSequenceNumber = (trackUrl: string): number | null => {
    const index = sequence.findIndex(url => url === trackUrl);
    return index >= 0 ? index + 1 : null;
  };

  return (
    <div className="track-list-overlay" onClick={onClose}>
      <div className="track-list-popup" onClick={event => event.stopPropagation()}>
        <div className="track-list-header">
          <h2>Tracks</h2>
          <button className="track-list-close" onClick={onClose}>×</button>
        </div>
        <ul className="track-list">
          {items.map(({ track, index }) => {
            const sequenceNumber = getSequenceNumber(track.url);

            return (
              <li
                key={track.url}
                className="track-list-item"
                onClick={() => onTrackClick(track)}
              >
                <span
                  className="track-swatch"
                  style={{ backgroundColor: trackColor(index, total) }}
                />
                <span className="track-list-title">{track.title}</span>
                {sequenceNumber !== null && (
                  <span className="track-list-number">{sequenceNumber}</span>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

export default TrackListPopup;
