import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Paper, Collapse, Typography } from '@mui/material';
import { Knob } from '../controls/Knob';
import { ProcessorHeader } from '../controls/ParamSlider';
import { usePanelView, ViewToggle } from '../controls/PanelView';
import { useCanvas } from '../controls/useCanvas';
import { useDragParams } from '../controls/useDragParams';
import { useAudioEngine } from '../../hooks/useAudioEngine';
import { useStore } from '../../store/store';

const PROC = 'Saturation';
const COLOR = '#F97316';

// TS copy of saturationCurve in pkg/dsp/saturation.go — keep in sync: an
// asymmetric tanh with zero output and unit slope at zero input.
const BIAS = 0.2;
function saturationCurve(drive: number): (x: number) => number {
  const k = drive * 3;
  if (k < 1e-6) return (x) => x;
  const c = k * BIAS;
  const t0 = Math.tanh(c);
  const norm = k * (1 - t0 * t0);
  return (x) => (Math.tanh(k * x + c) - t0) / norm;
}

// Overtones (2nd..5th, dB re. the note) the curve gives a loud note.
const NOTE = 0.5; // -6 dBFS
function harmonics(drive: number): number[] {
  const f = saturationCurve(drive);
  const n = 512;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = f(NOTE * Math.sin((2 * Math.PI * i) / n));
  const level = (h: number) => {
    let re = 0, im = 0;
    for (let i = 0; i < n; i++) {
      re += out[i] * Math.cos((2 * Math.PI * h * i) / n);
      im += out[i] * Math.sin((2 * Math.PI * h * i) / n);
    }
    return Math.hypot(re, im);
  };
  const fund = level(1);
  return [2, 3, 4, 5].map((h) => 20 * Math.log10(level(h) / fund + 1e-9));
}

interface SaturationPanelProps {
  expanded: boolean;
  onExpandToggle: () => void;
}

// Starts off, like the exciters: it's color, not correction (the Warm
// version switches it on).
export const SaturationPanel: React.FC<SaturationPanelProps> = ({ expanded, onExpandToggle }) => {
  const { setParam, setProcessorEnabled } = useAudioEngine();
  const { params, edit, setDragging } = useDragParams(PROC);
  const enabled = useStore((s) => s.processorEnabled[PROC] ?? false);
  const [view, setView] = usePanelView('saturation');
  const drive = params.drive ?? 0.3;
  const h = useMemo(() => harmonics(drive), [drive]);

  return (
    <Paper sx={{ p: 2 }}>
      <ProcessorHeader title="Saturation" enabled={enabled} onToggle={(v) => setProcessorEnabled(PROC, v)} expanded={expanded} onExpandToggle={onExpandToggle} />
      <Collapse in={expanded}>
        <Box sx={{ mb: 1 }}>
          <ViewToggle view={view} onChange={setView} visualLabel="Curve" />
        </Box>
        {view === 'visual' ? (
          <>
            <CurveGraph drive={drive} harm={h} active={enabled} onEdit={edit} onDrag={setDragging} />
            <Typography sx={{ fontSize: '0.75rem', mt: 1 }}>
              Analog-style warmth: loud moments are rounded off and gain overtones, mostly the warm 2nd;
              quiet passages pass through. On a loud note: 2nd {h[0].toFixed(0)} dB, 3rd {h[1].toFixed(0)} dB.
            </Typography>
            <Typography sx={{ fontSize: '0.7rem', color: enabled ? 'text.secondary' : '#FBBF24', mt: 0.5 }}>
              {enabled
                ? 'Drag up or down on the curve for more or less drive.'
                : 'Off — switch it on to hear it. Settings can be prepared meanwhile.'}
            </Typography>
          </>
        ) : (
          <Box sx={{ display: 'flex', gap: 3, justifyContent: 'center' }}>
            <Knob label="Drive" value={drive} min={0} max={1} step={0.01} color={COLOR}
              onChange={(v) => setParam(PROC, 'drive', v)} />
          </Box>
        )}
      </Collapse>
    </Paper>
  );
};

const HEIGHT = 150;

