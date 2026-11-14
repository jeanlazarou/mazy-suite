import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Paper, Collapse, Typography } from '@mui/material';
import { Knob } from '../controls/Knob';
import { ProcessorHeader } from '../controls/ParamSlider';
import { usePanelView, ViewToggle } from '../controls/PanelView';
import { useCanvas } from '../controls/useCanvas';
import { useDragParams } from '../controls/useDragParams';
import { TimelineStrip } from '../controls/TimelineStrip';
import { compressorOut } from './CompressorPanel';
import { useAudioEngine } from '../../hooks/useAudioEngine';
import { useStore } from '../../store/store';

const PROC = 'Multiband Compressor';

// The bands of dsp.MultibandCompressor (crossovers at 200 Hz and 4 kHz,
// MultibandLowHz / MultibandHighHz in pkg/dsp/multiband.go).
const BANDS = [
  { name: 'Lows', range: 'below 200 Hz', from: 20, to: 200, color: '#F59E0B' },
  { name: 'Mids', range: '200 Hz – 4 kHz', from: 200, to: 4000, color: '#FB7185' },
  { name: 'Highs', range: 'above 4 kHz', from: 4000, to: 20000, color: '#38BDF8' },
];
const F_MIN = 20, F_MAX = 20000;
const AMOUNT_MAX = 6; // dB at the top of the graph
const HEIGHT = 170;

interface BandSettings { threshold: number; ratio: number; knee: number; makeup: number }

function bandSettings(params: Record<string, number>, i: number): BandSettings {
  return {
    threshold: params[`band.${i}.threshold`] ?? -20,
    ratio: params[`band.${i}.ratio`] ?? 2,
    knee: params[`band.${i}.knee`] ?? 6,
    makeup: params[`band.${i}.makeup`] ?? 0,
  };
}

// How much (dB) a band's settings turn a level down.
const reductionAt = (level: number, b: BandSettings) =>
  Math.max(0, level - compressorOut(level, b.threshold, b.ratio, b.knee));

// The threshold at which the band's loud level is turned down by amount
// dB — what pkg/recipe's thresholdFor does. More reduction needs a lower
// threshold, so bisection finds it.
function thresholdFor(level: number, amount: number, ratio: number, knee: number): number {
  let lo = level - 80, hi = level + knee / 2;
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2;
    if (reductionAt(level, { threshold: mid, ratio, knee, makeup: 0 }) > amount) lo = mid; else hi = mid;
  }
  return Math.max(-70, Math.min(0, Math.round(((lo + hi) / 2) * 10) / 10));
}

interface MultibandPanelProps {
  expanded: boolean;
  onExpandToggle: () => void;
}

