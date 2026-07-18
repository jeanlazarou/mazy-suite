import React, { useRef, useEffect, useCallback } from 'react';
import { Box, Typography } from '@mui/material';
import { useStore } from '../../store/store';

interface StereoFieldProps {
  analyser: AnalyserNode | null;
}

export const StereoField: React.FC<StereoFieldProps> = ({ analyser }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const isPlaying = useStore((s) => s.isPlaying);
  const originalBuffer = useStore((s) => s.originalBuffer);
  const analysis = useStore((s) => s.analysis);

  const drawLissajous = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = canvas.width;
    const cx = size / 2;
    const cy = size / 2;

    // Fade previous frame
    ctx.fillStyle = 'rgba(13,13,18,0.15)';
    ctx.fillRect(0, 0, size, size);

    // Draw axes
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, 0); ctx.lineTo(cx, size);
    ctx.moveTo(0, cy); ctx.lineTo(size, cy);
    // Diagonals (L and R)
    ctx.moveTo(0, 0); ctx.lineTo(size, size);
    ctx.moveTo(size, 0); ctx.lineTo(0, size);
    ctx.stroke();

    if (!originalBuffer || originalBuffer.numberOfChannels < 2) return;

    // Get recent audio data
    if (analyser && isPlaying) {
      const bufLen = analyser.fftSize;
      const timeData = new Float32Array(bufLen);
      analyser.getFloatTimeDomainData(timeData);

      // Approximate L/R from mono analyser data by using consecutive samples
      ctx.fillStyle = 'rgba(108,99,255,0.4)';
      for (let i = 0; i < bufLen - 1; i += 2) {
        const l = timeData[i];
        const r = timeData[i + 1];
        const x = cx + (l - r) * cx * 0.7;
        const y = cy - (l + r) * cy * 0.7;
        ctx.fillRect(x, y, 1.5, 1.5);
      }
    }

    if (isPlaying) {
      rafRef.current = requestAnimationFrame(drawLissajous);
    }
  }, [analyser, isPlaying, originalBuffer]);

  useEffect(() => {
    if (isPlaying && analyser) {
      rafRef.current = requestAnimationFrame(drawLissajous);
    }
    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying, analyser, drawLissajous]);

  // Draw static from analysis
  useEffect(() => {
    if (isPlaying || !analysis?.stereo_field) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = canvas.width;
    const cx = size / 2;
    const cy = size / 2;

    ctx.fillStyle = 'rgba(13,13,18,1)';
    ctx.fillRect(0, 0, size, size);

    // Axes
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath();
    ctx.moveTo(cx, 0); ctx.lineTo(cx, size);
    ctx.moveTo(0, cy); ctx.lineTo(size, cy);
    ctx.stroke();

    // Draw width indicator
    const { width, correlation } = analysis.stereo_field;
    const radius = width * cx * 0.8;

    ctx.strokeStyle = '#6C63FF';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, radius, cy * 0.6, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Correlation indicator
    const corrColor = correlation > 0.5 ? '#4ADE80' : correlation > 0 ? '#FBBF24' : '#EF4444';
    ctx.fillStyle = corrColor;
    ctx.font = '11px "JetBrains Mono"';
    ctx.fillText(`Corr: ${correlation.toFixed(2)}`, 8, size - 8);
    ctx.fillText(`Width: ${(width * 100).toFixed(0)}%`, 8, size - 22);
  }, [analysis, isPlaying]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <Typography variant="body2" sx={{ fontSize: '0.7rem', color: 'text.secondary', mb: 0.5 }}>
        Stereo Field
      </Typography>
      <Box sx={{ borderRadius: 1, overflow: 'hidden', border: 1, borderColor: 'divider' }}>
        <canvas ref={canvasRef} width={180} height={180} style={{ width: 180, height: 180, display: 'block' }} />
      </Box>
    </Box>
  );
};
