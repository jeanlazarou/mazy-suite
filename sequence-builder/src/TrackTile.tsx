import React, { useState } from 'react';
import { Track } from './types';

interface TrackTileProps {
  track: Track;
  color: string;
  sequenceNumber: number | null;
  isActive: boolean;
  onClick: (track: Track) => void;
  onHover: (title: string | null) => void;
}

/**
 * TrackTile Component
 *
 * Displays a single track as a colored tile
 */
function TrackTile({ track, color, sequenceNumber, isActive, onClick, onHover }: TrackTileProps) {
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseEnter = () => {
    setIsHovered(true);
    onHover(track.title);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    onHover(null);
  };

  const tileStyle: React.CSSProperties = {
    backgroundColor: color,
    border: isActive ? '4px solid #fff' : '2px solid rgba(0,0,0,0.2)',
    boxShadow: isActive
      ? '0 0 20px rgba(255,255,255,0.8)'
      : isHovered
      ? '0 4px 12px rgba(0,0,0,0.3)'
      : '0 2px 4px rgba(0,0,0,0.2)',
    transform: isActive ? 'scale(1.05)' : isHovered ? 'scale(1.02)' : 'scale(1)',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  };

  return (
    <div
      className="track-tile"
      style={tileStyle}
      onClick={() => onClick(track)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {sequenceNumber !== null && (
        <div className="sequence-number">{sequenceNumber}</div>
      )}
    </div>
  );
}

export default TrackTile;