const CurveGraph: React.FC<{
  drive: number;
  harm: number[];
  active: boolean;
  onEdit: (patch: Record<string, number>) => void;
  onDrag: (on: boolean) => void;
}> = ({ drive, harm, active, onEdit, onDrag }) => {
  const { ref, width, begin, pos } = useCanvas(HEIGHT);
  const drag = useRef<{ y: number; drive: number } | null>(null);
  const [hover, setHover] = useState(false);
  const side = HEIGHT - 12;
  const x0 = 6, y0 = 6;

  useEffect(() => {
    const ctx = begin();
    if (!ctx) return;
    ctx.globalAlpha = active ? 1 : 0.45;
    const toX = (v: number) => x0 + ((v + 1) / 2) * side;
    const toY = (v: number) => y0 + ((1 - v) / 2) * side;

    // Axes and the unchanged (straight) line
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.strokeRect(x0 + 0.5, y0 + 0.5, side, side);
    ctx.beginPath();
    ctx.moveTo(toX(-1), toY(0)); ctx.lineTo(toX(1), toY(0));
    ctx.moveTo(toX(0), toY(-1)); ctx.lineTo(toX(0), toY(1));
    ctx.stroke();
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(toX(-1), toY(-1)); ctx.lineTo(toX(1), toY(1)); ctx.stroke();
    ctx.setLineDash([]);

    // The curve
    const f = saturationCurve(drive);
    ctx.strokeStyle = COLOR;
    ctx.lineWidth = hover || drag.current ? 2.5 : 2;
    ctx.beginPath();
    for (let i = 0; i <= side; i++) {
      const xin = (i / side) * 2 - 1;
      const px = toX(xin), py = toY(Math.max(-1, Math.min(1, f(xin))));
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.font = '9px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.textBaseline = 'top';
    ctx.fillText('in → out', x0 + 4, y0 + 3);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.textAlign = 'right';
    ctx.fillText(`drive ${Math.round(drive * 100)}%`, x0 + side - 4, y0 + side - 13);
    ctx.textAlign = 'left';

    // Overtones of a loud note, as bars (0 dB = the note itself)
    const bx = x0 + side + 24, bw = Math.max(60, width - bx - 10);
    const barW = Math.min(28, bw / 4 - 8);
    const floor = -80;
    const top = y0 + 14, bottom = y0 + side - 14;
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillText('overtones of a loud note', bx, y0);
    harm.forEach((db, i) => {
      const x = bx + i * (bw / 4);
      const t = Math.max(0, Math.min(1, (db - floor) / -floor));
      const y = bottom - t * (bottom - top);
      ctx.fillStyle = i % 2 === 0 ? COLOR : COLOR + '88'; // even overtones: the warm ones
      ctx.fillRect(x, y, barW, bottom - y);
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.textBaseline = 'top';
      ctx.fillText(`${i + 2}${['nd', 'rd', 'th', 'th'][i]}`, x, bottom + 2);
      ctx.textBaseline = 'bottom';
      ctx.fillText(db > floor ? `${db.toFixed(0)}` : '–', x, y - 1);
    });
    ctx.globalAlpha = 1;
  }, [width, drive, harm, active, hover]);

  return (
    <Box sx={{ borderRadius: 1, overflow: 'hidden', bgcolor: 'rgba(0,0,0,0.3)' }}>
      <canvas
        ref={ref}
        style={{ width: '100%', height: HEIGHT, display: 'block', touchAction: 'none', cursor: hover ? 'ns-resize' : 'default' }}
        onPointerDown={(e) => {
          const { x } = pos(e);
          if (x > x0 + side) return;
          (e.target as Element).setPointerCapture(e.pointerId);
          drag.current = { y: pos(e).y, drive };
          onDrag(true);
        }}
        onPointerMove={(e) => {
          const { x, y } = pos(e);
          if (!drag.current) { setHover(x <= x0 + side); return; }
          const d = drag.current.drive + (drag.current.y - y) / side;
          onEdit({ drive: Math.round(Math.max(0, Math.min(1, d)) * 100) / 100 });
        }}
        onPointerUp={() => { drag.current = null; onDrag(false); }}
        onPointerCancel={() => { drag.current = null; onDrag(false); }}
        onPointerLeave={() => setHover(false)}
      />
    </Box>
  );
};
