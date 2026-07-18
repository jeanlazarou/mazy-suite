import React, { useRef, useEffect, useCallback } from 'react';
import { Box } from '@mui/material';
import { useStore } from '../../store/store';

interface SpectrumProps {
  analyser: AnalyserNode | null;
}

export const Spectrum: React.FC<SpectrumProps> = ({ analyser }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const isPlaying = useStore((s) => s.isPlaying);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !analyser) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const bufLen = analyser.frequencyBinCount;
    const data = new Uint8Array(bufLen);
    analyser.getByteFrequencyData(data);

    ctx.fillStyle = 'rgba(13,13,18,0.85)';
    ctx.fillRect(0, 0, w, h);

    // Draw frequency grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    const freqLabels = [100, 1000, 10000];
    const nyquist = 44100 / 2; // approximate
    freqLabels.forEach(f => {
      const x = Math.log10(f / 20) / Math.log10(nyquist / 20) * w;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    });

    // Draw bars with gradient
    const barCount = 128;
    const barW = w / barCount;

    for (let i = 0; i < barCount; i++) {
      // Map bar to log-spaced frequency bin
      const logIdx = Math.pow(i / barCount, 2) * bufLen;
      const idx = Math.min(Math.floor(logIdx), bufLen - 1);
      const val = data[idx] / 255;
      const barH = val * h;

      const hue = 240 + val * 120; // purple to pink
      ctx.fillStyle = `hsla(${hue}, 70%, ${40 + val * 30}%, 0.9)`;
      ctx.fillRect(i * barW, h - barH, barW - 1, barH);
    }

    if (isPlaying) {
      rafRef.current = requestAnimationFrame(draw);
    }
  }, [analyser, isPlaying]);

  useEffect(() => {
    if (isPlaying && analyser) {
      rafRef.current = requestAnimationFrame(draw);
    }
    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying, analyser, draw]);

  // Draw static spectrum from analysis when not playing
  const analysis = useStore((s) => s.analysis);
  useEffect(() => {
    if (isPlaying || !analysis?.spectrum) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.fillStyle = 'rgba(13,13,18,1)';
    ctx.fillRect(0, 0, w, h);

    const { frequencies, magnitudes } = analysis.spectrum;
    if (!frequencies.length) return;

    ctx.strokeStyle = '#6C63FF';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 1; i < frequencies.length; i++) {
      const f = frequencies[i];
      if (f <= 0) continue;
      const x = Math.log10(f / 20) / Math.log10(20000 / 20) * w;
      const y = h - ((magnitudes[i] + 80) / 80) * h;
      if (i === 1) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }, [analysis, isPlaying]);

  return (
    <Box sx={{ borderRadius: 1, overflow: 'hidden' }}>
      <canvas ref={canvasRef} width={600} height={180} style={{ width: '100%', height: 180, display: 'block' }} />
    </Box>
  );
};
