import React, { useEffect, useRef, useState } from 'react';
import { Box, Paper, Collapse, Typography } from '@mui/material';
import { Knob } from '../controls/Knob';
import { ProcessorHeader } from '../controls/ParamSlider';
import { usePanelView, ViewToggle } from '../controls/PanelView';
import { useCanvas } from '../controls/useCanvas';
import { useDragParams } from '../controls/useDragParams';
import { useAudioEngine } from '../../hooks/useAudioEngine';
import { useStore } from '../../store/store';

const PROC = 'Tone Match';
const COLOR = '#2DD4BF';

// The curve's points: third octaves from 20 Hz (dsp.ToneMatchBands /
// ToneMatchFreq in pkg/dsp/tonematch.go — keep in sync). Between points
// the gain follows straight lines over log frequency, which is what
// drawing them joined on a log axis gives.
const BANDS = 31;
const bandFreq = (i: number) => 20 * Math.pow(2, i / 3);
const F_MIN = 20, F_MAX = 20000;
const RANGE_DB = 8;
const HEIGHT = 150;

interface TonePanelProps {
  expanded: boolean;
  onExpandToggle: () => void;
}

// The correction curve fitted to the song's spectrum by the "Fix
// problems" choice (pkg/recipe/tonematch.go). Here it can be made
// stronger or weaker, or switched off.
export const TonePanel: React.FC<TonePanelProps> = ({ expanded, onExpandToggle }) => {
  const { setParam, setProcessorEnabled } = useAudioEngine();
  const { params, edit, setDragging } = useDragParams(PROC);
  const enabled = useStore((s) => s.processorEnabled[PROC] ?? false);
  const [view, setView] = usePanelView('tone');
  const amount = params.amount ?? 1;
  const gains = Array.from({ length: BANDS }, (_, i) => (params[`g.${i}`] ?? 0) * amount);
  const most = gains.reduce((m, g) => (Math.abs(g) > Math.abs(m) ? g : m), 0);

  return (
    <Paper sx={{ p: 2 }}>
      <ProcessorHeader title="Tone match" enabled={enabled} onToggle={(v) => setProcessorEnabled(PROC, v)} expanded={expanded} onExpandToggle={onExpandToggle} />
      <Collapse in={expanded}>
        <Box sx={{ mb: 1 }}>
          <ViewToggle view={view} onChange={setView} visualLabel="Curve" />
        </Box>
        {view === 'visual' ? (
          <>
            <CurveGraph gains={gains} amount={amount} active={enabled} onEdit={edit} onDrag={setDragging} />
            <Typography sx={{ fontSize: '0.75rem', mt: 1 }}>
              A correction fitted to this song: it levels what sticks out and fills what is hidden, so every
              part of the mix gets its place. At most {most >= 0 ? '+' : '−'}{Math.abs(most).toFixed(1)} dB.
            </Typography>
            <Typography sx={{ fontSize: '0.7rem', color: enabled ? 'text.secondary' : '#FBBF24', mt: 0.5 }}>
              {enabled
                ? 'Drag up or down on the curve for a stronger or weaker correction.'
                : 'Off — switch it on to hear it.'}
            </Typography>
          </>
        ) : (
          <Box sx={{ display: 'flex', gap: 3, justifyContent: 'center' }}>
            <Knob label="Amount" value={amount * 100} min={0} max={200} step={5} unit="%" color={COLOR}
              onChange={(v) => setParam(PROC, 'amount', v / 100)} />
          </Box>
        )}
      </Collapse>
    </Paper>
  );
};

const CurveGraph: React.FC<{
  gains: number[];
  amount: number;
  active: boolean;
  onEdit: (patch: Record<string, number>) => void;
  onDrag: (on: boolean) => void;
}> = ({ gains, amount, active, onEdit, onDrag }) => {
  const { ref, width, begin, pos } = useCanvas(HEIGHT);
  const drag = useRef<{ y: number; amount: number } | null>(null);
  const [hover, setHover] = useState(false);
  const key = gains.join(',');

  useEffect(() => {
    const ctx = begin();
    if (!ctx) return;
    ctx.globalAlpha = active ? 1 : 0.45;
    const padL = 26, padB = 14;
    const w = width - padL - 6, h = HEIGHT - padB - 6;
    const toX = (f: number) => padL + (Math.log(f / F_MIN) / Math.log(F_MAX / F_MIN)) * w;
    const toY = (db: number) => 6 + (1 - (Math.max(-RANGE_DB, Math.min(RANGE_DB, db)) + RANGE_DB) / (2 * RANGE_DB)) * h;

    ctx.font = '9px sans-serif';
    ctx.textBaseline = 'middle';
    for (const db of [-6, -3, 0, 3, 6]) {
      ctx.strokeStyle = db === 0 ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.07)';
      ctx.beginPath(); ctx.moveTo(padL, toY(db) + 0.5); ctx.lineTo(padL + w, toY(db) + 0.5); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.textAlign = 'right';
      ctx.fillText(`${db > 0 ? '+' : ''}${db}`, padL - 4, toY(db));
    }
    ctx.textBaseline = 'top';
    ctx.textAlign = 'center';
    for (const [f, label] of [[50, '50'], [100, '100'], [200, '200'], [500, '500'], [1000, '1k'], [2000, '2k'], [5000, '5k'], [10000, '10k']] as const) {
      ctx.strokeStyle = 'rgba(255,255,255,0.07)';
      ctx.beginPath(); ctx.moveTo(toX(f) + 0.5, 6); ctx.lineTo(toX(f) + 0.5, 6 + h); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillText(label, toX(f), 6 + h + 2);
    }

    // The curve, filled toward the 0 dB line.
    const trace = () => {
      gains.forEach((g, i) => {
        const x = toX(Math.min(F_MAX, bandFreq(i))), y = toY(g);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
    };
    ctx.beginPath();
    ctx.moveTo(toX(F_MIN), toY(0));
    trace();
    ctx.lineTo(toX(F_MAX), toY(0));
    ctx.closePath();
    ctx.fillStyle = COLOR + '33';
    ctx.fill();
    ctx.beginPath();
    trace();
    ctx.strokeStyle = COLOR;
    ctx.lineWidth = hover || drag.current ? 2.5 : 2;
    ctx.stroke();
    ctx.lineWidth = 1;

    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText(`amount ${Math.round(amount * 100)}%`, padL + w - 4, 9);
    ctx.globalAlpha = 1;
  }, [width, key, amount, active, hover]);

  return (
    <Box sx={{ borderRadius: 1, overflow: 'hidden', bgcolor: 'rgba(0,0,0,0.3)' }}>
      <canvas
        ref={ref}
        style={{ width: '100%', height: HEIGHT, display: 'block', touchAction: 'none', cursor: hover ? 'ns-resize' : 'default' }}
        onPointerDown={(e) => {
          (e.target as Element).setPointerCapture(e.pointerId);
          drag.current = { y: pos(e).y, amount };
          onDrag(true);
        }}
        onPointerMove={(e) => {
          if (!drag.current) { setHover(true); return; }
          const a = drag.current.amount + (drag.current.y - pos(e).y) / 60;
          onEdit({ amount: Math.round(Math.max(0, Math.min(2, a)) * 20) / 20 });
        }}
        onPointerUp={() => { drag.current = null; onDrag(false); }}
        onPointerCancel={() => { drag.current = null; onDrag(false); }}
        onPointerLeave={() => setHover(false)}
      />
    </Box>
  );
};
