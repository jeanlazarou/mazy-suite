import { useState, useRef } from 'react';
import { TrackClip } from '../types';
import { useStore } from '../store';

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
  const { clips, updateTrackClip, moveTrackClip, moveClipBetweenTracks, audioFiles, tracks, selectedTrackClip, setSelectedTrackClip } = useStore();
  const clip = clips.find((s) => s.id === trackClip.clipId);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState<'left' | 'right' | null>(null);
  const dragStartPosRef = useRef(0);

  const isSelected = selectedTrackClip?.trackId === trackId && selectedTrackClip?.trackClipId === trackClip.id;

  if (!clip) return null;

  const audioFile = audioFiles.find((f) => f.id === clip.audioFileId);
  if (!audioFile) return null;

  // Use trimStart/trimEnd if set, otherwise use clip's default values
  const effectiveStartTime = trackClip.trimStart ?? clip.startTime;
  const effectiveEndTime = trackClip.trimEnd ?? clip.endTime;
  const effectiveDuration = effectiveEndTime - effectiveStartTime;

  const width = effectiveDuration * pixelsPerSecond;
  const left = trackClip.position * pixelsPerSecond;

  // Helper to check if a position would cause overlap
  const checkOverlap = (targetTrackId: string, position: number): boolean => {
    const targetTrack = tracks.find((t) => t.id === targetTrackId);
    if (!targetTrack) return false;

    const newStart = position;
    const newEnd = position + effectiveDuration;

    return targetTrack.clips.some((tc) => {
      if (tc.id === trackClip.id) return false; // Skip self

      const otherClip = clips.find((c) => c.id === tc.clipId);
      if (!otherClip) return false;

      const otherEffectiveStart = tc.trimStart ?? otherClip.startTime;
      const otherEffectiveEnd = tc.trimEnd ?? otherClip.endTime;
      const otherDuration = otherEffectiveEnd - otherEffectiveStart;
      const otherTotalDuration = otherDuration * (tc.repeatCount || 1);

      const existingStart = tc.position;
      const existingEnd = tc.position + otherTotalDuration;

      return newStart < existingEnd && newEnd > existingStart;
    });
  };

  const handleClick = (e: React.MouseEvent) => {
    // Don't select if we're clicking on resize handles or during drag
    if (isDragging || isResizing) return;

    const target = e.target as HTMLElement;
    if (target.closest('.resize-handle')) return;

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
    const maxDuration = audioFile.duration;

    // Find adjacent clips for overlap checking
    const track = tracks.find((t) => t.id === trackId);
    if (!track) return;

    // Get all other clips on this track with their positions and durations
    const otherClips = track.clips
      .filter((tc) => tc.id !== trackClip.id)
      .map((tc) => {
        const otherClip = clips.find((c) => c.id === tc.clipId);
        if (!otherClip) return null;

        const otherStart = tc.trimStart ?? otherClip.startTime;
        const otherEnd = tc.trimEnd ?? otherClip.endTime;
        const otherDuration = otherEnd - otherStart;
        const totalDuration = otherDuration * (tc.repeatCount || 1);

        return {
          position: tc.position,
          endPosition: tc.position + totalDuration,
        };
      })
      .filter((tc): tc is { position: number; endPosition: number } => tc !== null);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaTime = deltaX / pixelsPerSecond;

      if (edge === 'left') {
        // Resize from left edge - adjust trimStart AND position
        // The visual left edge follows the mouse
        let newTrimStart = Math.max(0, Math.min(originalStartTime + deltaTime, originalEndTime - 0.1));
        const actualDelta = newTrimStart - originalStartTime;
        let newPosition = originalPosition + actualDelta;

        // Check for overlap with clips that end before our current position
        const clipsToLeft = otherClips.filter((tc) => tc.endPosition <= originalPosition);
        if (clipsToLeft.length > 0) {
          const closestClip = clipsToLeft.reduce((prev, curr) =>
            curr.endPosition > prev.endPosition ? curr : prev
          );
          // Don't allow left edge to go past the end of the previous clip
          newPosition = Math.max(newPosition, closestClip.endPosition);
          const clampedDelta = newPosition - originalPosition;
          newTrimStart = originalStartTime + clampedDelta;
        }

        updateTrackClip(trackId, trackClip.id, {
          trimStart: newTrimStart,
          position: newPosition
        });
      } else {
        // Resize from right edge - adjust trimEnd only
        let newTrimEnd = Math.max(originalStartTime + 0.1, Math.min(originalEndTime + deltaTime, maxDuration));
        const newDuration = newTrimEnd - originalStartTime;
        const newEndPosition = originalPosition + newDuration;

        // Check for overlap with clips that start after our current position
        const clipsToRight = otherClips.filter((tc) => tc.position >= originalPosition + (originalEndTime - originalStartTime));
        if (clipsToRight.length > 0) {
          const closestClip = clipsToRight.reduce((prev, curr) =>
            curr.position < prev.position ? curr : prev
          );
          // Don't allow right edge to go past the start of the next clip
          if (newEndPosition > closestClip.position) {
            const maxAllowedDuration = closestClip.position - originalPosition;
            newTrimEnd = originalStartTime + maxAllowedDuration;
          }
        }

        updateTrackClip(trackId, trackClip.id, { trimEnd: newTrimEnd });
      }
    };

    const handleMouseUp = () => {
      setIsResizing(null);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);

      // Get final state after resize
      const { tracks, undoManager } = useStore.getState();
      const finalTrack = tracks.find((t) => t.id === trackId);
      const finalTrackClip = finalTrack?.clips.find((tc) => tc.id === trackClip.id);

      if (finalTrackClip) {
        const finalTrimStart = finalTrackClip.trimStart ?? clip.startTime;
        const finalTrimEnd = finalTrackClip.trimEnd ?? clip.endTime;

        // Record resize action to undo history
        const resizeAction: any = {
          type: 'RESIZE_CLIP',
          trackId: trackId,
          trackClipId: trackClip.id,
          oldTrimStart: originalStartTime,
          oldTrimEnd: originalEndTime,
          newTrimStart: finalTrimStart,
          newTrimEnd: finalTrimEnd,
          oldPosition: originalPosition,
          newPosition: finalTrackClip.position,
        };

        undoManager.addAction(resizeAction);
      }
    };

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
      const newPosition = Math.max(0, relativeX / pixelsPerSecond);

      // Check for overlap before moving
      if (checkOverlap(targetTrackId, newPosition)) {
        // Don't update position if it would cause overlap
        return;
      }

      // If we've moved to a different track, move the clip
      if (targetTrackId !== currentTrackId) {
        moveClipBetweenTracks(currentTrackId, targetTrackId, trackClip.id, newPosition);
        currentTrackId = targetTrackId;
      } else {
        // Same track - just update position
        updateTrackClip(currentTrackId, trackClip.id, { position: newPosition });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);

      // Get the final position from the store
      const state = useStore.getState();
      const finalTrack = state.tracks.find(t => t.id === currentTrackId);
      const currentClip = finalTrack?.clips.find(tc => tc.id === trackClip.id);

      if (currentClip) {
        const finalPosition = currentClip.position;

        // Add to undo history if position or track changed
        if (
          currentTrackId === startTrackId &&
          Math.abs(finalPosition - dragStartPosRef.current) > 0.01
        ) {
          // Same track, position changed
          moveTrackClip(currentTrackId, trackClip.id, dragStartPosRef.current, finalPosition);
        }
        // TODO: Add undo support for cross-track moves
      }

      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

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
        style={{ left: `${left}px`, width: `${width}px` }}
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

        {/* Fade In Gradient Overlay */}
        {trackClip.fadeIn && trackClip.fadeIn > 0 && (
          <div
            className="absolute top-0 bottom-0 left-0 pointer-events-none"
            style={{
              width: `${(trackClip.fadeIn / effectiveDuration) * 100}%`,
              background: 'linear-gradient(to right, rgba(0,0,0,0.5), transparent)',
            }}
          />
        )}

        {/* Fade Out Gradient Overlay */}
        {trackClip.fadeOut && trackClip.fadeOut > 0 && (
          <div
            className="absolute top-0 bottom-0 right-0 pointer-events-none"
            style={{
              width: `${(trackClip.fadeOut / effectiveDuration) * 100}%`,
              background: 'linear-gradient(to left, rgba(0,0,0,0.5), transparent)',
            }}
          />
        )}

        <div className="p-1 h-full flex flex-col justify-between text-xs pointer-events-none">
          <div className="font-medium truncate">{clip.name}</div>
          <div className="text-blue-100 text-[10px]">
            {effectiveDuration.toFixed(2)}s @ {trackClip.position.toFixed(1)}s
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
                <div className="p-1 h-full flex flex-col justify-between text-xs">
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
