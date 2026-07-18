import { useState, useEffect, useRef } from 'react';
import { useStore } from '../store';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import FormControlLabel from '@mui/material/FormControlLabel';
import Checkbox from '@mui/material/Checkbox';
import CloseIcon from '@mui/icons-material/Close';
import DeleteIcon from '@mui/icons-material/Delete';

export function ClipPropertiesPanel() {
  const {
    selectedTrackClip,
    setSelectedTrackClip,
    tracks,
    clips,
    audioFiles,
    updateTrackClip,
    removeClipFromTrack,
  } = useStore();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDraggingFadeIn, setIsDraggingFadeIn] = useState(false);
  const [isDraggingFadeOut, setIsDraggingFadeOut] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const dragStartValuesRef = useRef<{ fadeIn: number; fadeOut: number }>({ fadeIn: 0, fadeOut: 0 });

  // Local state for form controls
  const [fadeIn, setFadeIn] = useState(0);
  const [fadeOut, setFadeOut] = useState(0);
  const [repeat, setRepeat] = useState(false);
  const [repeatCount, setRepeatCount] = useState(2);

  if (!selectedTrackClip) return null;

  const track = tracks.find((t) => t.id === selectedTrackClip.trackId);
  const trackClip = track?.clips.find((tc) => tc.id === selectedTrackClip.trackClipId);
  const clip = trackClip ? clips.find((c) => c.id === trackClip.clipId) : null;
  const audioFile = clip ? audioFiles.find((f) => f.id === clip.audioFileId) : null;

  if (!trackClip || !clip || !audioFile) {
    return null;
  }

  const effectiveStartTime = trackClip.trimStart ?? clip.startTime;
  const effectiveEndTime = trackClip.trimEnd ?? clip.endTime;
  const effectiveDuration = effectiveEndTime - effectiveStartTime;

  // Sync local state when selection changes or when trackClip properties change (e.g., undo/redo)
  useEffect(() => {
    if (trackClip) {
      setFadeIn(trackClip.fadeIn || 0);
      setFadeOut(trackClip.fadeOut || 0);
      setRepeat(trackClip.repeat || false);
      setRepeatCount(trackClip.repeatCount || 2);
    }
  }, [trackClip?.id, trackClip?.fadeIn, trackClip?.fadeOut, trackClip?.repeat, trackClip?.repeatCount]);

  // Draw waveform
  useEffect(() => {
    if (!canvasRef.current || !audioFile.buffer) return;

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
  }, [audioFile, effectiveStartTime, effectiveEndTime, effectiveDuration, trackClip.fadeIn, trackClip.fadeOut, canvasSize]);

  // Handle resize observer for canvas - needs to depend on selected clip to reinitialize
  useEffect(() => {
    if (!containerRef.current || !canvasRef.current) return;

    // Initial sizing
    const rect = containerRef.current.getBoundingClientRect();
    const width = rect.width;
    const height = 120;

    canvasRef.current.width = width;
    canvasRef.current.height = height;
    setCanvasSize({ width, height });

    const resizeObserver = new ResizeObserver(() => {
      if (canvasRef.current && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const width = rect.width;
        const height = 120;

        canvasRef.current.width = width;
        canvasRef.current.height = height;
        setCanvasSize({ width, height });
      }
    });

    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, [selectedTrackClip?.trackClipId]);

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
      dragStartValuesRef.current = { fadeIn: currentFadeIn, fadeOut: currentFadeOut };
      setIsDraggingFadeIn(true);
      e.preventDefault();
      return;
    }

    // Check if clicking near fade out handle
    if (Math.abs(x - fadeOutStart) < 10) {
      dragStartValuesRef.current = { fadeIn: currentFadeIn, fadeOut: currentFadeOut };
      setIsDraggingFadeOut(true);
      e.preventDefault();
      return;
    }
  };

  useEffect(() => {
    if (!isDraggingFadeIn && !isDraggingFadeOut) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!canvasRef.current) return;

      const rect = canvasRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const width = rect.width;

      if (isDraggingFadeIn) {
        const newFadeIn = Math.max(0, Math.min((x / width) * effectiveDuration, effectiveDuration - 0.1));
        setFadeIn(newFadeIn);
        // Update without adding to undo history during drag
        updateTrackClip(selectedTrackClip.trackId, selectedTrackClip.trackClipId, {
          fadeIn: newFadeIn > 0 ? newFadeIn : undefined,
        }, false);
      } else if (isDraggingFadeOut) {
        const newFadeOut = Math.max(0, Math.min(((width - x) / width) * effectiveDuration, effectiveDuration - 0.1));
        setFadeOut(newFadeOut);
        // Update without adding to undo history during drag
        updateTrackClip(selectedTrackClip.trackId, selectedTrackClip.trackClipId, {
          fadeOut: newFadeOut > 0 ? newFadeOut : undefined,
        }, false);
      }
    };

    const handleMouseUp = () => {
      // Add single undo action when drag completes
      const { undoManager, tracks } = useStore.getState();
      const track = tracks.find(t => t.id === selectedTrackClip.trackId);
      const currentTrackClip = track?.clips.find(tc => tc.id === selectedTrackClip.trackClipId);

      if (currentTrackClip) {
        const finalFadeIn = currentTrackClip.fadeIn;
        const finalFadeOut = currentTrackClip.fadeOut;
        const startFadeIn = dragStartValuesRef.current.fadeIn;
        const startFadeOut = dragStartValuesRef.current.fadeOut;

        // Only add undo action if values actually changed
        if (finalFadeIn !== startFadeIn || finalFadeOut !== startFadeOut) {
          undoManager.addAction({
            type: 'UPDATE_TRACK_CLIP_OPTIONS',
            trackId: selectedTrackClip.trackId,
            trackClipId: selectedTrackClip.trackClipId,
            oldValues: { fadeIn: startFadeIn, fadeOut: startFadeOut },
            newValues: { fadeIn: finalFadeIn, fadeOut: finalFadeOut },
          });
        }
      }

      setIsDraggingFadeIn(false);
      setIsDraggingFadeOut(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingFadeIn, isDraggingFadeOut, effectiveDuration, selectedTrackClip]);

  const handleClose = () => {
    setSelectedTrackClip(null);
  };

  const handleDelete = () => {
    removeClipFromTrack(selectedTrackClip.trackId, selectedTrackClip.trackClipId);
    setSelectedTrackClip(null);
  };

  const handleFadeInChange = (value: number) => {
    setFadeIn(value);
    updateTrackClip(selectedTrackClip.trackId, selectedTrackClip.trackClipId, {
      fadeIn: value > 0 ? value : undefined,
    });
  };

  const handleFadeOutChange = (value: number) => {
    setFadeOut(value);
    updateTrackClip(selectedTrackClip.trackId, selectedTrackClip.trackClipId, {
      fadeOut: value > 0 ? value : undefined,
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
    updateTrackClip(selectedTrackClip.trackId, selectedTrackClip.trackClipId, {
      repeatCount: value,
    });
  };

  return (
    <div className="bg-gray-800 border-t border-gray-700 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold text-white">Clip Properties: {clip.name}</h3>
        <div className="flex gap-2">
          <Button
            onClick={handleDelete}
            size="small"
            startIcon={<DeleteIcon />}
            sx={{ color: '#ef4444' }}
          >
            Delete
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

      <div className="grid grid-cols-[1fr,300px] gap-4">
        {/* Waveform display */}
        <div className="bg-gray-900 rounded-lg p-3">
          <div className="mb-2 text-sm text-gray-400">
            Waveform - Drag green/red handles to adjust fade in/out
          </div>
          <div ref={containerRef} className="w-full">
            <canvas
              ref={canvasRef}
              className="w-full cursor-crosshair rounded"
              onMouseDown={handleCanvasMouseDown}
            />
          </div>
          <div className="mt-2 flex justify-between text-xs text-gray-500">
            <span>{effectiveStartTime.toFixed(2)}s</span>
            <span>Duration: {effectiveDuration.toFixed(2)}s</span>
            <span>{effectiveEndTime.toFixed(2)}s</span>
          </div>
        </div>

        {/* Controls */}
        <div className="space-y-4">
          {/* Fade In */}
          <div>
            <TextField
              label="Fade In (seconds)"
              type="number"
              value={fadeIn.toFixed(2)}
              onChange={(e) => handleFadeInChange(Math.max(0, parseFloat(e.target.value) || 0))}
              fullWidth
              inputProps={{ min: 0, max: effectiveDuration, step: 0.1 }}
              variant="outlined"
              size="small"
              sx={{
                '& .MuiOutlinedInput-root': {
                  color: 'white',
                  '& fieldset': { borderColor: 'rgba(255, 255, 255, 0.23)' },
                  '&:hover fieldset': { borderColor: 'rgba(255, 255, 255, 0.4)' },
                },
                '& .MuiInputLabel-root': { color: 'rgba(255, 255, 255, 0.7)' },
              }}
            />
          </div>

          {/* Fade Out */}
          <div>
            <TextField
              label="Fade Out (seconds)"
              type="number"
              value={fadeOut.toFixed(2)}
              onChange={(e) => handleFadeOutChange(Math.max(0, parseFloat(e.target.value) || 0))}
              fullWidth
              inputProps={{ min: 0, max: effectiveDuration, step: 0.1 }}
              variant="outlined"
              size="small"
              sx={{
                '& .MuiOutlinedInput-root': {
                  color: 'white',
                  '& fieldset': { borderColor: 'rgba(255, 255, 255, 0.23)' },
                  '&:hover fieldset': { borderColor: 'rgba(255, 255, 255, 0.4)' },
                },
                '& .MuiInputLabel-root': { color: 'rgba(255, 255, 255, 0.7)' },
              }}
            />
          </div>

          {/* Repeat */}
          <div>
            <FormControlLabel
              control={
                <Checkbox
                  checked={repeat}
                  onChange={(e) => handleRepeatChange(e.target.checked)}
                  sx={{ color: 'rgba(255, 255, 255, 0.7)' }}
                />
              }
              label="Repeat"
              sx={{ color: 'white' }}
            />
            {repeat && (
              <TextField
                label="Repeat Count"
                type="number"
                value={repeatCount}
                onChange={(e) => handleRepeatCountChange(Math.max(1, parseInt(e.target.value) || 1))}
                fullWidth
                inputProps={{ min: 1, max: 100 }}
                variant="outlined"
                size="small"
                sx={{
                  mt: 1,
                  '& .MuiOutlinedInput-root': {
                    color: 'white',
                    '& fieldset': { borderColor: 'rgba(255, 255, 255, 0.23)' },
                    '&:hover fieldset': { borderColor: 'rgba(255, 255, 255, 0.4)' },
                  },
                  '& .MuiInputLabel-root': { color: 'rgba(255, 255, 255, 0.7)' },
                }}
              />
            )}
          </div>

          {/* Position info */}
          <div className="pt-4 border-t border-gray-700">
            <div className="text-sm text-gray-400 space-y-1">
              <div>Position: {trackClip.position.toFixed(2)}s</div>
              <div>Track: {track?.name}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
