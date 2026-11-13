import { useState, useEffect, useRef } from 'react';
import { history, useStoreFields } from '../store';
import { ClipEffectId } from '../types';
import { clipBefore, heardCrossfade } from '../utils/crossfades';
import { CLIP_EFFECTS } from '../utils/clipEffects';
import Button from '@mui/material/Button';
import FormControlLabel from '@mui/material/FormControlLabel';
import Checkbox from '@mui/material/Checkbox';
import CloseIcon from '@mui/icons-material/Close';
import DeleteIcon from '@mui/icons-material/Delete';
import LinkIcon from '@mui/icons-material/Link';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import ContentCutIcon from '@mui/icons-material/ContentCut';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { NumberField } from './NumberField';
import { VolumeKnob } from './VolumeKnob';
import { duplicateSelection, splitAtPlayhead } from '../utils/arrangeCommands';
import { shortcutLabel } from '../utils/keyboard';

export function ClipPropertiesPanel() {
  const {
    selectedTrackClip,
    selectedTrackClips,
    setSelectedTrackClip,
    tracks,
    clips,
    audioFiles,
    updateTrackClip,
    removeTrackClipGroup,
    linkTrackClips,
    unlinkTrackClips,
  } = useStoreFields(
    'selectedTrackClip',
    'selectedTrackClips',
    'setSelectedTrackClip',
    'tracks',
    'clips',
    'audioFiles',
    'updateTrackClip',
    'removeTrackClipGroup',
    'linkTrackClips',
    'unlinkTrackClips'
  );

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDraggingFadeIn, setIsDraggingFadeIn] = useState(false);
  const [isDraggingFadeOut, setIsDraggingFadeOut] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  // Local state for form controls
  const [fadeIn, setFadeIn] = useState(0);
  const [fadeOut, setFadeOut] = useState(0);
  const [repeat, setRepeat] = useState(false);
  const [repeatCount, setRepeatCount] = useState(2);

  // Resolve the selection. This has to happen before any early return so that
  // every hook below runs on every render (rules-of-hooks).
  const track = selectedTrackClip
    ? tracks.find((t) => t.id === selectedTrackClip.trackId)
    : undefined;
  const trackClip = track?.clips.find((tc) => tc.id === selectedTrackClip?.trackClipId);
  const clip = trackClip ? clips.find((c) => c.id === trackClip.clipId) : undefined;
  const audioFile = clip ? audioFiles.find((f) => f.id === clip.audioFileId) : undefined;

  const groupSize = trackClip?.linkId
    ? tracks.reduce(
        (count, t) =>
          count + t.clips.filter((tc) => tc.linkId === trackClip.linkId).length,
        0
      )
    : 0;

  const effectiveStartTime = trackClip?.trimStart ?? clip?.startTime ?? 0;
  const effectiveEndTime = trackClip?.trimEnd ?? clip?.endTime ?? 0;
  const effectiveDuration = effectiveEndTime - effectiveStartTime;

  // Sync local state when selection changes or when trackClip properties change (e.g., undo/redo)
  useEffect(() => {
    if (trackClip) {
      setFadeIn(trackClip.fadeIn || 0);
      setFadeOut(trackClip.fadeOut || 0);
      setRepeat(trackClip.repeat || false);
      setRepeatCount(trackClip.repeatCount || 2);
    }
  }, [trackClip]);

  // Draw waveform
  useEffect(() => {
    if (!trackClip || !audioFile?.buffer || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvasSize.width;
    const height = canvasSize.height;

    // Skip drawing if canvas hasn't been sized yet
    if (width === 0 || height === 0) return;

    // Clear canvas
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(0, 0, width, height);

    // Draw waveform
    const audioBuffer = audioFile.buffer;
    const channelData = audioBuffer.getChannelData(0);

    // Calculate which part of the audio to display
    const sampleRate = audioBuffer.sampleRate;
    const startSample = Math.floor(effectiveStartTime * sampleRate);
    const endSample = Math.floor(effectiveEndTime * sampleRate);
    const samplesPerPixel = Math.ceil((endSample - startSample) / width);

    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 1;
    ctx.beginPath();

    for (let x = 0; x < width; x++) {
      const sampleIndex = startSample + (x * samplesPerPixel);
      let min = 0;
      let max = 0;

      // Find min and max in this pixel's sample range
      for (let i = 0; i < samplesPerPixel && sampleIndex + i < endSample; i++) {
        const sample = channelData[sampleIndex + i] || 0;
        if (sample < min) min = sample;
        if (sample > max) max = sample;
      }

      const yMin = ((1 - max) / 2) * height;
      const yMax = ((1 - min) / 2) * height;

      if (x === 0) {
        ctx.moveTo(x, yMin);
      } else {
        ctx.lineTo(x, yMin);
      }
      ctx.lineTo(x, yMax);
    }

    ctx.stroke();

    // Draw fade overlays
    const currentFadeIn = trackClip.fadeIn || 0;
    const currentFadeOut = trackClip.fadeOut || 0;

    // Fade in overlay
    if (currentFadeIn > 0) {
      const fadeInWidth = (currentFadeIn / effectiveDuration) * width;
      const gradient = ctx.createLinearGradient(0, 0, fadeInWidth, 0);
      gradient.addColorStop(0, 'rgba(0, 0, 0, 0.5)');
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, fadeInWidth, height);

      // Draw fade in handle
      ctx.fillStyle = '#10b981';
      ctx.fillRect(fadeInWidth - 2, 0, 4, height);
    }

    // Fade out overlay
    if (currentFadeOut > 0) {
      const fadeOutWidth = (currentFadeOut / effectiveDuration) * width;
      const fadeOutStart = width - fadeOutWidth;
      const gradient = ctx.createLinearGradient(fadeOutStart, 0, width, 0);
      gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0.5)');
      ctx.fillStyle = gradient;
      ctx.fillRect(fadeOutStart, 0, fadeOutWidth, height);

      // Draw fade out handle
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(fadeOutStart - 2, 0, 4, height);
    }
  }, [audioFile, effectiveStartTime, effectiveEndTime, effectiveDuration, trackClip, canvasSize]);

  // Handle resize observer for canvas - needs to depend on selected clip to reinitialize
  useEffect(() => {
    if (!containerRef.current || !canvasRef.current) return;

    // Initial sizing
    const rect = containerRef.current.getBoundingClientRect();
    const width = rect.width;
    const height = 100;

    canvasRef.current.width = width;
    canvasRef.current.height = height;
    setCanvasSize({ width, height });

    const resizeObserver = new ResizeObserver(() => {
      if (canvasRef.current && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const width = rect.width;
        const height = 100;

        canvasRef.current.width = width;
        canvasRef.current.height = height;
        setCanvasSize({ width, height });
      }
    });

    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, [selectedTrackClip?.trackClipId]);

  useEffect(() => {
    if (!selectedTrackClip) return;
    if (!isDraggingFadeIn && !isDraggingFadeOut) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!canvasRef.current) return;

      const rect = canvasRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const width = rect.width;

      if (isDraggingFadeIn) {
        const newFadeIn = Math.max(0, Math.min((x / width) * effectiveDuration, effectiveDuration - 0.1));
        setFadeIn(newFadeIn);
        updateTrackClip(selectedTrackClip.trackId, selectedTrackClip.trackClipId, {
          fadeIn: newFadeIn > 0 ? newFadeIn : undefined,
        });
      } else if (isDraggingFadeOut) {
        const newFadeOut = Math.max(0, Math.min(((width - x) / width) * effectiveDuration, effectiveDuration - 0.1));
        setFadeOut(newFadeOut);
        updateTrackClip(selectedTrackClip.trackId, selectedTrackClip.trackClipId, {
          fadeOut: newFadeOut > 0 ? newFadeOut : undefined,
        });
      }
    };

    const handleMouseUp = () => {
      history.endGesture();
      setIsDraggingFadeIn(false);
      setIsDraggingFadeOut(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingFadeIn, isDraggingFadeOut, effectiveDuration, selectedTrackClip, updateTrackClip]);

  // All hooks have run; safe to bail out on an unresolvable selection.
  if (!selectedTrackClip || !trackClip || !clip || !audioFile) {
    return null;
  }

  // Handle mouse interaction for fade controls
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const width = rect.width;

    const currentFadeIn = trackClip.fadeIn || 0;
    const currentFadeOut = trackClip.fadeOut || 0;
    const fadeInWidth = (currentFadeIn / effectiveDuration) * width;
    const fadeOutWidth = (currentFadeOut / effectiveDuration) * width;
    const fadeOutStart = width - fadeOutWidth;

    // Check if clicking near fade in handle
    if (Math.abs(x - fadeInWidth) < 10) {
      history.beginGesture();
      setIsDraggingFadeIn(true);
      e.preventDefault();
      return;
    }

    // Check if clicking near fade out handle
    if (Math.abs(x - fadeOutStart) < 10) {
      history.beginGesture();
      setIsDraggingFadeOut(true);
      e.preventDefault();
      return;
    }
  };

  const handleClose = () => {
    setSelectedTrackClip(null);
  };

  // Deleting a linked clip takes its group with it. Unlink first to keep the
  // others.
  const handleDelete = () => {
    removeTrackClipGroup(selectedTrackClip.trackId, selectedTrackClip.trackClipId);
    setSelectedTrackClip(null);
  };

  const handleGainChange = (value: number) => {
    history.coalesced(`clip-gain:${selectedTrackClip.trackClipId}`, () =>
      updateTrackClip(selectedTrackClip.trackId, selectedTrackClip.trackClipId, {
        gain: Math.abs(value - 1) < 0.005 ? undefined : value,
      })
    );
  };

  const handleLink = () => {
    linkTrackClips(selectedTrackClips);
  };

  const handleUnlink = () => {
    unlinkTrackClips(
      selectedTrackClips.length > 1 ? selectedTrackClips : [selectedTrackClip]
    );
  };

  const { trackId, trackClipId } = selectedTrackClip;

  const handleFadeInChange = (value: number) => {
    setFadeIn(value);
    history.coalesced(`fade-in:${trackClipId}`, () =>
      updateTrackClip(trackId, trackClipId, { fadeIn: value > 0 ? value : undefined })
    );
  };

  const handleFadeOutChange = (value: number) => {
    setFadeOut(value);
    history.coalesced(`fade-out:${trackClipId}`, () =>
      updateTrackClip(trackId, trackClipId, { fadeOut: value > 0 ? value : undefined })
    );
  };

  // A crossfade needs a clip ending right where this one starts. What is heard
  // can be shorter than asked: each side borrows audio from beyond its cut.
  const touching = track ? clipBefore(track, trackClip, clips) : null;
  const askedCrossfade = trackClip.crossfade ?? 0;
  const heard = track ? heardCrossfade(track, trackClip, clips, audioFiles) : 0;

  const handleCrossfadeChange = (value: number) => {
    history.coalesced(`crossfade:${trackClipId}`, () =>
      updateTrackClip(trackId, trackClipId, { crossfade: value > 0 ? value : undefined })
    );
  };

  const currentEffect: ClipEffectId = trackClip.effect ?? 'none';

  const handleEffectChange = (effect: ClipEffectId) => {
    updateTrackClip(selectedTrackClip.trackId, selectedTrackClip.trackClipId, {
      effect: effect === 'none' ? undefined : effect,
    });
  };

  const handleRepeatChange = (checked: boolean) => {
    setRepeat(checked);
    updateTrackClip(selectedTrackClip.trackId, selectedTrackClip.trackClipId, {
      repeat: checked,
      repeatCount: checked ? repeatCount : undefined,
    });
  };

  const handleRepeatCountChange = (value: number) => {
    setRepeatCount(value);
    history.coalesced(`repeat-count:${trackClipId}`, () =>
      updateTrackClip(trackId, trackClipId, { repeatCount: value })
    );
  };

  return (
    <div className="bg-gray-800 border-t border-gray-700 p-4">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-white">Clip Properties: {clip.name}</h3>
          {groupSize > 0 && (
            <span className="text-xs text-gray-400">
              Linked · {groupSize} clips move and trim together
            </span>
          )}
          {groupSize === 0 && selectedTrackClips.length < 2 && (
            <span className="text-xs text-gray-500">
              Ctrl/⌘-click other clips to link them
            </span>
          )}
        </div>
        <div className="flex gap-2">
          {selectedTrackClips.length > 1 && (
            <Button
              onClick={handleLink}
              size="small"
              startIcon={<LinkIcon />}
              sx={{ color: '#60a5fa' }}
            >
              Link {selectedTrackClips.length}
            </Button>
          )}
          {groupSize > 0 && (
            <Button
              onClick={handleUnlink}
              size="small"
              startIcon={<LinkOffIcon />}
              sx={{ color: '#9ca3af' }}
            >
              Unlink
            </Button>
          )}
          <Button
            onClick={splitAtPlayhead}
            size="small"
            startIcon={<ContentCutIcon />}
            sx={{ color: '#d1d5db' }}
            title="Split at the playhead (S)"
          >
            Split
          </Button>
          <Button
            onClick={duplicateSelection}
            size="small"
            startIcon={<ContentCopyIcon />}
            sx={{ color: '#d1d5db' }}
            title={`Place a copy straight after it (${shortcutLabel('D')}). Alt-drag a clip to place a copy anywhere.`}
          >
            Duplicate
          </Button>
          <Button
            onClick={handleDelete}
            size="small"
            startIcon={<DeleteIcon />}
            sx={{ color: '#ef4444' }}
            title="Delete (Delete key)"
          >
            {groupSize > 0 ? `Delete group (${groupSize})` : 'Delete'}
          </Button>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-white transition-colors"
            title="Close properties panel"
          >
            <CloseIcon />
          </button>
        </div>
      </div>

      {/* Short and wide: the timeline above must keep its room. */}
      <div className="flex gap-4 items-start max-h-[40vh] overflow-y-auto pt-2">
        {/* Waveform display */}
        <div className="flex-1 min-w-[16rem] bg-gray-900 rounded-lg p-3">
          <div className="mb-1.5 text-xs text-gray-400">
            Drag the green / red handles to fade in / out
          </div>
          <div ref={containerRef} className="w-full">
            <canvas
              ref={canvasRef}
              className="w-full cursor-crosshair rounded"
              onMouseDown={handleCanvasMouseDown}
            />
          </div>
          <div className="mt-1 flex justify-between text-xs text-gray-500">
            <span>{effectiveStartTime.toFixed(2)}s</span>
            <span>Duration: {effectiveDuration.toFixed(2)}s</span>
            <span>{effectiveEndTime.toFixed(2)}s</span>
          </div>
        </div>

        {/* Controls */}
        <div className="grid grid-cols-3 gap-4 w-[46rem] shrink-0">
          {/* The sound: volume and effect */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <VolumeKnob
                value={trackClip.gain ?? 1}
                onChange={handleGainChange}
                max={2}
                defaultValue={1}
                label="Clip volume"
                size={36}
              />
              <div className="text-sm text-gray-300">
                Volume
                <div className="text-xs text-gray-500">100 as recorded, up to 200</div>
              </div>
            </div>

            <div>
              <div className="text-xs mb-1.5 text-gray-400">Effect</div>
              <div className="flex flex-wrap gap-1.5">
                {CLIP_EFFECTS.map((option) => {
                  const isActive = currentEffect === option.id;
                  return (
                    <button
                      key={option.id}
                      onClick={() => handleEffectChange(option.id)}
                      title={option.description}
                      className={`px-2.5 py-0.5 rounded-full text-xs border transition-colors ${
                        isActive
                          ? 'bg-blue-600 border-blue-400 text-white'
                          : 'bg-gray-900 border-gray-700 text-gray-300 hover:border-gray-500'
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* How it starts and ends */}
          <div className="space-y-3">
            <NumberField
              label="Fade In (seconds)"
              value={fadeIn}
              onChange={handleFadeInChange}
              min={0}
              max={effectiveDuration}
              step={0.1}
              decimals={2}
            />
            <NumberField
              label="Fade Out (seconds)"
              value={fadeOut}
              onChange={handleFadeOutChange}
              min={0}
              max={effectiveDuration}
              step={0.1}
              decimals={2}
            />

            {/* Crossfade with the clip before */}
            {touching ? (
              <div>
                <NumberField
                  label="Crossfade with clip before (s)"
                  value={askedCrossfade}
                  onChange={handleCrossfadeChange}
                  min={0}
                  max={10}
                  step={0.05}
                  decimals={2}
                />
                {askedCrossfade > 0 && heard < askedCrossfade - 0.005 && (
                  <p className="text-xs text-yellow-300 mt-1">
                    {heard.toFixed(2)} s heard: limited by the audio beyond the cut,
                    or by the length of a clip.
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs text-gray-500">
                To crossfade with another clip, place this one right where that one ends -
                Snap makes them touch.
              </p>
            )}
          </div>

          {/* Repeating, and where it sits */}
          <div className="space-y-2">
            <FormControlLabel
              control={
                <Checkbox
                  checked={repeat}
                  onChange={(e) => handleRepeatChange(e.target.checked)}
                  size="small"
                  sx={{ color: 'rgba(255, 255, 255, 0.7)' }}
                />
              }
              label="Repeat"
              sx={{ color: 'white' }}
            />
            {repeat && (
              <NumberField
                label="Repeat Count"
                value={repeatCount}
                onChange={handleRepeatCountChange}
                min={1}
                max={100}
              />
            )}
            <div className="pt-2 border-t border-gray-700 text-xs text-gray-400 space-y-0.5">
              <div>Position: {trackClip.position.toFixed(2)}s</div>
              <div>Track: {track?.name}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
