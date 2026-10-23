import React, { useState } from 'react';
import { Track } from './types';

interface TrackTileProps {
  track: Track;
  color: string;
  sequenceNumber: number | null;
  isActive: boolean;
  /** The track a run of transitions starts from */
  isSource: boolean;
  /** Its menu of runs is open, so its button stays shown */
  tryOpen: boolean;
  progress: number | null;
  playingSegment: 'start' | 'end' | null;
  onClick: (track: Track) => void;
  onHover: (title: string | null) => void;
  /** Open or close the menu of runs of transitions from this track */
  onTryClick: (button: HTMLButtonElement) => void;
}

/**
 * TrackTile Component
 *
 * Displays a single track as a colored tile
 */
function TrackTile({ track, color, sequenceNumber, isActive, isSource, tryOpen, progress, playingSegment, onClick, onHover, onTryClick }: TrackTileProps) {
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
    ...(isSource && { outline: '3px dashed #fff', outlineOffset: '3px' }),
  };

  return (
    <div
      className="track-tile"
      aria-label={track.title}
      style={tileStyle}
      onClick={() => onClick(track)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        className={`try-button${isSource || tryOpen ? ' shown' : ''}`}
        onClick={e => {
          e.stopPropagation(); // not a click on the tile
          onTryClick(e.currentTarget);
        }}
        title="Try this track's ending into other tracks"
        aria-label={`Try transitions from ${track.title}`}
        aria-expanded={tryOpen}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          {/* one track (the dot) fanning out into three */}
          <circle cx="5" cy="12" r="2.4" className="fill" />
          <path d="M8 11l10-5M8 12h11M8 13l10 5" />
          <circle cx="19.5" cy="5.5" r="1.6" className="fill" />
          <circle cx="20.5" cy="12" r="1.6" className="fill" />
          <circle cx="19.5" cy="18.5" r="1.6" className="fill" />
        </svg>
      </button>
      {sequenceNumber !== null && (
        <div className="sequence-number">{sequenceNumber}</div>
      )}
      {progress !== null && (
        <div className={`progress-track ${playingSegment === 'end' ? 'from-right' : ''}`}>
          <div
            className="progress-fill"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      )}
    </div>
  );
}

export default TrackTile;
