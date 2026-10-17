import React, { useEffect } from 'react';
import { Box } from '@mui/material';
import { useStore } from '../../store/store';
import { useCanvas } from './useCanvas';

interface TimelineStripProps {
  values: number[]; // gain reduction (dB, positive) per time slice
  scaleDB: number; // reduction drawn at full height
  color: string;
  height?: number;
}

/** Gain reduction across the track, hanging from the top edge, with the
 *  playhead. Click to jump there. */
export const TimelineStrip: React.FC<TimelineStripProps> = ({ values, scaleDB, color, height = 44 }) => {
  const { ref, width, begin, pos } = useCanvas(height);
  const duration = useStore((s) => s.originalBuffer?.duration ?? 0);
  const position = useStore((s) => s.playbackPosition);
  const requestSeek = useStore((s) => s.requestSeek);

  useEffect(() => {
    const ctx = begin();
    if (!ctx) return;
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    ctx.fillRect(0, 0, width, height);
    const n = values.length;
    if (n) {
      ctx.fillStyle = color;
      const bw = width / n;
      for (let i = 0; i < n; i++) {
        const h = Math.min(1, values[i] / scaleDB) * (height - 2);
        if (h > 0.5) ctx.fillRect(i * bw, 0, Math.max(1, bw - 0.2), h);
      }
    }
    if (duration > 0) {
      const x = Math.round((position / duration) * width) + 0.5;
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
    }
  }, [values, scaleDB, color, width, height, position, duration]);

  return (
    <Box sx={{ borderRadius: 1, overflow: 'hidden', bgcolor: 'rgba(0,0,0,0.3)' }}>
      <canvas
        ref={ref}
        style={{ width: '100%', height, display: 'block', cursor: duration ? 'pointer' : 'default' }}
        onClick={(e) => duration && requestSeek(Math.max(0, Math.min(1, pos(e).x / width)) * duration)}
      />
    </Box>
  );
};

/** Index of the time slice under the playhead, or null. */
export function useTimelineIndex(slices: number): number | null {
  const duration = useStore((s) => s.originalBuffer?.duration ?? 0);
  const position = useStore((s) => s.playbackPosition);
  const isPlaying = useStore((s) => s.isPlaying);
  if (!isPlaying || !duration || !slices) return null;
  return Math.min(slices - 1, Math.max(0, Math.floor((position / duration) * slices)));
}
