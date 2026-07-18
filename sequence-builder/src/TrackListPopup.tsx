import React from 'react';
import { Track } from './types';
import { trackColor } from './trackColor';

interface TrackListPopupProps {
  tracks: Track[];
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
function TrackListPopup({ tracks, sequence, onTrackClick, onClose }: TrackListPopupProps) {
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
          {tracks.map((track, index) => {
            const sequenceNumber = getSequenceNumber(track.url);

            return (
              <li
                key={track.url}
                className="track-list-item"
                onClick={() => onTrackClick(track)}
              >
                <span
                  className="track-swatch"
                  style={{ backgroundColor: trackColor(index, tracks.length) }}
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
