import React, { useRef, useEffect, useMemo, useState } from 'react';
import { Box } from '@mui/material';
import { useStore } from '../../store/store';

const WIDTH = 800;
const HEIGHT = 100;

// Min/max envelope per pixel column, computed once per buffer — the render
// path must never rescan the samples (that made playback freeze the UI on
// real-length tracks: an O(samples) pass on every position tick).
function computePeaks(buffer: AudioBuffer): { mins: Float32Array; maxs: Float32Array } {
  const data = buffer.getChannelData(0);
  const mins = new Float32Array(WIDTH);
  const maxs = new Float32Array(WIDTH);
  const samplesPerPixel = Math.ceil(data.length / WIDTH);
  for (let px = 0; px < WIDTH; px++) {
    const start = px * samplesPerPixel;
    const end = Math.min(start + samplesPerPixel, data.length);
    let min = 0, max = 0;
    for (let i = start; i < end; i++) {
      if (data[i] < min) min = data[i];
      if (data[i] > max) max = data[i];
    }
    mins[px] = min;
    maxs[px] = max;
  }
  return { mins, maxs };
}

export const Waveform: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const originalBuffer = useStore((s) => s.originalBuffer);
  const processedBuffer = useStore((s) => s.processedBuffer);
  const listenMode = useStore((s) => s.listenMode);
  const playbackPosition = useStore((s) => s.playbackPosition);
  const fileInfo = useStore((s) => s.fileInfo);
  const requestSeek = useStore((s) => s.requestSeek);
  const loopRegion = useStore((s) => s.loopRegion);
  const setLoopRegion = useStore((s) => s.setLoopRegion);
  // A click jumps there; a drag marks the part to loop. While dragging,
  // the selection so far (seconds).
  const press = useRef<{ x: number; time: number } | null>(null);
  const [selecting, setSelecting] = useState<{ start: number; end: number } | null>(null);
  const region = selecting ?? loopRegion;

  const buffer = listenMode === 'original' ? originalBuffer : (processedBuffer || originalBuffer);
  const peaks = useMemo(() => (buffer ? computePeaks(buffer) : null), [buffer]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !peaks) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Draw waveform from the cached envelope
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(0, 0, w, h);

    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, '#6C63FF');
    gradient.addColorStop(0.5, '#A78BFA');
    gradient.addColorStop(1, '#6C63FF');

    ctx.strokeStyle = gradient;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let px = 0; px < w; px++) {
      ctx.moveTo(px, (1 - peaks.maxs[px]) * h / 2);
      ctx.lineTo(px, (1 - peaks.mins[px]) * h / 2);
    }
    ctx.stroke();

    // Loop region: the rest of the track dimmed, the region's edges marked
    if (region && fileInfo && fileInfo.duration > 0) {
      const x0 = (region.start / fileInfo.duration) * w, x1 = (region.end / fileInfo.duration) * w;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, x0, h);
      ctx.fillRect(x1, 0, w - x1, h);
      ctx.fillStyle = 'rgba(52,211,153,0.12)';
      ctx.fillRect(x0, 0, x1 - x0, h);
      ctx.fillStyle = '#34D399';
      ctx.fillRect(x0, 0, 2, h);
      ctx.fillRect(x1 - 2, 0, 2, h);
    }

    // Playback position
    if (fileInfo && fileInfo.duration > 0) {
      const posX = (playbackPosition / fileInfo.duration) * w;
      ctx.strokeStyle = '#FF6584';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(posX, 0);
      ctx.lineTo(posX, h);
      ctx.stroke();
    }
  }, [peaks, playbackPosition, fileInfo, region]);

  const timeAt = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * (fileInfo?.duration ?? 0);
  };

  return (
    <Box sx={{ borderRadius: 1, overflow: 'hidden' }}>
      <canvas
        ref={canvasRef}
        width={WIDTH}
        height={HEIGHT}
        title="Click to jump there · drag to loop a part · click outside the loop to remove it"
        style={{ width: '100%', height: HEIGHT, display: 'block', touchAction: 'none', cursor: fileInfo ? 'pointer' : 'default' }}
        onPointerDown={(e) => {
          if (!fileInfo) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          press.current = { x: e.clientX, time: timeAt(e) };
        }}
        onPointerMove={(e) => {
          if (!press.current || (!selecting && Math.abs(e.clientX - press.current.x) < 5)) return;
          const t = timeAt(e);
          setSelecting({ start: Math.min(press.current.time, t), end: Math.max(press.current.time, t) });
        }}
        onPointerUp={(e) => {
          if (!press.current) return;
          const at = press.current.time;
          press.current = null;
          if (selecting) {
            setSelecting(null);
            // Too short to be meant as a loop: leave things as they were.
            if (selecting.end - selecting.start >= 0.25) setLoopRegion(selecting);
            return;
          }
          if (loopRegion && (at < loopRegion.start || at >= loopRegion.end)) setLoopRegion(null);
          requestSeek(timeAt(e));
        }}
        onPointerCancel={() => { press.current = null; setSelecting(null); }}
      />
    </Box>
  );
};
