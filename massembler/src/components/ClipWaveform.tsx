import { memo, useEffect, useRef } from 'react';
import { drawWaveform } from '../utils/waveformPeaks';

/**
 * Canvas pixels are capped: a long clip at high zoom would otherwise ask for
 * a canvas wider than browsers allow. Past the cap the drawing is stretched.
 */
const MAX_CANVAS_WIDTH = 4096;

interface ClipWaveformProps {
  buffer: AudioBuffer;
  /** The stretch of the buffer the clip plays, in seconds. */
  start: number;
  end: number;
  /** Width the clip takes on the timeline, in CSS pixels. */
  width: number;
  /** Drawn mirrored, for clips that play backwards. */
  reversed?: boolean;
  /** The clip's volume, which the drawing follows. */
  gain?: number;
}

/** A clip's waveform, filling the block it sits in. */
export const ClipWaveform = memo(function ClipWaveform({
  buffer,
  start,
  end,
  width,
  reversed = false,
  gain = 1,
}: ClipWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.min(MAX_CANVAS_WIDTH, Math.max(1, Math.round(width * ratio)));
    canvas.height = Math.max(1, Math.round(canvas.clientHeight * ratio));
    drawWaveform(canvas, buffer, start, end, 'rgba(191, 219, 254, 0.55)', gain);
  }, [buffer, start, end, width, gain]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={reversed ? { transform: 'scaleX(-1)' } : undefined}
    />
  );
});
