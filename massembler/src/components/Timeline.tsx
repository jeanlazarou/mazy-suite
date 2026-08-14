import { useStore } from '../store';
import { Track } from './Track';
import { getProjectDuration } from '../utils/clipTiming';
import { useRef, useEffect, useState } from 'react';

/** Keep the playhead inside this band of the viewport while following. */
const FOLLOW_LEAD = 0.1;
const FOLLOW_TRAIL = 0.75;
/** Where the playhead lands after a follow scroll. */
const FOLLOW_REST = 0.25;

export function Timeline() {
  const { tracks, clips, addTrack, pixelsPerSecond, setPixelsPerSecond } = useStore();
  const headerScrollRef = useRef<HTMLDivElement>(null);
  const tracksScrollRef = useRef<HTMLDivElement>(null);
  const controlsScrollRef = useRef<HTMLDivElement>(null);
  const playheadTracksRef = useRef<HTMLDivElement>(null);
  const playheadHeaderRef = useRef<HTMLDivElement>(null);

  const [follow, setFollow] = useState(true);
  const [viewportWidth, setViewportWidth] = useState(0);
  const followRef = useRef(follow);
  followRef.current = follow;
  // Scroll events we caused ourselves, which must not count as the user
  // taking over. Timestamped because assigning scrollLeft fires the event
  // asynchronously.
  const selfScrollUntilRef = useRef(0);

  // Calculate maximum duration (minimum 30 seconds)
  const maxDuration = getProjectDuration(tracks, clips, 30);

  // Following can only ever do something if playback travels past the point
  // where the view starts scrolling. When the whole arrangement fits before
  // that, the checkbox would silently do nothing, so say so instead.
  const arrangementWidth = getProjectDuration(tracks, clips) * pixelsPerSecond;
  const followCanApply = arrangementWidth > viewportWidth * FOLLOW_TRAIL;

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

      // Scrolling by hand mid-playback means the user wants to look
      // somewhere else; stop dragging the view back and show that following
      // is off rather than silently fighting them.
      if (
        performance.now() > selfScrollUntilRef.current &&
        useStore.getState().playbackState.isPlaying
      ) {
        // Clear the ref too, not just the state: the follow check runs every
        // animation frame and would otherwise drag the view back once more
        // before the re-render lands.
        followRef.current = false;
        setFollow(false);
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

  // Track how wide the visible timeline is, to know whether following applies.
  useEffect(() => {
    const view = tracksScrollRef.current;
    if (!view) return;

    setViewportWidth(view.clientWidth);
    const observer = new ResizeObserver(() => setViewportWidth(view.clientWidth));
    observer.observe(view);
    return () => observer.disconnect();
  }, []);

  // Playhead position and follow-scrolling.
  //
  // currentTime is driven by requestAnimationFrame, so it changes ~60 times a
  // second. Subscribing to the store imperatively and moving the playhead
  // through refs keeps every track and clip block from re-rendering each
  // frame; only a transform changes.
  useEffect(() => {
    const place = (time: number) => {
      const x = time * pixelsPerSecond;
      const offset = `translateX(${x}px)`;
      if (playheadTracksRef.current) playheadTracksRef.current.style.transform = offset;
      if (playheadHeaderRef.current) playheadHeaderRef.current.style.transform = offset;
    };

    place(useStore.getState().playbackState.currentTime);

    let previousTime = -1;
    return useStore.subscribe((state) => {
      const { currentTime, isPlaying } = state.playbackState;
      if (currentTime === previousTime) return;
      previousTime = currentTime;

      place(currentTime);

      if (!isPlaying || !followRef.current) return;

      const view = tracksScrollRef.current;
      if (!view) return;

      const x = currentTime * pixelsPerSecond;
      const width = view.clientWidth;
      const outOfBand =
        x < view.scrollLeft + width * FOLLOW_LEAD ||
        x > view.scrollLeft + width * FOLLOW_TRAIL;

      // Jump a page at a time rather than scrolling every frame: continuous
      // scrolling makes the waveforms unreadable.
      if (outOfBand) {
        selfScrollUntilRef.current = performance.now() + 150;
        view.scrollLeft = Math.max(0, x - width * FOLLOW_REST);
      }
    });
  }, [pixelsPerSecond]);

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

            {/* Playhead marker in the ruler */}
            <div
              ref={playheadHeaderRef}
              className="absolute top-0 bottom-0 w-px bg-red-500 pointer-events-none z-10"
            >
              <div
                className="absolute top-0 -left-[3px] w-[7px] h-[7px] bg-red-500"
                style={{ clipPath: 'polygon(0 0, 100% 0, 50% 100%)' }}
              />
            </div>
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

        <label
          className={`ml-4 flex items-center gap-1.5 text-xs select-none ${
            followCanApply ? 'cursor-pointer' : 'text-gray-500 cursor-default'
          }`}
          title={
            followCanApply
              ? 'While playing, scroll the timeline to keep the playhead in view'
              : 'Not needed yet: the whole arrangement already fits on screen. ' +
                'Zoom in, or arrange past the right edge, and this will scroll to follow playback.'
          }
        >
          <input
            type="checkbox"
            checked={follow}
            disabled={!followCanApply}
            onChange={(e) => setFollow(e.target.checked)}
          />
          Follow playhead
          {!followCanApply && <span className="text-gray-600">(not needed)</span>}
        </label>
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
          {/* Positioning context for the playhead, spanning the full scroll
              width and height so the line covers every track */}
          <div
            className="relative min-h-full"
            style={{ minWidth: `${maxDuration * pixelsPerSecond}px` }}
          >
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

            <div
              ref={playheadTracksRef}
              className="absolute top-0 bottom-0 w-px bg-red-500/80 pointer-events-none z-20"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
