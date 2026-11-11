import { useState, useRef } from 'react';
import LinkIcon from '@mui/icons-material/Link';
import { TrackClip } from '../types';
import { getEffectInfo, resolveClipPlaybackRate } from '../utils/clipEffects';
import {
  OVERLAP_EPSILON,
  getRepeatCount,
  getTrackClipDuration,
  getTrackClipEnd,
  spansOverlap,
} from '../utils/clipTiming';
import {
  linkedResizeLimit,
  snapshotGroup,
  solveLinkedMove,
  solveLinkedResize,
} from '../utils/clipLinks';
import { SNAP_PX, snapPoint, snapSpan, snapTargets } from '../utils/snapping';
import { contiguousRange } from '../utils/projectOptimizer';
import { history, useStore } from '../store';
import { ClipWaveform } from './ClipWaveform';

/** A colour per group, so linked clips can be told apart at a glance. */
function linkColor(linkId: string): string {
  const seed = [...linkId].reduce((hash, ch) => hash * 31 + ch.charCodeAt(0), 7);
  return `hsl(${seed % 360}, 75%, 62%)`;
}

interface TrackClipBlockProps {
  trackId: string;
  trackClip: TrackClip;
  pixelsPerSecond: number;
}

export function TrackClipBlock({
  trackId,
  trackClip,
  pixelsPerSecond,
}: TrackClipBlockProps) {
  const { clips, updateTrackClip, moveClipBetweenTracks, audioFiles, tracks, selectedTrackClips, setSelectedTrackClip, toggleTrackClipSelection, applyTrackClipPatches, applyTrackClipMoves, setSnapGuide } = useStore();
  const clip = clips.find((s) => s.id === trackClip.clipId);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState<'left' | 'right' | null>(null);
  const dragStartPosRef = useRef(0);

  const isSelected = selectedTrackClips.some((s) => s.trackClipId === trackClip.id);
  const groupSize = trackClip.linkId
    ? tracks.reduce(
        (count, t) =>
          count + t.clips.filter((tc) => tc.linkId === trackClip.linkId).length,
        0
      )
    : 0;
  const groupColor = trackClip.linkId ? linkColor(trackClip.linkId) : null;

  if (!clip) return null;

  const audioFile = audioFiles.find((f) => f.id === clip.audioFileId);
  if (!audioFile) return null;

  // Use trimStart/trimEnd if set, otherwise use clip's default values
  const effectiveStartTime = trackClip.trimStart ?? clip.startTime;
  const effectiveEndTime = trackClip.trimEnd ?? clip.endTime;
  const effectiveDuration = effectiveEndTime - effectiveStartTime;

  const width = effectiveDuration * pixelsPerSecond;
  const left = trackClip.position * pixelsPerSecond;

  // The stretch of audio the clip actually plays: a pitch preset reads less
  // of it, and Reverse plays it backwards.
  const waveform = (
    <ClipWaveform
      buffer={audioFile.buffer}
      start={effectiveStartTime}
      end={effectiveStartTime + effectiveDuration * resolveClipPlaybackRate(trackClip.effect)}
      width={width}
      reversed={trackClip.effect === 'reverse'}
    />
  );

  /**
   * Snap targets for a gesture, frozen when it starts, and how far an edge
   * reaches for them. Null when snapping is off.
   */
  const startSnapping = (exclude: Set<string>) => {
    const { snapEnabled, playbackState } = useStore.getState();
    if (!snapEnabled) return null;
    return {
      targets: snapTargets(tracks, clips, playbackState.currentTime, exclude),
      reach: SNAP_PX / pixelsPerSecond,
    };
  };

  // Helper to check if a position would cause overlap
  const checkOverlap = (targetTrackId: string, position: number): boolean => {
    const targetTrack = tracks.find((t) => t.id === targetTrackId);
    if (!targetTrack) return false;

    const newStart = position;
    // Repetitions are part of what the clip occupies. Measuring only the first
    // one let a repeating clip's tail slide straight through its neighbour.
    const newEnd = position + getTrackClipDuration(trackClip, clip);

    return targetTrack.clips.some((tc) => {
      if (tc.id === trackClip.id) return false; // Skip self

      const otherClip = clips.find((c) => c.id === tc.clipId);
      if (!otherClip) return false;

      return spansOverlap(newStart, newEnd, tc.position, getTrackClipEnd(tc, otherClip));
    });
  };

  const handleClick = (e: React.MouseEvent) => {
    // Don't select if we're clicking on resize handles or during drag
    if (isDragging || isResizing) return;

    const target = e.target as HTMLElement;
    if (target.closest('.resize-handle')) return;

    // Ctrl/cmd-click builds up the selection that Link works on.
    if (e.metaKey || e.ctrlKey) {
      toggleTrackClipSelection({ trackId, trackClipId: trackClip.id });
      return;
    }

    setSelectedTrackClip({ trackId, trackClipId: trackClip.id });
  };

  const handleResizeStart = (e: React.MouseEvent, edge: 'left' | 'right') => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(edge);

    const startX = e.clientX;
    // Use trimStart/trimEnd if set, otherwise use clip's default values
    const currentTrimStart = trackClip.trimStart ?? clip.startTime;
    const currentTrimEnd = trackClip.trimEnd ?? clip.endTime;
    const originalStartTime = currentTrimStart;
    const originalEndTime = currentTrimEnd;
    const originalPosition = trackClip.position;
    // In an optimized file, past the kept region lies some other part of the recording.
    const playable = contiguousRange(audioFile, originalStartTime, originalEndTime);
    const repeats = getRepeatCount(trackClip);

    // The group as it stands now. Empty for an unlinked clip, which leaves
    // everything below on the plain single-clip path.
    const group = snapshotGroup(tracks, clips, { trackId, trackClipId: trackClip.id });
    const self = group.find((m) => m.trackClipId === trackClip.id) ?? null;
    const snapping = startSnapping(new Set([trackClip.id]));

    // Find adjacent clips for overlap checking
    const track = tracks.find((t) => t.id === trackId);
    if (!track) return;

    // Get all other clips on this track with their positions and durations
    const otherClips = track.clips
      .filter((tc) => tc.id !== trackClip.id)
      .map((tc) => {
        const otherClip = clips.find((c) => c.id === tc.clipId);
        if (!otherClip) return null;

        return {
          position: tc.position,
          endPosition: getTrackClipEnd(tc, otherClip),
        };
      })
      .filter((tc): tc is { position: number; endPosition: number } => tc !== null);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      let deltaTime = deltaX / pixelsPerSecond;
      let snappedTo: number | null = null;

      if (edge === 'left') {
        if (snapping) {
          snappedTo = snapPoint(originalPosition + deltaTime, snapping.targets, snapping.reach);
          if (snappedTo !== null) deltaTime = snappedTo - originalPosition;
        }

        // Resize from left edge - adjust trimStart AND position
        // The visual left edge follows the mouse
        let newTrimStart = Math.max(playable.start, Math.min(originalStartTime + deltaTime, originalEndTime - 0.1));
        const actualDelta = newTrimStart - originalStartTime;
        let newPosition = originalPosition + actualDelta;

        // Check for overlap with clips that end before our current position
        const clipsToLeft = otherClips.filter(
          (tc) => tc.endPosition <= originalPosition + OVERLAP_EPSILON
        );
        if (clipsToLeft.length > 0) {
          const closestClip = clipsToLeft.reduce((prev, curr) =>
            curr.endPosition > prev.endPosition ? curr : prev
          );
          // Don't allow left edge to go past the end of the previous clip
          newPosition = Math.max(newPosition, closestClip.endPosition);
          const clampedDelta = newPosition - originalPosition;
          newTrimStart = originalStartTime + clampedDelta;
        }

        if (self) {
          // Stop where the first carried member would run out of length,
          // rather than letting the group come apart.
          const limit = linkedResizeLimit(group, self, 'left');
          if (newPosition > limit) {
            newPosition = limit;
            newTrimStart = originalStartTime + (limit - originalPosition);
          }
        }

        // Only show the guide if the limits above left the edge on it.
        setSnapGuide(
          snappedTo !== null && Math.abs(newPosition - snappedTo) < OVERLAP_EPSILON ? snappedTo : null
        );

        applyTrackClipPatches(
          [
            {
              trackId,
              trackClipId: trackClip.id,
              updates: { trimStart: newTrimStart, position: newPosition },
            },
            ...(self ? solveLinkedResize(group, self, 'left', newPosition) : []),
          ]
        );
      } else {
        const originalLength = originalEndTime - originalStartTime;

        // The edge that snaps is where the last repetition ends: that is what
        // meets the next clip.
        if (snapping) {
          snappedTo = snapPoint(
            originalPosition + repeats * (originalLength + deltaTime),
            snapping.targets,
            snapping.reach
          );
          if (snappedTo !== null) {
            deltaTime = (snappedTo - originalPosition) / repeats - originalLength;
          }
        }

        // Resize from right edge - adjust trimEnd only
        let newTrimEnd = Math.max(originalStartTime + 0.1, Math.min(originalEndTime + deltaTime, playable.end));
        const newDuration = newTrimEnd - originalStartTime;
        // Stretching one repetition stretches them all, so the clip's last
        // repetition is what meets the next clip.
        const newEndPosition = originalPosition + repeats * newDuration;

        // Check for overlap with clips that start after our current position
        const clipsToRight = otherClips.filter(
          (tc) => tc.position >= originalPosition + repeats * originalLength - OVERLAP_EPSILON
        );
        if (clipsToRight.length > 0) {
          const closestClip = clipsToRight.reduce((prev, curr) =>
            curr.position < prev.position ? curr : prev
          );
          // Don't allow right edge to go past the start of the next clip
          if (newEndPosition > closestClip.position) {
            const maxAllowedDuration = (closestClip.position - originalPosition) / repeats;
            newTrimEnd = originalStartTime + maxAllowedDuration;
          }
        }

        // Where the clip now stops sounding, repeats included: that is the
        // edge the rest of the group sees coming, not the handle under the
        // mouse.
        let edgeValue = originalPosition + repeats * (newTrimEnd - originalStartTime);

        if (self) {
          const limit = linkedResizeLimit(group, self, 'right');
          if (edgeValue < limit) {
            edgeValue = limit;
            newTrimEnd = originalStartTime + (limit - originalPosition) / repeats;
          }
        }

        setSnapGuide(
          snappedTo !== null && Math.abs(edgeValue - snappedTo) < OVERLAP_EPSILON ? snappedTo : null
        );

        applyTrackClipPatches(
          [
            { trackId, trackClipId: trackClip.id, updates: { trimEnd: newTrimEnd } },
            ...(self ? solveLinkedResize(group, self, 'right', edgeValue) : []),
          ]
        );
      }
    };

    const handleMouseUp = () => {
      setIsResizing(null);
      setSnapGuide(null);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      history.endGesture();
    };

    // One undo step for the whole resize, linked members included.
    history.beginGesture();
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    // Only block dragging if clicking on actual interactive elements (buttons, inputs)
    const target = e.target as HTMLElement;
    if (target.tagName === 'BUTTON' || target.tagName === 'INPUT') {
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    dragStartPosRef.current = trackClip.position;

    // Store initial state
    const startTrackId = trackId;
    let currentTrackId = trackId;

    // Calculate offset within the element
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;

    // The group travels as a rigid body, measured from where it all started.
    const group = snapshotGroup(tracks, clips, { trackId, trackClipId: trackClip.id });

    // The dragged clip's edges snap; the rest of its group follows it, so
    // none of them are targets.
    const snapping = startSnapping(
      new Set(group.length > 0 ? group.map((m) => m.trackClipId) : [trackClip.id])
    );
    const footprint = getTrackClipDuration(trackClip, clip);

    // A clip that is already sitting on top of another one - an arrangement
    // made back when repetitions did not count towards a clip's footprint -
    // would be frozen in place by the checks below, since every position it
    // could move to overlaps too. Let it be dragged out of trouble.
    const startedOverlapping =
      group.length > 0
        ? solveLinkedMove(tracks, clips, group, 0, 0) === null
        : checkOverlap(trackId, trackClip.position);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      // Find which track the mouse is currently over
      const allTrackElements = document.querySelectorAll('[data-track-id]');
      let targetTrackId = currentTrackId;

      for (const trackEl of allTrackElements) {
        const trackRect = trackEl.getBoundingClientRect();
        if (
          moveEvent.clientY >= trackRect.top &&
          moveEvent.clientY <= trackRect.bottom
        ) {
          targetTrackId = trackEl.getAttribute('data-track-id') || currentTrackId;
          break;
        }
      }

      // Calculate new position relative to the target track
      const targetTrackEl = document.querySelector(`[data-track-id="${targetTrackId}"]`);
      if (!targetTrackEl) return;

      const targetRect = targetTrackEl.getBoundingClientRect();
      const relativeX = moveEvent.clientX - targetRect.left - offsetX;
      let newPosition = Math.max(0, relativeX / pixelsPerSecond);

      const snapped = snapping
        ? snapSpan(newPosition, footprint, snapping.targets, snapping.reach)
        : null;
      if (snapped) newPosition = snapped.start;

      // A refused move below leaves the guide as it was: the clip has not moved.
      if (group.length > 0) {
        const live = useStore.getState().tracks;
        const fromIndex = live.findIndex((t) => t.id === startTrackId);
        const toIndex = live.findIndex((t) => t.id === targetTrackId);
        if (fromIndex < 0 || toIndex < 0) return;

        const moves = solveLinkedMove(
          live,
          clips,
          group,
          newPosition - dragStartPosRef.current,
          toIndex - fromIndex,
          { allowOverlap: startedOverlapping }
        );

        // One member blocked blocks the group: nothing moves until it fits.
        if (!moves) return;

        applyTrackClipMoves(moves);
        currentTrackId = targetTrackId;
        setSnapGuide(snapped?.at ?? null);
        return;
      }

      // Check for overlap before moving
      if (!startedOverlapping && checkOverlap(targetTrackId, newPosition)) {
        // Don't update position if it would cause overlap
        return;
      }

      if (targetTrackId !== currentTrackId) {
        moveClipBetweenTracks(currentTrackId, targetTrackId, trackClip.id, newPosition);
        currentTrackId = targetTrackId;
      } else {
        // Same track - just update position
        updateTrackClip(currentTrackId, trackClip.id, { position: newPosition });
      }
      setSnapGuide(snapped?.at ?? null);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setSnapGuide(null);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      history.endGesture();
    };

    // One undo step for the whole drag, however many mouse moves it takes.
    history.beginGesture();
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <>
      {/* Main clip */}
      <div
        className={`absolute top-1 bottom-1 bg-blue-600 rounded border overflow-visible group cursor-move ${
          isDragging ? 'opacity-75 z-50' : ''
        } ${isResizing ? 'z-50' : ''} ${
          isSelected ? 'border-blue-300 border-2 ring-2 ring-blue-400' : 'border-blue-400'
        }`}
        style={{
          left: `${left}px`,
          width: `${width}px`,
          // Linked clips wear their group's colour, so which clips travel
          // together is visible without selecting anything.
          ...(groupColor && !isSelected
            ? { borderColor: groupColor, borderWidth: '2px' }
            : {}),
        }}
        onMouseDown={handleMouseDown}
        onClick={handleClick}
      >
        {/* Left resize handle */}
        <div
          className="resize-handle absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-blue-300 opacity-0 group-hover:opacity-100 transition-opacity z-10"
          onMouseDown={(e) => handleResizeStart(e, 'left')}
          title="Resize clip start"
        />

        {/* Right resize handle */}
        <div
          className="resize-handle absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-blue-300 opacity-0 group-hover:opacity-100 transition-opacity z-10"
          onMouseDown={(e) => handleResizeStart(e, 'right')}
          title="Resize clip end"
        />

        {waveform}

        {/* Fade In Gradient Overlay */}
        {(trackClip.fadeIn ?? 0) > 0 && (
          <div
            className="absolute top-0 bottom-0 left-0 pointer-events-none"
            style={{
              width: `${((trackClip.fadeIn ?? 0) / effectiveDuration) * 100}%`,
              background: 'linear-gradient(to right, rgba(0,0,0,0.5), transparent)',
            }}
          />
        )}

        {/* Fade Out Gradient Overlay */}
        {(trackClip.fadeOut ?? 0) > 0 && (
          <div
            className="absolute top-0 bottom-0 right-0 pointer-events-none"
            style={{
              width: `${((trackClip.fadeOut ?? 0) / effectiveDuration) * 100}%`,
              background: 'linear-gradient(to left, rgba(0,0,0,0.5), transparent)',
            }}
          />
        )}

        <div className="relative p-1 h-full flex flex-col justify-between text-xs pointer-events-none">
          <div className="font-medium truncate">{clip.name}</div>
          <div className="text-blue-100 text-[10px] flex items-center gap-1">
            <span className="truncate">
              {effectiveDuration.toFixed(2)}s @ {trackClip.position.toFixed(1)}s
            </span>
            {trackClip.effect && trackClip.effect !== 'none' && (
              <span className="shrink-0 px-1 rounded bg-purple-600 text-white text-[9px] uppercase tracking-wide">
                {getEffectInfo(trackClip.effect).label}
              </span>
            )}
            {groupColor && (
              <span
                className="shrink-0 px-1 rounded text-gray-900 text-[9px] font-bold flex items-center gap-0.5"
                style={{ backgroundColor: groupColor }}
                title={`Linked to ${groupSize - 1} other clip${groupSize === 2 ? '' : 's'}`}
              >
                <LinkIcon sx={{ fontSize: 10 }} />
                {groupSize}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Phantom clips for repeats */}
      {trackClip.repeat && trackClip.repeatCount && trackClip.repeatCount > 1 && (
        <>
          {Array.from({ length: trackClip.repeatCount - 1 }).map((_, index) => {
            const repeatIndex = index + 1;
            const phantomLeft = left + (width * repeatIndex);
            return (
              <div
                key={`phantom-${trackClip.id}-${repeatIndex}`}
                className="absolute top-1 bottom-1 bg-blue-600 rounded border border-blue-400 opacity-30 pointer-events-none"
                style={{ left: `${phantomLeft}px`, width: `${width}px` }}
              >
                {waveform}
                <div className="relative p-1 h-full flex flex-col justify-between text-xs">
                  <div className="font-medium truncate">{clip.name}</div>
                  <div className="text-blue-100 text-[10px]">
                    #{repeatIndex + 1}
                  </div>
                </div>
              </div>
            );
          })}
        </>
      )}
    </>
  );
}
