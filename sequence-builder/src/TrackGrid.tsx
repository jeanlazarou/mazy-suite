import React from 'react';
import { Track } from './types';
import TrackTile from './TrackTile';

interface TrackGridProps {
  tracks: Track[];
  sequence: string[];
  activeIndex: number;
  onTrackClick: (track: Track) => void;
  onTrackHover: (title: string | null) => void;
}

/**
 * TrackGrid Component
 *
 * Displays all tracks in a responsive grid
 */
function TrackGrid({ tracks, sequence, activeIndex, onTrackClick, onTrackHover }: TrackGridProps) {
  /**
   * Generate a color for a track based on its index
   */
  const getTrackColor = (index: number): string => {
    const hue = (index * 360 / tracks.length) % 360;
    return `hsl(${hue}, 70%, 60%)`;
  };

  /**
   * Get sequence number for a track (1-based, or null if not in sequence)
   */
  const getSequenceNumber = (trackUrl: string): number | null => {
    const index = sequence.findIndex(url => url === trackUrl);
    return index >= 0 ? index + 1 : null;
  };

  return (
    <div className="track-grid">
      {tracks.map((track, index) => {
        const isActive = activeIndex >= 0 && sequence[activeIndex] === track.url;
        const sequenceNumber = getSequenceNumber(track.url);

        return (
          <TrackTile
            key={track.url}
            track={track}
            color={getTrackColor(index)}
            sequenceNumber={sequenceNumber}
            isActive={isActive}
            onClick={onTrackClick}
            onHover={onTrackHover}
          />
        );
      })}
    </div>
  );
}

export default TrackGrid;
