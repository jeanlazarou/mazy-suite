import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Paper, Collapse, Typography } from '@mui/material';
import { Knob } from '../controls/Knob';
import { ProcessorHeader } from '../controls/ParamSlider';
import { usePanelView, ViewToggle } from '../controls/PanelView';
import { useCanvas } from '../controls/useCanvas';
import { useDragParams } from '../controls/useDragParams';
import { useAudioEngine } from '../../hooks/useAudioEngine';
import { useStore } from '../../store/store';
import { freqToX, xToFreq } from '../../audio/eqMath';
import { shapeCurve } from './EQGraph';

interface ExciterPanelProps {
  expanded: boolean;
  onExpandToggle: () => void;
}

interface ExciterPanelBaseProps extends ExciterPanelProps {
  procName: 'Bass Exciter' | 'Treble Exciter';
  title: string;
  freqMin: number;
  freqMax: number;
  freqDefault: number;
  color: string;
}

// Shared by BassExciterPanel/TrebleExciterPanel below. Unlike every other
// processor panel, exciters default OFF (they're a creative addition, not
// a corrective one — see NewFullChain in pkg/engine), so the enabled read
// falls back to false, not true.
const ExciterPanelBase: React.FC<ExciterPanelBaseProps> = ({
  procName, title, freqMin, freqMax, freqDefault, color, expanded, onExpandToggle,
}) => {
  const { setParam, setProcessorEnabled } = useAudioEngine();
  const { params, edit, setDragging } = useDragParams(procName);
  const enabled = useStore((s) => s.processorEnabled[procName] ?? false);
  const [view, setView] = usePanelView(procName === 'Bass Exciter' ? 'bassExciter' : 'trebleExciter');

  const bass = procName === 'Bass Exciter';
  const freq = params.frequency ?? freqDefault;
  const drive = params.drive ?? 0.3;
  const mix = params.mix ?? 0.2;

  const knob = (label: string, param: string, value: number, min: number, max: number, step: number, unit?: string, size?: number) => (
    <Knob label={label} value={value} min={min} max={max} step={step} unit={unit}
      color={color} size={size} onChange={(v) => setParam(procName, param, v)} />
  );

  return (
    <Paper sx={{ p: 2 }}>
      <ProcessorHeader title={title} enabled={enabled} onToggle={(v) => setProcessorEnabled(procName, v)} expanded={expanded} onExpandToggle={onExpandToggle} />
      <Collapse in={expanded}>
        <Box sx={{ mb: 1 }}>
          <ViewToggle view={view} onChange={setView} visualLabel="Harmonics" />
        </Box>
        {view === 'visual' ? (
          <>
            <HarmonicsGraph
              bass={bass} freq={freq} mix={mix} drive={drive} color={color} active={enabled}
              freqMin={freqMin} freqMax={freqMax} onEdit={edit} onDrag={setDragging}
            />
            <Typography sx={{ fontSize: '0.75rem', mt: 1 }}>
              {bass
                ? `Makes bass audible on small speakers: adds overtones above ${Math.round(freq)} Hz, made from the bass below it.`
                : `Adds sparkle: new overtones made from the highs above ${(freq / 1000).toFixed(1)} kHz.`}
            </Typography>
            <Typography sx={{ fontSize: '0.7rem', color: enabled ? 'text.secondary' : '#FBBF24', mt: 0.5 }}>
              {enabled
                ? 'Drag the dot: sideways for where, up for how much. Drive sets how gritty the overtones are.'
                : 'Off — switch it on to hear it. Settings can be prepared meanwhile.'}
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', mt: 1 }}>
              {knob('Drive', 'drive', drive, 0, 1, 0.01, undefined, 44)}
            </Box>
          </>
        ) : (
          <Box sx={{ display: 'flex', gap: 3, justifyContent: 'center' }}>
            {knob('Frequency', 'frequency', freq, freqMin, freqMax, 10, 'Hz')}
            {knob('Drive', 'drive', drive, 0, 1, 0.01)}
            {knob('Mix', 'mix', mix, 0, 1, 0.01)}
          </Box>
        )}
      </Collapse>
    </Paper>
  );
};

interface HarmonicsGraphProps {
  bass: boolean;
  freq: number;
  mix: number;
  drive: number;
  color: string;
  active: boolean;
  freqMin: number;
  freqMax: number;
  onEdit: (patch: Record<string, number>) => void;
  onDrag: (on: boolean) => void;
}

const HEIGHT = 160;
const MIX_TOP = 24; // y of mix = 1

