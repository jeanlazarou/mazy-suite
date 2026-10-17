import React, { useEffect, useRef, useState } from 'react';
import { Box, Paper, Collapse, Typography, Button, Tooltip } from '@mui/material';
import { Knob } from '../controls/Knob';
import { ProcessorHeader } from '../controls/ParamSlider';
import { usePanelView, ViewToggle } from '../controls/PanelView';
import { useCanvas } from '../controls/useCanvas';
import { useDragParams } from '../controls/useDragParams';
import { useAudioEngine } from '../../hooks/useAudioEngine';
import { useStore } from '../../store/store';
import { setMonoCheck } from '../../audio/livePreview';

const NAME = 'Stereo Widener';
const COLOR = '#A78BFA';
const WIDTH_MAX = 2;

/** Side share of the energy and L/R correlation after scaling the side
 *  signal by `w`, from the original's side share `s` (analysis width).
 *  Mid and side are treated as uncorrelated, as the analysis does. */
function predict(s: number, w: number) {
  const mid = 1 - s, side = s * w * w;
  const total = mid + side || 1;
  return { width: side / total, correlation: (mid - side) / total };
}

interface StereoPanelProps {
  expanded: boolean;
  onExpandToggle: () => void;
}

export const StereoPanel: React.FC<StereoPanelProps> = ({ expanded, onExpandToggle }) => {
  const { setParam, setProcessorEnabled } = useAudioEngine();
  const { params, edit, setDragging } = useDragParams(NAME);
  const enabled = useStore((s) => s.processorEnabled[NAME] ?? true);
  const original = useStore((s) => s.analysis?.stereo_field ?? null);
  const isPlaying = useStore((s) => s.isPlaying);
  const [view, setView] = usePanelView('stereo');
  const [mono, setMono] = useState(false);

  const width = params.width ?? 1;
  const after = original && predict(original.width, enabled ? width : 1);

  useEffect(() => () => setMonoCheck(false), []);
  const hold = (on: boolean) => { setMono(on); setMonoCheck(on); };

  return (
    <Paper sx={{ p: 2 }}>
      <ProcessorHeader title="Stereo" enabled={enabled} onToggle={(v) => setProcessorEnabled(NAME, v)} expanded={expanded} onExpandToggle={onExpandToggle} />
      <Collapse in={expanded}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <ViewToggle view={view} onChange={setView} visualLabel="Stage" />
          <Box sx={{ flex: 1 }} />
          <Tooltip title="Hold to hear the track in mono, as a phone or a single speaker plays it">
            <Button size="small" variant={mono ? 'contained' : 'outlined'}
              onPointerDown={() => hold(true)} onPointerUp={() => hold(false)} onPointerLeave={() => mono && hold(false)}
              sx={{ fontSize: '0.65rem', py: 0.25, minWidth: 0 }}>
              Hold: mono check
            </Button>
          </Tooltip>
        </Box>
        {view === 'visual' ? (
          <>
            <Stage width={width} onEdit={edit} onDrag={setDragging} />
            <Box sx={{ mt: 1, fontSize: '0.75rem' }}>
              {original && after ? (
                <>
                  <Typography sx={{ fontSize: '0.8rem', fontWeight: 600 }}>
                    {width < 0.05 ? 'Mono: both speakers play the same'
                      : Math.abs(width - 1) < 0.02 ? 'As recorded'
                        : width < 1 ? `Narrower: ${Math.round(width * 100)}% of the original sides`
                          : `Wider: ${Math.round(width * 100)}% of the original sides`}
                  </Typography>
                  <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>
                    Stereo spread {Math.round(original.width * 100)}% → {Math.round(after.width * 100)}%
                    {' · '}left/right agreement {original.correlation.toFixed(2)} → {after.correlation.toFixed(2)}
                  </Typography>
                  {after.correlation < 0.1 && (
                    <Typography sx={{ fontSize: '0.7rem', color: '#FBBF24' }}>
                      Left and right barely agree: on a phone or a mono speaker parts of the
                      mix may get quieter or vanish. Check with “Hold: mono check”.
                    </Typography>
                  )}
                </>
              ) : (
                <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                  Drag the edges of the sound to make it narrower or wider.
                </Typography>
              )}
              <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary', mt: 0.5 }}>
                {isPlaying ? 'Changes play right away.' : 'Drag the edges of the sound; double-click to reset to as recorded.'}
              </Typography>
            </Box>
          </>
        ) : (
          <Box sx={{ display: 'flex', gap: 3, justifyContent: 'center' }}>
            <Knob label="Width" value={width} min={0} max={WIDTH_MAX} step={0.01} color={COLOR}
              onChange={(v) => setParam(NAME, 'width', v)} />
          </Box>
        )}
      </Collapse>
    </Paper>
  );
};