// Three compressors, one per band, set by the recipe against each band's
// own level (pkg/recipe). The Bands view has one amount per band: how
// many dB the band's loud parts are turned down, with the same makeup, so
// more amount brings the band's quiet parts up.
export const MultibandPanel: React.FC<MultibandPanelProps> = ({ expanded, onExpandToggle }) => {
  const { setParam, setProcessorEnabled } = useAudioEngine();
  const { params, edit, setDragging } = useDragParams(PROC);
  const enabled = useStore((s) => s.processorEnabled[PROC] ?? false);
  const meters = useStore((s) => s.meters[PROC]?.bands);
  const levels = useStore((s) => s.analysis?.dynamics.band_loud_levels_db);
  const [view, setView] = usePanelView('multiband');

  const settings = BANDS.map((_, i) => bandSettings(params, i));
  // The amount each band is set to: what its loud level is turned down.
  const amounts = settings.map((b, i) => (levels ? reductionAt(levels[i], b) : b.makeup));
  // Where each band works across the track, from its detected levels and
  // the current settings (follows a drag before the preview re-renders).
  const key = settings.map((b) => `${b.threshold},${b.ratio},${b.knee}`).join(';');
  const strips = useMemo(
    () => BANDS.map((_, i) => (meters?.[i]?.in_db ?? []).map((l) => reductionAt(l, settings[i]))),
    [meters, key],
  );

  const setAmount = (i: number, amount: number) => {
    if (!levels) return;
    const ratio = settings[i].ratio > 1.05 ? settings[i].ratio : 1.5;
    edit({
      [`band.${i}.ratio`]: ratio,
      [`band.${i}.threshold`]: thresholdFor(levels[i], amount, ratio, settings[i].knee),
      [`band.${i}.makeup`]: amount,
    });
  };

  return (
    <Paper sx={{ p: 2 }}>
      <ProcessorHeader title="Multiband compressor" enabled={enabled} onToggle={(v) => setProcessorEnabled(PROC, v)} expanded={expanded} onExpandToggle={onExpandToggle} />
      <Collapse in={expanded}>
        <Box sx={{ mb: 1 }}>
          <ViewToggle view={view} onChange={setView} visualLabel="Bands" />
        </Box>
        {view === 'visual' ? (
          <>
            <BandsGraph amounts={amounts} active={enabled} canDrag={!!levels} onAmount={setAmount} onDrag={setDragging} />
            {strips.some((s) => s.length > 0) && (
              <Box sx={{ mt: 1 }}>
                <Typography sx={{ fontSize: '0.65rem', color: 'text.secondary', mb: 0.25 }}>
                  Where each band works in the track (click to jump)
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  {BANDS.map((b, i) => (
                    <TimelineStrip key={b.name} values={strips[i]} scaleDB={AMOUNT_MAX} color={b.color} height={16} />
                  ))}
                </Box>
              </Box>
            )}
            <Typography sx={{ fontSize: '0.75rem', mt: 1 }}>
              Lows, mids and highs are evened out separately: the bass stays steady without turning the whole
              mix down, and quiet detail comes forward — most of all in the mids.
            </Typography>
            <Typography sx={{ fontSize: '0.7rem', color: enabled ? 'text.secondary' : '#FBBF24', mt: 0.5 }}>
              {enabled
                ? 'Drag a band up to even it out more (its quiet parts come up), down for less.'
                : 'Off — switch it on to hear it.'}
            </Typography>
          </>
        ) : (
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1.5 }}>
            {BANDS.map((b, i) => {
              const gr = enabled ? meters?.[i] : undefined;
              const knob = (label: string, param: string, min: number, max: number, step: number, unit: string) => (
                <Knob label={label} unit={unit} size={48} color={b.color} min={min} max={max} step={step}
                  value={params[`band.${i}.${param}`] ?? min}
                  onChange={(v) => setParam(PROC, `band.${i}.${param}`, v)} />
              );
              return (
                <Box key={b.name} sx={{ p: 1, borderRadius: 1, bgcolor: 'rgba(0,0,0,0.25)', textAlign: 'center' }}>
                  <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: b.color }}>{b.name}</Typography>
                  <Typography sx={{ fontSize: '0.65rem', color: 'text.secondary' }}>{b.range}</Typography>
                  <Typography sx={{ fontSize: '0.7rem', my: 0.75 }}>
                    {gr ? `−${gr.avg_gr_db.toFixed(1)} dB avg · −${gr.max_gr_db.toFixed(1)} max` : '—'}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center', flexWrap: 'wrap' }}>
                    {knob('Threshold', 'threshold', -70, 0, 0.5, ' dB')}
                    {knob('Ratio', 'ratio', 1, 6, 0.1, ':1')}
                    {knob('Makeup', 'makeup', 0, 8, 0.1, ' dB')}
                    {knob('Attack', 'attack', 1, 200, 1, ' ms')}
                    {knob('Release', 'release', 10, 1000, 5, ' ms')}
                  </Box>
                </Box>
              );
            })}
          </Box>
        )}
      </Collapse>
    </Paper>
  );
};

