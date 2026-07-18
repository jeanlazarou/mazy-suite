import React, { useRef, useEffect } from 'react';
import { Box, Typography } from '@mui/material';
import { useStore } from '../../store/store';

export const DynamicsHistogram: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analysis = useStore((s) => s.analysis);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !analysis?.dynamics) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.fillStyle = 'rgba(13,13,18,1)';
    ctx.fillRect(0, 0, w, h);

    const { histogram, peak_db, rms_db, dynamic_range_db, crest_factor_db } = analysis.dynamics;
    if (!histogram.length) return;

    // Find max for normalization
    const maxVal = Math.max(...histogram, 1);

    // Draw histogram bars
    const barW = w / histogram.length;
    for (let i = 0; i < histogram.length; i++) {
      const val = histogram[i] / maxVal;
      const barH = val * (h - 30);
      const hue = 240 + (1 - i / histogram.length) * 120;
      ctx.fillStyle = `hsla(${hue}, 60%, 50%, 0.7)`;
      ctx.fillRect(i * barW, h - 20 - barH, barW - 1, barH);
    }

    // Labels
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '9px "JetBrains Mono"';
    ctx.fillText('0 dB', w - 28, h - 4);
    ctx.fillText('-60 dB', 2, h - 4);

    // Stats overlay
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '10px "JetBrains Mono"';
    ctx.fillText(`Peak: ${peak_db.toFixed(1)} dB`, 4, 12);
    ctx.fillText(`RMS: ${rms_db.toFixed(1)} dB`, 4, 24);
    ctx.fillText(`DR: ${dynamic_range_db.toFixed(1)} dB`, w / 2, 12);
    ctx.fillText(`Crest: ${crest_factor_db.toFixed(1)} dB`, w / 2, 24);
  }, [analysis]);

  return (
    <Box>
      <Typography variant="body2" sx={{ fontSize: '0.7rem', color: 'text.secondary', mb: 0.5 }}>
        Dynamic Range
      </Typography>
      <Box sx={{ borderRadius: 1, overflow: 'hidden', border: 1, borderColor: 'divider' }}>
        <canvas ref={canvasRef} width={300} height={120} style={{ width: '100%', height: 120, display: 'block' }} />
      </Box>
    </Box>
  );
};
