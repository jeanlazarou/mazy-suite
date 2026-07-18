import React, { useRef, useEffect, useMemo } from 'react';
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
  }, [peaks, playbackPosition, fileInfo]);

  return (
    <Box sx={{ borderRadius: 1, overflow: 'hidden' }}>
      <canvas
        ref={canvasRef}
        width={WIDTH}
        height={HEIGHT}
        style={{ width: '100%', height: HEIGHT, display: 'block', cursor: fileInfo ? 'pointer' : 'default' }}
        onClick={(e) => {
          if (!fileInfo) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const pos = ((e.clientX - rect.left) / rect.width) * fileInfo.duration;
          requestSeek(pos);
        }}
      />
    </Box>
  );
};
