import { useState, useRef } from 'react';
import LinkIcon from '@mui/icons-material/Link';
import { TrackClip } from '../types';
import { UndoAction, batchActions } from '../utils/undoRedo';
import { getEffectInfo } from '../utils/clipEffects';
import { getRepeatCount, getTrackClipDuration, getTrackClipEnd } from '../utils/clipTiming';
import {
  LinkedMember,
  diffTrackClip,
  findTrackClip,
  linkedResizeLimit,
  snapshotGroup,
  solveLinkedMove,
  solveLinkedResize,
} from '../utils/clipLinks';
import { useStore } from '../store';

/** A colour per group, so linked clips can be told apart at a glance. */
function linkColor(linkId: string): string {
  const seed = [...linkId].reduce((hash, ch) => hash * 31 + ch.charCodeAt(0), 7);
  return `hsl(${seed % 360}, 75%, 62%)`;
}

/** Where a clip sits now, whichever track a drag has left it on. */
function currentPlacement(trackClipId: string) {
  for (const track of useStore.getState().tracks) {
    const trackClip = track.clips.find((tc) => tc.id === trackClipId);
    if (trackClip) return { trackId: track.id, trackClip };
  }
  return null;
}

/**
 * What a gesture did to the rest of the group, as undo actions. Members the
 * dragged edge never reached come back unchanged and are left out.
 */
function groupUndoActions(snapshot: LinkedMember[], selfId: string): UndoAction[] {
  const { tracks } = useStore.getState();
  const actions: UndoAction[] = [];

  for (const member of snapshot) {
    if (member.trackClipId === selfId) continue;

    const current = findTrackClip(tracks, member);
    if (!current) continue;

    const diff = diffTrackClip(member.trackClip, current);
    if (!diff) continue;

    actions.push({
      type: 'UPDATE_TRACK_CLIP_OPTIONS',
      trackId: member.trackId,
      trackClipId: member.trackClipId,
      ...diff,
    });
  }

  return actions;
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
  const { clips, updateTrackClip, moveTrackClip, moveClipBetweenTracks, recordClipMovedBetweenTracks, audioFiles, tracks, selectedTrackClips, setSelectedTrackClip, toggleTrackClipSelection, applyTrackClipPatches, applyTrackClipMoves } = useStore();
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

      const existingStart = tc.position;
      const existingEnd = getTrackClipEnd(tc, otherClip);

      return newStart < existingEnd && newEnd > existingStart;
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
    const maxDuration = audioFile.duration;
    const repeats = getRepeatCount(trackClip);

    // The group as it stands now. Empty for an unlinked clip, which leaves
    // everything below on the plain single-clip path.
    const group = snapshotGroup(tracks, clips, { trackId, trackClipId: trackClip.id });
    const self = group.find((m) => m.trackClipId === trackClip.id) ?? null;

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

        if (self) {
          // Stop where the first carried member would run out of length,
          // rather than letting the group come apart.
          const limit = linkedResizeLimit(group, self, 'left');
          if (newPosition > limit) {
            newPosition = limit;
            newTrimStart = originalStartTime + (limit - originalPosition);
          }
        }

        applyTrackClipPatches(
          [
            {
              trackId,
              trackClipId: trackClip.id,
              updates: { trimStart: newTrimStart, position: newPosition },
            },
            ...(self ? solveLinkedResize(group, self, 'left', newPosition) : []),
          ],
          false
        );
      } else {
        // Resize from right edge - adjust trimEnd only
        let newTrimEnd = Math.max(originalStartTime + 0.1, Math.min(originalEndTime + deltaTime, maxDuration));
        const newDuration = newTrimEnd - originalStartTime;
        // Stretching one repetition stretches them all, so the clip's last
        // repetition is what meets the next clip.
        const newEndPosition = originalPosition + repeats * newDuration;

        // Check for overlap with clips that start after our current position
        const clipsToRight = otherClips.filter(
          (tc) => tc.position >= originalPosition + repeats * (originalEndTime - originalStartTime)
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

        applyTrackClipPatches(
          [
            { trackId, trackClipId: trackClip.id, updates: { trimEnd: newTrimEnd } },
            ...(self ? solveLinkedResize(group, self, 'right', edgeValue) : []),
          ],
          false
        );
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
        const resizeAction: UndoAction = {
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

        // Whatever the gesture carried along goes in the same entry: one
        // resize, one undo.
        const action = batchActions([
          resizeAction,
          ...groupUndoActions(group, trackClip.id),
        ]);
        if (action) undoManager.addAction(action);
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

    // The group travels as a rigid body, measured from where it all started.
    const group = snapshotGroup(tracks, clips, { trackId, trackClipId: trackClip.id });

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
      const newPosition = Math.max(0, relativeX / pixelsPerSecond);

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

        applyTrackClipMoves(moves, false);
        currentTrackId = targetTrackId;
        return;
      }

      // Check for overlap before moving
      if (!startedOverlapping && checkOverlap(targetTrackId, newPosition)) {
        // Don't update position if it would cause overlap
        return;
      }

      // Nothing here is recorded in the undo history: this runs on every
      // mouse move, so it would bury the drag under hundreds of entries.
      // handleMouseUp files one action for the whole gesture.
      if (targetTrackId !== currentTrackId) {
        moveClipBetweenTracks(currentTrackId, targetTrackId, trackClip.id, newPosition, false);
        currentTrackId = targetTrackId;
      } else {
        // Same track - just update position
        updateTrackClip(currentTrackId, trackClip.id, { position: newPosition }, false);
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);

      if (group.length > 0) {
        // One entry for the whole group's drag.
        const actions: UndoAction[] = [];

        for (const member of group) {
          const placement = currentPlacement(member.trackClipId);
          if (!placement) continue;

          if (placement.trackId !== member.trackId) {
            actions.push({
              type: 'MOVE_CLIP_BETWEEN_TRACKS',
              sourceTrackId: member.trackId,
              targetTrackId: placement.trackId,
              trackClipId: member.trackClipId,
              oldPosition: member.start,
              newPosition: placement.trackClip.position,
            });
          } else if (Math.abs(placement.trackClip.position - member.start) > 0.01) {
            actions.push({
              type: 'MOVE_TRACK_CLIP',
              trackId: member.trackId,
              trackClipId: member.trackClipId,
              oldPosition: member.start,
              newPosition: placement.trackClip.position,
            });
          }
        }

        const action = batchActions(actions);
        if (action) useStore.getState().undoManager.addAction(action);
        return;
      }

      // Get the final position from the store
      const state = useStore.getState();
      const finalTrack = state.tracks.find(t => t.id === currentTrackId);
      const currentClip = finalTrack?.clips.find(tc => tc.id === trackClip.id);

      if (currentClip) {
        const finalPosition = currentClip.position;

        // One undo entry for the whole drag
        if (currentTrackId !== startTrackId) {
          // Ended on a different track
          recordClipMovedBetweenTracks(
            startTrackId,
            currentTrackId,
            trackClip.id,
            dragStartPosRef.current,
            finalPosition
          );
        } else if (Math.abs(finalPosition - dragStartPosRef.current) > 0.01) {
          // Same track, position changed
          moveTrackClip(currentTrackId, trackClip.id, dragStartPosRef.current, finalPosition);
        }
      }
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