const HarmonicsGraph: React.FC<HarmonicsGraphProps> = ({
  bass, freq, mix, drive, color, active, freqMin, freqMax, onEdit, onDrag,
}) => {
  const { ref, width, begin, pos } = useCanvas(HEIGHT);
  const analysis = useStore((s) => s.analysis);
  const dragging = useRef(false);
  const [hover, setHover] = useState(false);

  const spectrum = useMemo(() => {
    if (!analysis) return null;
    const s = analysis.spectrum;
    return shapeCurve(s.magnitudes, s.frequencies[1] ?? 1, 160);
  }, [analysis]);

  const base = HEIGHT - 14;
  const mixToY = (m: number) => base - m * (base - MIX_TOP);
  const yToMix = (y: number) => (base - y) / (base - MIX_TOP);
  const hx = freqToX(freq, width);
  const hy = mixToY(mix);

  useEffect(() => {
    const ctx = begin();
    if (!ctx) return;
    ctx.globalAlpha = active ? 1 : 0.45;

    // Grid
    ctx.font = '9px sans-serif';
    ctx.textBaseline = 'bottom';
    for (const [f, l] of [[50, '50'], [100, '100'], [200, '200'], [500, '500'], [1000, '1k'], [2000, '2k'], [5000, '5k'], [10000, '10k']] as const) {
      const x = Math.round(freqToX(f, width)) + 0.5;
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, base); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fillText(l, x + 2, HEIGHT - 2);
    }

    // The track's spectrum
    if (spectrum) {
      ctx.beginPath();
      for (let p = 0; p < spectrum.length; p++) {
        const x = (p / (spectrum.length - 1)) * width;
        const y = Math.min(base, base * 0.45 - (spectrum[p] / 60) * base);
        if (p === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.lineTo(width, base); ctx.lineTo(0, base); ctx.closePath();
      ctx.fillStyle = 'rgba(148,163,184,0.12)';
      ctx.fill();
    }

    // Source band and where its overtones land (odd harmonics, mostly the
    // 3rd and 5th; the post filter keeps only what lies above the split).
    const srcLo = bass ? 20 : freq, srcHi = bass ? freq : 20000;
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(freqToX(srcLo, width), 0, freqToX(srcHi, width) - freqToX(srcLo, width), base);
    // Labels centered over their region, kept inside the canvas.
    ctx.textBaseline = 'top';
    ctx.textAlign = 'center';
    const labelAt = (text: string, lo: number, hi: number, y: number) => {
      const tw = ctx.measureText(text).width;
      const x = Math.max(tw / 2 + 4, Math.min(width - tw / 2 - 4, (freqToX(lo, width) + freqToX(hi, width)) / 2));
      ctx.fillText(text, x, y);
    };
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    labelAt('source', srcLo, srcHi, 4);

    const hLo = bass ? freq : Math.min(20000, freq * 2), hHi = bass ? Math.min(20000, freq * 5) : 20000;
    const x0 = freqToX(hLo, width), x1 = freqToX(hHi, width);
    const grad = ctx.createLinearGradient(x0, 0, x1, 0);
    grad.addColorStop(0, color + 'cc');
    grad.addColorStop(1, color + '11');
    ctx.fillStyle = grad;
    ctx.fillRect(x0, hy, x1 - x0, base - hy);
    ctx.fillStyle = color;
    labelAt('added overtones', hLo, hHi, 17);

    // Split line and handle
    ctx.strokeStyle = color;
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(hx, 0); ctx.lineTo(hx, base); ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(hx, hy, hover || dragging.current ? 7 : 6, 0, Math.PI * 2); ctx.fill();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    const label = `${freq >= 1000 ? `${(freq / 1000).toFixed(1)} kHz` : `${Math.round(freq)} Hz`} · ${Math.round(mix * 100)}%`;
    ctx.fillText(label, hx + 10 > width - 90 ? hx - 95 : hx + 10, hy);

    // Drive: the saturation curve, in a corner inset.
    const iw = 44, ih = 44, ix = bass ? width - iw - 6 : 6, iy = 6;
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.strokeRect(ix, iy, iw, ih);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const k = 1 + drive * 10;
    for (let i = 0; i <= iw; i++) {
      const xin = (i / iw) * 2 - 1;
      const yout = Math.tanh(xin * k) / Math.tanh(k);
      const py = iy + ih / 2 - yout * (ih / 2 - 2);
      if (i === 0) ctx.moveTo(ix + i, py); else ctx.lineTo(ix + i, py);
    }
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('drive', ix + iw / 2, iy + ih + 2);
    ctx.globalAlpha = 1;
  }, [width, spectrum, bass, freq, mix, drive, color, active, hover]);

  const near = (x: number, y: number) => Math.hypot(x - hx, y - hy) < 14;

  return (
    <Box sx={{ borderRadius: 1, overflow: 'hidden', bgcolor: 'rgba(0,0,0,0.3)' }}>
      <canvas
        ref={ref}
        style={{ width: '100%', height: HEIGHT, display: 'block', touchAction: 'none', cursor: hover ? 'grab' : 'default' }}
        onPointerDown={(e) => {
          const { x, y } = pos(e);
          if (!near(x, y)) return;
          (e.target as Element).setPointerCapture(e.pointerId);
          dragging.current = true;
          onDrag(true);
        }}
        onPointerMove={(e) => {
          const { x, y } = pos(e);
          if (!dragging.current) { setHover(near(x, y)); return; }
          const f = Math.max(freqMin, Math.min(freqMax, xToFreq(x, width)));
          onEdit({
            frequency: Math.round(f / 10) * 10,
            mix: Math.round(Math.max(0, Math.min(1, yToMix(y))) * 100) / 100,
          });
        }}
        onPointerUp={() => { dragging.current = false; onDrag(false); }}
        onPointerCancel={() => { dragging.current = false; onDrag(false); }}
        onPointerLeave={() => setHover(false)}
      />
    </Box>
  );
};

export const BassExciterPanel: React.FC<ExciterPanelProps> = (props) => (
  <ExciterPanelBase
    procName="Bass Exciter" title="Bass Exciter"
    freqMin={60} freqMax={300} freqDefault={120} color="#F59E0B"
    {...props}
  />
);

export const TrebleExciterPanel: React.FC<ExciterPanelProps> = (props) => (
  <ExciterPanelBase
    procName="Treble Exciter" title="Treble Exciter"
    freqMin={2000} freqMax={10000} freqDefault={5000} color="#FBBF24"
    {...props}
  />
);