interface StageProps {
  width: number;
  onEdit: (patch: Record<string, number>) => void;
  onDrag: (on: boolean) => void;
}

const HEIGHT = 140;

const Stage: React.FC<StageProps> = ({ width: w, onEdit, onDrag }) => {
  const { ref, width, begin, pos } = useCanvas(HEIGHT);
  const dragging = useRef(false);
  const [hover, setHover] = useState(false);

  const cx = width / 2;
  const d = Math.min(width * 0.22, 140); // speaker distance from center = width 1
  const imageY = 62;

  useEffect(() => {
    const ctx = begin();
    if (!ctx) return;

    // Zone marks
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillText('mono', cx, 6);
    ctx.fillText('as recorded', cx - d, 6);
    ctx.fillText('as recorded', cx + d, 6);
    ctx.fillText('extra wide', cx - 2 * d, 6);
    ctx.fillText('extra wide', cx + 2 * d, 6);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    for (const x of [cx - 2 * d, cx - d, cx, cx + d, cx + 2 * d]) {
      ctx.beginPath(); ctx.moveTo(x + 0.5, 18); ctx.lineTo(x + 0.5, HEIGHT - 30); ctx.stroke();
    }

    // Speakers and listener
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    for (const x of [cx - d, cx + d]) ctx.fillRect(x - 7, imageY + 26, 14, 18);
    ctx.beginPath(); ctx.arc(cx, HEIGHT - 14, 8, 0, Math.PI * 2); ctx.fill();

    // The sound image between the handles.
    const half = Math.max(3, w * d);
    const grad = ctx.createLinearGradient(cx - half, 0, cx + half, 0);
    grad.addColorStop(0, 'rgba(167,139,250,0.15)');
    grad.addColorStop(0.5, 'rgba(167,139,250,0.55)');
    grad.addColorStop(1, 'rgba(167,139,250,0.15)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(cx, imageY, half, 16, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = COLOR;
    for (const x of [cx - w * d, cx + w * d]) {
      ctx.beginPath(); ctx.arc(x, imageY, hover || dragging.current ? 7 : 6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = '10px sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${Math.round(w * 100)}%`, cx, imageY);
  }, [width, w, hover]);

  const onHandle = (x: number, y: number) =>
    Math.abs(y - imageY) < 20 && Math.min(Math.abs(x - (cx - w * d)), Math.abs(x - (cx + w * d))) < 14;

  const widthAt = (x: number) => {
    let v = Math.abs(x - cx) / d;
    if (Math.abs(v - 1) < 0.04) v = 1; // snap to as recorded
    return Math.round(Math.min(WIDTH_MAX, v) * 100) / 100;
  };

  return (
    <Box sx={{ borderRadius: 1, overflow: 'hidden', bgcolor: 'rgba(0,0,0,0.3)' }}>
      <canvas
        ref={ref}
        style={{ width: '100%', height: HEIGHT, display: 'block', touchAction: 'none', cursor: hover ? 'ew-resize' : 'default' }}
        onPointerDown={(e) => {
          const { x, y } = pos(e);
          if (!onHandle(x, y)) return;
          (e.target as Element).setPointerCapture(e.pointerId);
          dragging.current = true;
          onDrag(true);
        }}
        onPointerMove={(e) => {
          const { x, y } = pos(e);
          if (!dragging.current) { setHover(onHandle(x, y)); return; }
          onEdit({ width: widthAt(x) });
        }}
        onPointerUp={() => { dragging.current = false; onDrag(false); }}
        onPointerCancel={() => { dragging.current = false; onDrag(false); }}
        onPointerLeave={() => setHover(false)}
        onDoubleClick={() => onEdit({ width: 1 })}
      />
    </Box>
  );
};
