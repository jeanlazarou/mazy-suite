import { Track as TrackType } from '../types';
import { useStore } from '../store';
import { TrackClipBlock } from './TrackClipBlock';
import { VolumeKnob } from './VolumeKnob';

interface TrackProps {
  track: TrackType;
  pixelsPerSecond: number;
  maxDuration: number;
  renderMode?: 'controls' | 'timeline' | 'both';
}

export function Track({ track, pixelsPerSecond, maxDuration, renderMode = 'both' }: TrackProps) {
  const { updateTrack, removeTrack, addClipToTrack } = useStore();

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const clipId = e.dataTransfer.getData('clipId');
    if (!clipId) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;

    // For clips from the library, position by left edge (no offset)
    // This makes sense since library elements have different visual width than track elements
    const position = Math.max(0, x / pixelsPerSecond);

    addClipToTrack(track.id, clipId, position);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleVolumeChange = (value: number) => {
    updateTrack(track.id, { volume: value });
  };

  const handleMuteToggle = () => {
    updateTrack(track.id, { muted: !track.muted });
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateTrack(track.id, { name: e.target.value });
  };

  // Render only controls
  if (renderMode === 'controls') {
    return (
      <div className="p-2 border-b border-gray-700 h-[6.3rem] flex flex-col gap-2">
        <input
          type="text"
          value={track.name}
          onChange={handleNameChange}
          className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm"
        />

        <div className="flex items-center gap-2 justify-between">
          <button
            onClick={handleMuteToggle}
            className={`px-2 py-1 rounded text-xs font-semibold ${
              track.muted
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-gray-700 hover:bg-gray-600'
            }`}
            title={track.muted ? 'Unmute' : 'Mute'}
          >
            {track.muted ? (
              // Muted icon (speaker with X)
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <line x1="23" y1="9" x2="17" y2="15" />
                <line x1="17" y1="9" x2="23" y2="15" />
              </svg>
            ) : (
              // Unmuted icon (speaker with sound waves)
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
              </svg>
            )}
          </button>

          <VolumeKnob value={track.volume} onChange={handleVolumeChange} size={36} />

          <button
            onClick={() => removeTrack(track.id)}
            className="text-red-500 hover:text-red-400 p-1"
            title="Delete Track"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 6h18" />
              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
              <line x1="10" y1="11" x2="10" y2="17" />
              <line x1="14" y1="11" x2="14" y2="17" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  // Render only timeline
  if (renderMode === 'timeline') {
    return (
      <div
        className="relative h-[6.3rem] bg-gray-900 border-b border-gray-700"
        data-track-id={track.id}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        style={{ minWidth: `${maxDuration * pixelsPerSecond}px` }}
      >
        {track.clips.map((trackClip) => (
          <TrackClipBlock
            key={trackClip.id}
            trackId={track.id}
            trackClip={trackClip}
            pixelsPerSecond={pixelsPerSecond}
          />
        ))}
      </div>
    );
  }

  // Render both (legacy, not used in new layout)
  return (
    <div className="flex border-b border-gray-700">
      {/* Track controls */}
      <div className="w-48 bg-gray-800 p-2 border-r border-gray-700 flex flex-col gap-2 flex-shrink-0">
        <input
          type="text"
          value={track.name}
          onChange={handleNameChange}
          className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm"
        />

        <div className="flex items-center gap-2 justify-between">
          <button
            onClick={handleMuteToggle}
            className={`px-2 py-1 rounded text-xs font-semibold ${
              track.muted
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-gray-700 hover:bg-gray-600'
            }`}
            title={track.muted ? 'Unmute' : 'Mute'}
          >
            {track.muted ? (
              // Muted icon (speaker with X)
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <line x1="23" y1="9" x2="17" y2="15" />
                <line x1="17" y1="9" x2="23" y2="15" />
              </svg>
            ) : (
              // Unmuted icon (speaker with sound waves)
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
              </svg>
            )}
          </button>

          <VolumeKnob value={track.volume} onChange={handleVolumeChange} size={36} />

          <button
            onClick={() => removeTrack(track.id)}
            className="text-red-500 hover:text-red-400 p-1"
            title="Delete Track"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 6h18" />
              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
              <line x1="10" y1="11" x2="10" y2="17" />
              <line x1="14" y1="11" x2="14" y2="17" />
            </svg>
          </button>
        </div>
      </div>

      {/* Track timeline */}
      <div
        className="flex-1 relative h-[6.3rem] bg-gray-900"
        data-track-id={track.id}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        style={{ minWidth: `${maxDuration * pixelsPerSecond}px` }}
      >
        {track.clips.map((trackClip) => (
          <TrackClipBlock
            key={trackClip.id}
            trackId={track.id}
            trackClip={trackClip}
            pixelsPerSecond={pixelsPerSecond}
          />
        ))}
      </div>
    </div>
  );
}