// The song's spectrum in three zones; each zone's block is its amount.
const BandsGraph: React.FC<{
  amounts: number[];
  active: boolean;
  canDrag: boolean;
  onAmount: (band: number, amount: number) => void;
  onDrag: (on: boolean) => void;
}> = ({ amounts, active, canDrag, onAmount, onDrag }) => {
  const { ref, width, begin, pos } = useCanvas(HEIGHT);
  const spectrum = useStore((s) => s.analysis?.spectrum);
  const drag = useRef<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const top = 22, bottom = HEIGHT - 16;
  const toX = (f: number) => (Math.log(f / F_MIN) / Math.log(F_MAX / F_MIN)) * width;
  const toY = (amount: number) => bottom - (Math.max(0, Math.min(AMOUNT_MAX, amount)) / AMOUNT_MAX) * (bottom - top);
  const bandAt = (x: number) => BANDS.findIndex((b) => x >= toX(b.from) && x < toX(b.to));
  const amountAt = (y: number) => Math.round(Math.max(0, Math.min(AMOUNT_MAX, ((bottom - y) / (bottom - top)) * AMOUNT_MAX)) * 10) / 10;

  // The spectrum per pixel column (dB, tilted +3 dB/octave so a balanced
  // mix reads level), relative to its highest point.
  const shape = useMemo(() => {
    if (!spectrum || spectrum.frequencies.length < 2) return null;
    const df = spectrum.frequencies[1];
    const cols = 240;
    const out = new Array<number>(cols);
    let max = -Infinity;
    for (let c = 0; c < cols; c++) {
      const f0 = F_MIN * Math.pow(F_MAX / F_MIN, c / cols), f1 = F_MIN * Math.pow(F_MAX / F_MIN, (c + 1) / cols);
      const k0 = Math.max(1, Math.round(f0 / df)), k1 = Math.max(k0, Math.min(spectrum.magnitudes.length - 1, Math.round(f1 / df)));
      let sum = 0;
      for (let k = k0; k <= k1; k++) sum += Math.pow(10, spectrum.magnitudes[k] / 10);
      out[c] = 10 * Math.log10(sum / (k1 - k0 + 1) + 1e-30) + 3 * Math.log2(f0 / 1000);
      max = Math.max(max, out[c]);
    }
    return out.map((v) => v - max);
  }, [spectrum]);

  useEffect(() => {
    const ctx = begin();
    if (!ctx) return;
    ctx.globalAlpha = active ? 1 : 0.45;
    ctx.font = '10px sans-serif';
    BANDS.forEach((b, i) => {
      const x0 = toX(b.from), x1 = toX(b.to);
      ctx.fillStyle = b.color + '14';
      ctx.fillRect(x0, 0, x1 - x0, HEIGHT);

      // The amount: a block rising from the bottom, its top edge the handle.
      const y = toY(amounts[i]);
      ctx.fillStyle = b.color + (hover === i || drag.current === i ? '66' : '44');
      ctx.fillRect(x0 + 1, y, x1 - x0 - 2, bottom - y);
      ctx.fillStyle = b.color;
      ctx.fillRect(x0 + 1, y - 1, x1 - x0 - 2, hover === i || drag.current === i ? 3 : 2);

      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = b.color;
      ctx.fillText(b.name, (x0 + x1) / 2, 4);
    });

    // The song's spectrum over the zones.
    if (shape) {
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.beginPath();
      shape.forEach((db, c) => {
        const x = (c / (shape.length - 1)) * width;
        const y = top + Math.min(1, -db / 50) * (bottom - top);
        if (c === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }

    // Each band's amount in words, on a plate so it reads over the spectrum.
    BANDS.forEach((b, i) => {
      const text = amounts[i] < 0.05 ? 'untouched' : `evened out by ${amounts[i].toFixed(1)} dB`;
      const cx = (toX(b.from) + toX(b.to)) / 2, cy = Math.max(top + 14, toY(amounts[i]) - 11);
      const tw = ctx.measureText(text).width + 10;
      ctx.fillStyle = 'rgba(15,15,22,0.8)';
      ctx.fillRect(cx - tw / 2, cy - 8, tw, 16);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, cx, cy);
    });

    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.textBaseline = 'top';
    for (const [f, label] of [[50, '50'], [200, '200 Hz'], [1000, '1k'], [4000, '4 kHz'], [10000, '10k']] as const) {
      ctx.textAlign = 'center';
      ctx.fillText(label, toX(f), bottom + 3);
    }
    ctx.globalAlpha = 1;
  }, [width, amounts.join(','), shape, active, hover]);

  return (
    <Box sx={{ borderRadius: 1, overflow: 'hidden', bgcolor: 'rgba(0,0,0,0.3)' }}>
      <canvas
        ref={ref}
        style={{ width: '100%', height: HEIGHT, display: 'block', touchAction: 'none', cursor: canDrag && hover !== null ? 'ns-resize' : 'default' }}
        onPointerDown={(e) => {
          const { x, y } = pos(e);
          const band = bandAt(x);
          if (!canDrag || band < 0) return;
          (e.target as Element).setPointerCapture(e.pointerId);
          drag.current = band;
          onDrag(true);
          onAmount(band, amountAt(y));
        }}
        onPointerMove={(e) => {
          const { x, y } = pos(e);
          if (drag.current === null) { setHover(bandAt(x) >= 0 ? bandAt(x) : null); return; }
          onAmount(drag.current, amountAt(y));
        }}
        onPointerUp={() => { drag.current = null; onDrag(false); }}
        onPointerCancel={() => { drag.current = null; onDrag(false); }}
        onPointerLeave={() => setHover(null)}
      />
    </Box>
  );
};
