import { useStore } from '../store';
import { Track } from './Track';
import { useRef, useEffect } from 'react';

export function Timeline() {
  const { tracks, clips, addTrack, pixelsPerSecond, setPixelsPerSecond } = useStore();
  const headerScrollRef = useRef<HTMLDivElement>(null);
  const tracksScrollRef = useRef<HTMLDivElement>(null);
  const controlsScrollRef = useRef<HTMLDivElement>(null);

  // Calculate maximum duration
  const maxDuration = Math.max(
    30, // Minimum 30 seconds
    ...tracks.flatMap((track) =>
      track.clips.map((tc) => {
        const clip = clips.find((c) => c.id === tc.clipId);
        if (!clip) return 0;
        const duration = tc.repeat && tc.repeatCount
          ? clip.duration * tc.repeatCount
          : clip.duration;
        return tc.position + duration;
      })
    )
  );

  // Generate time markers - major every 5 seconds, minor every 1 second
  const majorMarkers = [];
  const minorMarkers = [];
  for (let i = 0; i <= Math.ceil(maxDuration); i++) {
    if (i % 5 === 0) {
      majorMarkers.push(i);
    } else {
      minorMarkers.push(i);
    }
  }

  // Synchronize scroll between header and tracks (horizontal) and controls and tracks (vertical)
  useEffect(() => {
    const tracksScroll = tracksScrollRef.current;
    const headerScroll = headerScrollRef.current;
    const controlsScroll = controlsScrollRef.current;

    if (!tracksScroll || !headerScroll || !controlsScroll) return;

    const handleTracksScroll = () => {
      if (headerScroll) {
        headerScroll.scrollLeft = tracksScroll.scrollLeft;
      }
      if (controlsScroll) {
        controlsScroll.scrollTop = tracksScroll.scrollTop;
      }
    };

    const handleHeaderScroll = () => {
      if (tracksScroll) {
        tracksScroll.scrollLeft = headerScroll.scrollLeft;
      }
    };

    const handleControlsScroll = () => {
      if (tracksScroll) {
        tracksScroll.scrollTop = controlsScroll.scrollTop;
      }
    };

    tracksScroll.addEventListener('scroll', handleTracksScroll);
    headerScroll.addEventListener('scroll', handleHeaderScroll);
    controlsScroll.addEventListener('scroll', handleControlsScroll);

    return () => {
      tracksScroll.removeEventListener('scroll', handleTracksScroll);
      headerScroll.removeEventListener('scroll', handleHeaderScroll);
      controlsScroll.removeEventListener('scroll', handleControlsScroll);
    };
  }, []);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Timeline header with time markers */}
      <div className="flex border-b border-gray-700 bg-gray-800">
        <div className="w-48 border-r border-gray-700 p-2 flex items-center justify-between flex-shrink-0">
          <span className="text-sm font-semibold">Tracks</span>
          <button
            onClick={addTrack}
            className="px-2 py-1 bg-green-600 hover:bg-green-700 rounded text-xs"
          >
            + Track
          </button>
        </div>
        <div className="flex-1 relative overflow-x-auto" ref={headerScrollRef}>
          <div
            className="relative h-8 bg-gray-800"
            style={{ minWidth: `${maxDuration * pixelsPerSecond}px` }}
          >
            {/* Minor markers (every second) */}
            {minorMarkers.map((time) => (
              <div
                key={`minor-${time}`}
                className="absolute top-0 h-2 border-l border-gray-700"
                style={{ left: `${time * pixelsPerSecond}px` }}
              />
            ))}
            {/* Major markers (every 5 seconds) with labels */}
            {majorMarkers.map((time) => (
              <div
                key={`major-${time}`}
                className="absolute top-0 bottom-0 border-l border-gray-500"
                style={{ left: `${time * pixelsPerSecond}px` }}
              >
                <span className="text-xs text-gray-300 ml-1 font-semibold">{time}s</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Zoom controls */}
      <div className="flex items-center gap-2 p-2 border-b border-gray-700 bg-gray-800">
        <span className="text-xs">Zoom:</span>
        <input
          type="range"
          min="20"
          max="200"
          value={pixelsPerSecond}
          onChange={(e) => setPixelsPerSecond(parseInt(e.target.value))}
          className="w-32"
        />
        <span className="text-xs">{pixelsPerSecond}px/s</span>
      </div>

      {/* Tracks - split into fixed controls and scrollable timeline */}
      <div className="flex-1 flex overflow-hidden">
        {/* Track controls column (fixed) */}
        <div className="w-48 flex-shrink-0 overflow-y-auto bg-gray-800 border-r border-gray-700" ref={controlsScrollRef}>
          {tracks.map((track) => (
            <Track
              key={track.id}
              track={track}
              pixelsPerSecond={pixelsPerSecond}
              maxDuration={maxDuration}
              renderMode="controls"
            />
          ))}
        </div>

        {/* Track timelines column (scrollable) */}
        <div className="flex-1 overflow-auto" ref={tracksScrollRef}>
          {tracks.map((track) => (
            <Track
              key={track.id}
              track={track}
              pixelsPerSecond={pixelsPerSecond}
              maxDuration={maxDuration}
              renderMode="timeline"
            />
          ))}

          {tracks.length === 0 && (
            <div className="flex items-center justify-center h-full text-gray-500">
              <div className="text-center">
                <p>No tracks yet</p>
                <button
                  onClick={addTrack}
                  className="mt-2 px-4 py-2 bg-green-600 hover:bg-green-700 rounded"
                >
                  Add First Track
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
