import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Paper, Collapse, Typography } from '@mui/material';
import { Knob } from '../controls/Knob';
import { ProcessorHeader } from '../controls/ParamSlider';
import { usePanelView, ViewToggle } from '../controls/PanelView';
import { useCanvas } from '../controls/useCanvas';
import { useDragParams } from '../controls/useDragParams';
import { TimelineStrip, useTimelineIndex } from '../controls/TimelineStrip';
import { useAudioEngine } from '../../hooks/useAudioEngine';
import { useStore } from '../../store/store';

const NAME = 'Compressor';
const COLOR = '#FF6584';
const DB_MIN = -60; // in/out graph range
const RATIO_MAX = 20;

/** Output level for a detector level — the static curve of
 *  Compressor.computeGainReduction in pkg/dsp/compressor.go. */
export function compressorOut(inDB: number, threshold: number, ratio: number, knee: number): number {
  const half = knee / 2;
  if (knee > 0 && inDB > threshold - half && inDB < threshold + half) {
    const x = inDB - threshold + half;
    return inDB + (1 / ratio - 1) * x * x / (2 * knee);
  }
  if (inDB >= threshold + half) return threshold + (inDB - threshold) / ratio;
  return inDB;
}

interface CompressorPanelProps {
  expanded: boolean;
  onExpandToggle: () => void;
}

export const CompressorPanel: React.FC<CompressorPanelProps> = ({ expanded, onExpandToggle }) => {
  const { setParam, setProcessorEnabled } = useAudioEngine();
  const { params, edit, setDragging } = useDragParams(NAME);
  const meters = useStore((s) => s.meters[NAME]);
  const enabled = useStore((s) => s.processorEnabled[NAME] ?? true);
  const [view, setView] = usePanelView('compressor');

  const threshold = params.threshold ?? -18;
  const ratio = params.ratio ?? 4;
  const knee = params.knee ?? 6;

  // The detector levels don't depend on threshold/ratio/knee, so the
  // reduction they lead to can be recomputed instantly while dragging —
  // no need to wait for a render.
  const levels = enabled ? meters?.in_db : undefined;
  const reduction = useMemo(
    () => (levels ?? []).map((l) => Math.max(0, l - compressorOut(l, threshold, ratio, knee))),
    [levels, threshold, ratio, knee],
  );
  const busy = reduction.filter((r) => r > 0.5).length;
  const maxGR = reduction.reduce((m, r) => Math.max(m, r), 0);

  const knob = (label: string, param: string, def: number, min: number, max: number, step: number, unit: string, color: string, size?: number) => (
    <Knob label={label} value={params[param] ?? def} min={min} max={max} step={step} unit={unit}
      color={color} size={size} onChange={(v) => setParam(NAME, param, v)} />
  );

  return (
    <Paper sx={{ p: 2 }}>
      <ProcessorHeader title="Compressor" enabled={enabled} onToggle={(v) => setProcessorEnabled(NAME, v)} expanded={expanded} onExpandToggle={onExpandToggle} />
      <Collapse in={expanded}>
        <Box sx={{ mb: 1 }}>
          <ViewToggle view={view} onChange={setView} visualLabel="Curve" />
        </Box>
        {view === 'visual' ? (
          <>
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'stretch', flexWrap: 'wrap' }}>
              <Box sx={{ flex: '1 1 220px', maxWidth: 320 }}>
                <TransferGraph
                  threshold={threshold} ratio={ratio} knee={knee} levels={levels}
                  onEdit={edit} onDrag={setDragging}
                />
              </Box>
              <Box sx={{ flex: '1 1 160px', display: 'flex', flexDirection: 'column', gap: 1, fontSize: '0.75rem' }}>
                {levels && levels.length > 0 ? (
                  <>
                    <Typography sx={{ fontSize: '0.8rem', fontWeight: 600 }}>
                      {busy === 0 ? 'Not compressing'
                        : `Compressing in ${Math.round((busy / levels.length) * 100)}% of the track`}
                    </Typography>
                    {busy > 0 && (
                      <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                        Up to {maxGR.toFixed(1)} dB quieter on the loudest moments.
                      </Typography>
                    )}
                  </>
                ) : (
                  <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                    {enabled ? 'Levels appear once the preview is ready.' : 'Switch the compressor on to see where it works.'}
                  </Typography>
                )}
                <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary', mt: 'auto' }}>
                  Bars: how often the track reaches each level. Everything right of the
                  threshold is turned down; drag the threshold dot sideways, and the end
                  of the line up or down for how hard.
                </Typography>
              </Box>
            </Box>
            {levels && levels.length > 0 && (
              <Box sx={{ mt: 1.5 }}>
                <Typography sx={{ fontSize: '0.65rem', color: 'text.secondary', mb: 0.5 }}>
                  Where in the track (click to jump)
                </Typography>
                <TimelineStrip values={reduction} scaleDB={Math.max(6, maxGR)} color={COLOR} />
              </Box>
            )}
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', justifyContent: 'center', mt: 1.5 }}>
              {knob('Attack', 'attack', 10, 0.1, 200, 0.1, 'ms', '#4ADE80', 44)}
              {knob('Release', 'release', 100, 1, 1000, 1, 'ms', '#6C63FF', 44)}
              {knob('Knee', 'knee', 6, 0, 20, 0.5, 'dB', '#A78BFA', 44)}
              {knob('Makeup', 'makeup', 0, 0, 24, 0.5, 'dB', '#22D3EE', 44)}
            </Box>
          </>
        ) : (
          <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', justifyContent: 'center' }}>
            {knob('Threshold', 'threshold', -18, -60, 0, 0.5, 'dB', COLOR)}
            {knob('Ratio', 'ratio', 4, 1, RATIO_MAX, 0.1, ':1', '#FBBF24')}
            {knob('Attack', 'attack', 10, 0.1, 200, 0.1, 'ms', '#4ADE80')}
            {knob('Release', 'release', 100, 1, 1000, 1, 'ms', '#6C63FF')}
            {knob('Knee', 'knee', 6, 0, 20, 0.5, 'dB', '#A78BFA')}
            {knob('Makeup', 'makeup', 0, 0, 24, 0.5, 'dB', '#22D3EE')}
          </Box>
        )}
        {meters && (
          <Typography
            variant="body2"
            sx={{ mt: 1.5, textAlign: 'center', fontSize: '0.7rem', color: 'text.secondary', fontFamily: 'JetBrains Mono, monospace' }}
          >
            Gain reduction (last process): max {meters.max_gr_db.toFixed(1)} dB · avg {meters.avg_gr_db.toFixed(1)} dB
          </Typography>
        )}
      </Collapse>
    </Paper>
  );
};

