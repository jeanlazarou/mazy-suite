import React, { useEffect, useRef, useState } from 'react';
import { Box, Paper, Collapse, Typography } from '@mui/material';
import { Knob } from '../controls/Knob';
import { ProcessorHeader } from '../controls/ParamSlider';
import { usePanelView, ViewToggle } from '../controls/PanelView';
import { useCanvas } from '../controls/useCanvas';
import { useDragParams } from '../controls/useDragParams';
import { useAudioEngine } from '../../hooks/useAudioEngine';
import { useStore } from '../../store/store';

const NAME = 'Limiter';
const COLOR = '#EF4444';
const TOP_DB = 6; // input peaks can exceed 0 dBFS before the limiter
const BOTTOM_DB = -30;
const CEILING_MIN = -12;

interface LimiterPanelProps {
  expanded: boolean;
  onExpandToggle: () => void;
}

export const LimiterPanel: React.FC<LimiterPanelProps> = ({ expanded, onExpandToggle }) => {
  const { setParam, setProcessorEnabled } = useAudioEngine();
  const { params, edit, setDragging } = useDragParams(NAME);
  const meters = useStore((s) => s.meters[NAME]);
  const enabled = useStore((s) => s.processorEnabled[NAME] ?? true);
  const [view, setView] = usePanelView('limiter');

  const ceiling = params.ceiling ?? -0.3;
  // The limiter's input doesn't depend on its own settings, so how much
  // gets cut can be estimated instantly while the ceiling is dragged.
  // (The real reduction is spread over lookahead/release.)
  const peaks = enabled ? meters?.in_db : undefined;
  const over = (peaks ?? []).map((p) => Math.max(0, p - ceiling));
  const busy = over.filter((o) => o > 0.1).length;
  const maxOver = over.reduce((m, o) => Math.max(m, o), 0);

  const knob = (label: string, param: string, def: number, min: number, max: number, step: number, unit: string, color: string, size?: number) => (
    <Knob label={label} value={params[param] ?? def} min={min} max={max} step={step} unit={unit}
      color={color} size={size} onChange={(v) => setParam(NAME, param, v)} />
  );

  return (
    <Paper sx={{ p: 2 }}>
      <ProcessorHeader title="Limiter" enabled={enabled} onToggle={(v) => setProcessorEnabled(NAME, v)} expanded={expanded} onExpandToggle={onExpandToggle} />
      <Collapse in={expanded}>
        <Box sx={{ mb: 1 }}>
          <ViewToggle view={view} onChange={setView} visualLabel="Ceiling" />
        </Box>
        {view === 'visual' ? (
          <>
            <PeakTimeline peaks={peaks} ceiling={ceiling} onEdit={edit} onDrag={setDragging} />
            <Box sx={{ mt: 1, minHeight: 36 }}>
              {peaks && peaks.length > 0 ? (
                <>
                  <Typography sx={{ fontSize: '0.8rem', fontWeight: 600 }}>
                    {busy === 0 ? 'Peaks stay under the ceiling — nothing to limit'
                      : `Limiting in ${Math.round((busy / peaks.length) * 100)}% of the track, up to ${maxOver.toFixed(1)} dB`}
                  </Typography>
                  {maxOver > 6 && (
                    <Typography sx={{ fontSize: '0.7rem', color: '#FBBF24' }}>
                      That much limiting can sound flat and squashed. A lower loudness target
                      (destination) leaves the peaks more room.
                    </Typography>
                  )}
                </>
              ) : (
                <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                  {enabled ? 'Peaks appear once the preview is ready.' : 'Switch the limiter on to see where it works.'}
                </Typography>
              )}
              <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary', mt: 0.5 }}>
                Peaks reaching the limiter across the track. Nothing gets past the red line:
                the parts above it are turned down. Drag the line; click elsewhere to jump.
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', mt: 1 }}>
              {knob('Release', 'release', 50, 1, 500, 1, 'ms', '#FBBF24', 44)}
              {knob('Lookahead', 'lookahead', 5, 0.1, 20, 0.1, 'ms', '#6C63FF', 44)}
            </Box>
          </>
        ) : (
          <Box sx={{ display: 'flex', gap: 3, justifyContent: 'center' }}>
            {knob('Ceiling', 'ceiling', -0.3, CEILING_MIN, 0, 0.1, 'dB', COLOR)}
            {knob('Release', 'release', 50, 1, 500, 1, 'ms', '#FBBF24')}
            {knob('Lookahead', 'lookahead', 5, 0.1, 20, 0.1, 'ms', '#6C63FF')}
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

interface PeakTimelineProps {
  peaks: number[] | undefined;
  ceiling: number;
  onEdit: (patch: Record<string, number>) => void;
  onDrag: (on: boolean) => void;
}

const HEIGHT = 170;

const PeakTimeline: React.FC<PeakTimelineProps> = ({ peaks, ceiling, onEdit, onDrag }) => {
  const { ref, width, begin, pos } = useCanvas(HEIGHT);
  const duration = useStore((s) => s.originalBuffer?.duration ?? 0);
  const position = useStore((s) => s.playbackPosition);
  const requestSeek = useStore((s) => s.requestSeek);
  const dragging = useRef(false);
  const [hover, setHover] = useState(false);

  const left = 26;
  const dbToY = (db: number) => 4 + ((TOP_DB - db) / (TOP_DB - BOTTOM_DB)) * (HEIGHT - 8);
  const yToDB = (y: number) => TOP_DB - ((y - 4) / (HEIGHT - 8)) * (TOP_DB - BOTTOM_DB);

  useEffect(() => {
    const ctx = begin();
    if (!ctx) return;
    const w = width - left;
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const db of [6, 0, -6, -12, -18, -24]) {
      const y = Math.round(dbToY(db)) + 0.5;
      ctx.strokeStyle = db === 0 ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.05)';
      ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(width, y); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillText(`${db > 0 ? '+' : ''}${db}`, left - 4, y);
    }

    const cy = dbToY(ceiling);
    if (peaks && peaks.length) {
      const n = peaks.length;
      const bw = w / n;
      const bottom = dbToY(BOTTOM_DB);
      for (let i = 0; i < n; i++) {
        const py = dbToY(Math.max(BOTTOM_DB, Math.min(TOP_DB, peaks[i])));
        const x = left + i * bw;
        ctx.fillStyle = 'rgba(148,163,184,0.45)';
        ctx.fillRect(x, Math.max(py, cy), Math.max(1, bw - 0.2), bottom - Math.max(py, cy));
        if (py < cy) {
          ctx.fillStyle = 'rgba(239,68,68,0.85)';
          ctx.fillRect(x, py, Math.max(1, bw - 0.2), cy - py);
        }
      }
    }

    ctx.strokeStyle = COLOR;
    ctx.lineWidth = hover || dragging.current ? 3 : 2;
    ctx.beginPath(); ctx.moveTo(left, cy); ctx.lineTo(width, cy); ctx.stroke();
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    const label = `ceiling ${ceiling.toFixed(1)} dB`;
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = 'rgba(13,13,18,0.85)';
    ctx.fillRect(width - tw - 10, cy - 16, tw + 8, 13);
    ctx.fillStyle = COLOR;
    ctx.fillText(label, width - 6, cy - 4);

    if (duration > 0) {
      const x = Math.round(left + (position / duration) * w) + 0.5;
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, HEIGHT); ctx.stroke();
    }
  }, [width, peaks, ceiling, hover, position, duration]);

  const nearLine = (y: number) => Math.abs(y - dbToY(ceiling)) < 8;

  return (
    <Box sx={{ borderRadius: 1, overflow: 'hidden', bgcolor: 'rgba(0,0,0,0.3)' }}>
      <canvas
        ref={ref}
        style={{ width: '100%', height: HEIGHT, display: 'block', touchAction: 'none', cursor: hover ? 'ns-resize' : duration ? 'pointer' : 'default' }}
        onPointerDown={(e) => {
          const { x, y } = pos(e);
          if (nearLine(y)) {
            (e.target as Element).setPointerCapture(e.pointerId);
            dragging.current = true;
            onDrag(true);
          } else if (duration && x > left) {
            requestSeek(Math.min(1, (x - left) / (width - left)) * duration);
          }
        }}
        onPointerMove={(e) => {
          const { y } = pos(e);
          if (!dragging.current) { setHover(nearLine(y)); return; }
          onEdit({ ceiling: Math.round(Math.max(CEILING_MIN, Math.min(0, yToDB(y))) * 10) / 10 });
        }}
        onPointerUp={() => { dragging.current = false; onDrag(false); }}
        onPointerCancel={() => { dragging.current = false; onDrag(false); }}
        onPointerLeave={() => setHover(false)}
      />
    </Box>
  );
};
