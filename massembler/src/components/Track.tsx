import { useState } from 'react';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import { Track as TrackType } from '../types';
import { history, useStore, useStoreFields } from '../store';
import { TrackClipBlock } from './TrackClipBlock';
import { VolumeKnob } from './VolumeKnob';
import { isSilencedBySolo } from '../utils/trackAudibility';
import { SNAP_PX, snapSpan, snapTargets } from '../utils/snapping';

interface TrackProps {
  track: TrackType;
  pixelsPerSecond: number;
  maxDuration: number;
  /** The Timeline draws a track in two halves: its controls, and its clips. */
  renderMode: 'controls' | 'timeline';
}

/** A pan as it reads on its knob: C in the middle, else L or R and how far. */
const formatPan = (pan: number) =>
  Math.abs(pan) < 0.005 ? 'C' : `${pan < 0 ? 'L' : 'R'}${Math.round(Math.abs(pan) * 100)}`;

export function Track({ track, pixelsPerSecond, maxDuration, renderMode }: TrackProps) {
  const { updateTrack, removeTrack, addClipToTrack, tracks } = useStoreFields(
    'updateTrack',
    'removeTrack',
    'addClipToTrack',
    'tracks'
  );
  const [moving, setMoving] = useState(false);

  // Not muted, but inaudible because something else is soloed. Shown dimmed so
  // a silent track never looks like a broken one.
  const silencedBySolo = isSilencedBySolo(track, tracks);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const clipId = e.dataTransfer.getData('clipId');
    if (!clipId) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;

    // For clips from the library, position by left edge (no offset)
    // This makes sense since library elements have different visual width than track elements
    let position = Math.max(0, x / pixelsPerSecond);

    const { snapEnabled, clips, playbackState } = useStore.getState();
    const clip = clips.find((c) => c.id === clipId);
    if (snapEnabled && clip) {
      const targets = snapTargets(tracks, clips, playbackState.currentTime);
      const snapped = snapSpan(position, clip.duration, targets, SNAP_PX / pixelsPerSecond);
      if (snapped) position = snapped.start;
    }

    addClipToTrack(track.id, clipId, position);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleVolumeChange = (value: number) => {
    history.coalesced(`volume:${track.id}`, () => updateTrack(track.id, { volume: value }));
  };

  // Dragging the grip moves the track up or down the list as the pointer
  // crosses the others; the whole drag is one undo step.
  const handleGripMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setMoving(true);
    history.beginGesture();

    const handleMove = (move: MouseEvent) => {
      const rows = [...document.querySelectorAll<HTMLElement>('[data-track-row]')];
      if (rows.length === 0) return;
      const over = rows.findIndex((row) => {
        const rect = row.getBoundingClientRect();
        return move.clientY >= rect.top && move.clientY < rect.bottom;
      });
      const above = move.clientY < rows[0].getBoundingClientRect().top;
      useStore.getState().moveTrack(track.id, over >= 0 ? over : above ? 0 : rows.length - 1);
    };
    const handleUp = () => {
      setMoving(false);
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
      history.endGesture();
    };
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
  };

  const handlePanChange = (value: number) => {
    // Near the middle counts as the middle, so it is easy to find again.
    const pan = Math.abs(value) < 0.02 ? undefined : value;
    history.coalesced(`pan:${track.id}`, () => updateTrack(track.id, { pan }));
  };

  const handleSoloToggle = () => {
    updateTrack(track.id, { solo: !track.solo });
  };

  const handleMuteToggle = () => {
    updateTrack(track.id, { muted: !track.muted });
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const name = e.target.value;
    history.coalesced(`name:${track.id}`, () => updateTrack(track.id, { name }));
  };

  // Render only controls
  if (renderMode === 'controls') {
    return (
      <div
        className={`p-2 border-b border-gray-700 h-[6.3rem] flex flex-col gap-2 ${
          silencedBySolo ? 'opacity-50' : ''
        }`}
        title={silencedBySolo ? 'Silent while another track is soloed' : undefined}
        data-tour="track-controls"
        data-track-row={track.id}
      >
        <div className="flex items-center gap-1">
          <span
            onMouseDown={handleGripMouseDown}
            className={`shrink-0 text-gray-500 hover:text-gray-300 ${moving ? 'cursor-grabbing text-blue-300' : 'cursor-grab'}`}
            title="Drag to move the track up or down"
          >
            <DragIndicatorIcon sx={{ fontSize: 18 }} />
          </span>
          <input
            type="text"
            value={track.name}
            onChange={handleNameChange}
            className="min-w-0 flex-1 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm"
          />
        </div>

        <div className="flex items-center gap-1 justify-between">
          <button
            onClick={handleSoloToggle}
            className={`px-2 py-1 rounded text-xs font-bold w-7 ${
              track.solo
                ? 'bg-yellow-500 text-gray-900 hover:bg-yellow-400'
                : 'bg-gray-700 hover:bg-gray-600'
            }`}
            title={
              track.solo
                ? 'Un-solo this track'
                : 'Solo: hear only this track (and any others soloed)'
            }
          >
            S
          </button>

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
          <VolumeKnob
            value={track.pan ?? 0}
            onChange={handlePanChange}
            size={30}
            label="Pan"
            min={-1}
            max={1}
            origin={0}
            defaultValue={0}
            format={formatPan}
          />

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

  // The timeline half: where the track's clips sit.
  return (
    <div
      className={`relative h-[6.3rem] bg-gray-900 border-b border-gray-700 ${
        silencedBySolo ? 'opacity-40' : ''
      }`}
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