interface TransferGraphProps {
  threshold: number;
  ratio: number;
  knee: number;
  levels: number[] | undefined;
  onEdit: (patch: Record<string, number>) => void;
  onDrag: (on: boolean) => void;
}

const TransferGraph: React.FC<TransferGraphProps> = ({ threshold, ratio, knee, levels, onEdit, onDrag }) => {
  const [size, setSize] = useState(240);
  const { ref, width, begin, pos } = useCanvas(size);
  const drag = useRef<'threshold' | 'ratio' | null>(null);
  const [hover, setHover] = useState<'threshold' | 'ratio' | null>(null);
  const now = useTimelineIndex(levels?.length ?? 0);

  // Square graph: height follows the width.
  useEffect(() => setSize(Math.min(320, Math.max(180, width))), [width]);

  const pad = 22;
  const span = size - pad - 6;
  const dbToX = (db: number) => pad + ((db - DB_MIN) / -DB_MIN) * span;
  const dbToY = (db: number) => 6 + (1 - (db - DB_MIN) / -DB_MIN) * span;
  const xToDB = (x: number) => DB_MIN + ((x - pad) / span) * -DB_MIN;
  const yToDB = (y: number) => DB_MIN + (1 - (y - 6) / span) * -DB_MIN;
  const out0 = compressorOut(0, threshold, ratio, knee);
  const handles = {
    threshold: { x: dbToX(threshold), y: dbToY(threshold) },
    ratio: { x: dbToX(0), y: dbToY(out0) },
  };

  useEffect(() => {
    const ctx = begin();
    if (!ctx) return;
    const right = dbToX(0), bottom = dbToY(DB_MIN);

    // Grid and labels
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = '9px sans-serif';
    for (let db = -48; db <= 0; db += 12) {
      ctx.beginPath(); ctx.moveTo(dbToX(db), 6); ctx.lineTo(dbToX(db), bottom); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(pad, dbToY(db)); ctx.lineTo(right, dbToY(db)); ctx.stroke();
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(`${db}`, pad - 3, dbToY(db));
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText('in →', (pad + right) / 2, bottom + 3);

    // Level histogram along the input axis, red where it gets compressed.
    if (levels && levels.length) {
      const bins = 60;
      const counts = new Array(bins).fill(0);
      for (const l of levels) {
        const b = Math.floor(((l - DB_MIN) / -DB_MIN) * bins);
        if (b >= 0 && b < bins) counts[b]++;
      }
      const peak = Math.max(...counts, 1);
      const bw = span / bins;
      for (let b = 0; b < bins; b++) {
        if (!counts[b]) continue;
        const db = DB_MIN + ((b + 0.5) / bins) * -DB_MIN;
        const h = (counts[b] / peak) * span * 0.35;
        ctx.fillStyle = db > threshold - knee / 2 ? 'rgba(255,101,132,0.45)' : 'rgba(148,163,184,0.25)';
        ctx.fillRect(pad + b * bw, bottom - h, Math.max(1, bw - 0.5), h);
      }
    }

    // Unity line, knee zone, curve
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.beginPath(); ctx.moveTo(dbToX(DB_MIN), dbToY(DB_MIN)); ctx.lineTo(right, dbToY(0)); ctx.stroke();
    ctx.setLineDash([]);
    if (knee > 0) {
      ctx.fillStyle = 'rgba(167,139,250,0.08)';
      const x0 = dbToX(Math.max(DB_MIN, threshold - knee / 2)), x1 = dbToX(Math.min(0, threshold + knee / 2));
      ctx.fillRect(x0, 6, x1 - x0, span);
    }
    ctx.strokeStyle = COLOR;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = dbToX(DB_MIN); x <= right; x++) {
      const y = dbToY(compressorOut(xToDB(x), threshold, ratio, knee));
      if (x === dbToX(DB_MIN)) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Where the track is right now, while playing.
    if (now !== null && levels) {
      const l = Math.max(DB_MIN, Math.min(0, levels[now]));
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(dbToX(l), dbToY(compressorOut(l, threshold, ratio, knee)), 4, 0, Math.PI * 2); ctx.fill();
    }

    // Handles
    (['threshold', 'ratio'] as const).forEach((k) => {
      const h = handles[k];
      ctx.fillStyle = k === 'threshold' ? COLOR : '#FBBF24';
      ctx.beginPath(); ctx.arc(h.x, h.y, hover === k || drag.current === k ? 7 : 6, 0, Math.PI * 2); ctx.fill();
    });
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = '10px sans-serif';
    // Threshold value up-left of its dot, clear of the curve rising right.
    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    ctx.fillText(`${threshold.toFixed(1)} dB`, Math.max(pad + 52, handles.threshold.x - 10), handles.threshold.y - 8);
    ctx.textAlign = 'right';
    ctx.fillText(`${ratio.toFixed(1)}:1`, right - 10, handles.ratio.y - 4);
  }, [width, size, threshold, ratio, knee, levels, now, hover]);

  const hit = (x: number, y: number) => {
    for (const k of ['ratio', 'threshold'] as const) {
      if (Math.hypot(handles[k].x - x, handles[k].y - y) < 12) return k;
    }
    return null;
  };

  return (
    <Box sx={{ borderRadius: 1, overflow: 'hidden', bgcolor: 'rgba(0,0,0,0.3)' }}>
      <canvas
        ref={ref}
        style={{ width: '100%', height: size, display: 'block', touchAction: 'none', cursor: hover ? 'grab' : 'default' }}
        onPointerDown={(e) => {
          const { x, y } = pos(e);
          const k = hit(x, y);
          if (!k) return;
          (e.target as Element).setPointerCapture(e.pointerId);
          drag.current = k;
          onDrag(true);
        }}
        onPointerMove={(e) => {
          const { x, y } = pos(e);
          if (!drag.current) { setHover(hit(x, y)); return; }
          if (drag.current === 'threshold') {
            onEdit({ threshold: Math.round(Math.max(DB_MIN, Math.min(0, xToDB(x))) * 2) / 2 });
          } else {
            // The line's end at 0 dB in: out0 = T + (0 - T) / ratio.
            const out = Math.min(0, yToDB(y));
            const r = out <= threshold + 0.01 ? RATIO_MAX : -threshold / (out - threshold);
            onEdit({ ratio: Math.round(Math.max(1, Math.min(RATIO_MAX, r)) * 10) / 10 });
          }
        }}
        onPointerUp={() => { drag.current = null; onDrag(false); }}
        onPointerCancel={() => { drag.current = null; onDrag(false); }}
        onPointerLeave={() => setHover(null)}
      />
    </Box>
  );
};
