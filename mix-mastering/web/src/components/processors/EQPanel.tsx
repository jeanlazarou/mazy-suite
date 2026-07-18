import React, { useCallback, useRef, useEffect } from 'react';
import { Box, Paper, Typography, Collapse } from '@mui/material';
import { ProcessorHeader } from '../controls/ParamSlider';
import { Knob } from '../controls/Knob';
import { useAudioEngine } from '../../hooks/useAudioEngine';
import { useStore } from '../../store/store';
import { EMPTY_PARAMS } from '../../store/constants';

const BAND_COLORS = ['#FF6584', '#FBBF24', '#4ADE80', '#6C63FF', '#A78BFA', '#22D3EE'];
const BAND_LABELS = ['HPF', 'Low', 'Low Mid', 'High Mid', 'High', 'LPF'];

interface EQPanelProps {
  expanded: boolean;
  onExpandToggle: () => void;
}

export const EQPanel: React.FC<EQPanelProps> = ({ expanded, onExpandToggle }) => {
  const { setParam, setProcessorEnabled } = useAudioEngine();
  const params = useStore((s) => s.params['Parametric EQ'] ?? EMPTY_PARAMS);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const enabled = useStore((s) => s.processorEnabled['Parametric EQ'] ?? true);

  const bands = Array.from({ length: 6 }, (_, i) => ({
    freq: params[`band.${i}.freq`] ?? [30, 100, 500, 2000, 8000, 18000][i],
    gain: params[`band.${i}.gain`] ?? 0,
    q: params[`band.${i}.q`] ?? [0.707, 0.707, 1, 1, 0.707, 0.707][i],
  }));

  // Draw EQ curve
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    const freqs = [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
    freqs.forEach(f => {
      const x = Math.log10(f / 20) / Math.log10(20000 / 20) * w;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    });
    [-12, -6, 0, 6, 12].forEach(db => {
      const y = h / 2 - (db / 24) * h;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    });

    // Zero line
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();

    // Draw combined curve (simplified visual)
    ctx.strokeStyle = '#6C63FF';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let px = 0; px < w; px++) {
      const freq = 20 * Math.pow(20000 / 20, px / w);
      let totalGain = 0;
      bands.forEach(band => {
        if (band.gain !== 0) {
          const ratio = freq / band.freq;
          const logRatio = Math.log2(ratio);
          const response = band.gain * Math.exp(-0.5 * logRatio * logRatio * band.q * band.q);
          totalGain += response;
        }
      });
      const y = h / 2 - (totalGain / 24) * h;
      if (px === 0) ctx.moveTo(px, y);
      else ctx.lineTo(px, y);
    }
    ctx.stroke();

    // Draw band dots
    bands.forEach((band, i) => {
      const x = Math.log10(band.freq / 20) / Math.log10(20000 / 20) * w;
      const y = h / 2 - (band.gain / 24) * h;
      ctx.fillStyle = BAND_COLORS[i];
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
    });
  }, [bands]);

  const handleToggle = useCallback((v: boolean) => {
    setProcessorEnabled('Parametric EQ', v);
  }, [setProcessorEnabled]);

  return (
    <Paper sx={{ p: 2 }}>
      <ProcessorHeader title="Parametric EQ" enabled={enabled} onToggle={handleToggle} expanded={expanded} onExpandToggle={onExpandToggle} />
      <Collapse in={expanded}>
        <Box sx={{ mb: 2, borderRadius: 1, overflow: 'hidden', bgcolor: 'rgba(0,0,0,0.3)' }}>
          <canvas ref={canvasRef} width={500} height={150} style={{ width: '100%', height: 150 }} />
        </Box>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', justifyContent: 'center' }}>
          {bands.map((band, i) => (
            <Box key={i} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
              <Typography variant="body2" sx={{ fontSize: '0.65rem', color: BAND_COLORS[i], fontWeight: 600 }}>
                {BAND_LABELS[i]}
              </Typography>
              <Knob
                label="Freq"
                value={band.freq}
                min={20}
                max={20000}
                step={1}
                unit="Hz"
                color={BAND_COLORS[i]}
                onChange={(v) => setParam('Parametric EQ', `band.${i}.freq`, v)}
                size={48}
              />
              <Knob
                label="Gain"
                value={band.gain}
                min={-18}
                max={18}
                step={0.1}
                unit="dB"
                color={BAND_COLORS[i]}
                onChange={(v) => setParam('Parametric EQ', `band.${i}.gain`, v)}
                size={48}
              />
              <Knob
                label="Q"
                value={band.q}
                min={0.1}
                max={10}
                step={0.1}
                color={BAND_COLORS[i]}
                onChange={(v) => setParam('Parametric EQ', `band.${i}.q`, v)}
                size={48}
              />
            </Box>
          ))}
        </Box>
      </Collapse>
    </Paper>
  );
};
