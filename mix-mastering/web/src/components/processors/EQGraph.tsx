import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Box } from '@mui/material';
import { useStore } from '../../store/store';
import { getAnalyserNode, getAudioContext } from '../../audio/context';
import {
  type EQBand, eqResponseDB, bandIsActive, biquad, biquadDB, freqToX, xToFreq, F_MIN, F_MAX,
} from '../../audio/eqMath';

export const BAND_COLORS = ['#FF6584', '#FBBF24', '#4ADE80', '#6C63FF', '#A78BFA', '#22D3EE'];
export const BAND_LABELS = ['HPF', 'Low', 'Low Mid', 'High Mid', 'High', 'LPF'];

export const GAIN_RANGE = 18; // dB, matches the knob range
const Q_MIN = 0.1;
const Q_MAX = 10;
const HIT_RADIUS = 12; // CSS px
// Curves are drawn at a fixed nominal rate; the response below 20 kHz is
// the same at 44.1 and 48 kHz to well within a pixel.
const DRAW_RATE = 48000;

const ZONES: [string, number, number][] = [
  ['Sub', 20, 60], ['Bass', 60, 250], ['Low mids', 250, 500], ['Mids', 500, 2000],
  ['Upper mids', 2000, 4000], ['Presence', 4000, 6000], ['Air', 6000, 20000],
];

export interface BandEdit {
  freq?: number;
  gain?: number;
  q?: number;
  enabled?: boolean;
}

interface EQGraphProps {
  bands: EQBand[];
  eqEnabled: boolean;
  height: number;
  interactive?: boolean;
  selected?: number | null;
  onSelect?: (i: number | null) => void;
  onEdit?: (i: number, edit: BandEdit) => void;
  onGrab?: (i: number | null) => void; // pointer down on a band / released
  showZones?: boolean;
  showSpectra?: boolean;
}

// Smoothed spectrum on the log axis: average power over 1/6 octave around
// each point, then shift so the 200 Hz–5 kHz mean sits at 0 dB — the
// overlays compare tonal shape, not level (the result is louder anyway).
export function shapeCurve(mags: ArrayLike<number>, binHz: number, points: number): Float32Array {
  const out = new Float32Array(points);
  const n = mags.length;
  const half = Math.pow(2, 1 / 12);
  let refSum = 0, refN = 0;
  for (let p = 0; p < points; p++) {
    const f = F_MIN * Math.pow(F_MAX / F_MIN, p / (points - 1));
    const lo = Math.max(1, Math.floor(f / half / binHz));
    const hi = Math.min(n - 1, Math.max(lo, Math.ceil(f * half / binHz)));
    let pow = 0, cnt = 0;
    for (let i = lo; i <= hi; i++) {
      pow += Math.pow(10, mags[i] / 10);
      cnt++;
    }
    out[p] = cnt ? 10 * Math.log10(pow / cnt + 1e-30) : -200;
    if (f >= 200 && f <= 5000) { refSum += out[p]; refN++; }
  }
  const ref = refN ? refSum / refN : 0;
  for (let p = 0; p < points; p++) out[p] -= ref;
  return out;
}

const SPEC_POINTS = 160;
const SPEC_RANGE = 60; // dB of spectrum mapped onto the graph height

export const EQGraph: React.FC<EQGraphProps> = ({
  bands, eqEnabled, height, interactive = false, selected = null,
  onSelect, onEdit, onGrab, showZones = false, showSpectra = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(500);
  const [hover, setHover] = useState<number | null>(null);
  const drag = useRef<{ band: number; moved: boolean } | null>(null);
  const isPlaying = useStore((s) => s.isPlaying);
  const analysis = useStore((s) => s.analysis);
  const processedAnalysis = useStore((s) => s.processedAnalysis);

  // Track the element's width so the canvas is drawn at device resolution.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.max(100, el.clientWidth)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const origShape = React.useMemo(() => {
    if (!showSpectra || !analysis) return null;
    const s = analysis.spectrum;
    return shapeCurve(s.magnitudes, s.frequencies[1] ?? 1, SPEC_POINTS);
  }, [showSpectra, analysis]);
  const procShape = React.useMemo(() => {
    if (!showSpectra || !processedAnalysis) return null;
    const s = processedAnalysis.spectrum;
    return shapeCurve(s.magnitudes, s.frequencies[1] ?? 1, SPEC_POINTS);
  }, [showSpectra, processedAnalysis]);

  const gainToY = (g: number) => height / 2 - (g / (2 * GAIN_RANGE)) * (height - 16);
  const yToGain = (y: number) => ((height / 2 - y) / (height - 16)) * 2 * GAIN_RANGE;
  const bandY = (b: EQBand) => (b.type === 'highpass' || b.type === 'lowpass' ? height / 2 : gainToY(b.gain));

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(width * dpr)) canvas.width = Math.round(width * dpr);
    if (canvas.height !== Math.round(height * dpr)) canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = width, h = height;
    ctx.clearRect(0, 0, w, h);

    if (showZones) {
      ctx.font = '10px sans-serif';
      ctx.textBaseline = 'top';
      ZONES.forEach(([label, lo, hi], i) => {
        const x0 = freqToX(lo, w), x1 = freqToX(hi, w);
        if (i % 2 === 0) {
          ctx.fillStyle = 'rgba(255,255,255,0.025)';
          ctx.fillRect(x0, 0, x1 - x0, h);
        }
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        const tw = ctx.measureText(label).width;
        if (tw < x1 - x0 - 4) ctx.fillText(label, (x0 + x1) / 2 - tw / 2, 4);
      });
    }

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    [50, 100, 200, 500, 1000, 2000, 5000, 10000].forEach((f) => {
      const x = Math.round(freqToX(f, w)) + 0.5;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    });
    [-12, -6, 6, 12].forEach((db) => {
      const y = Math.round(gainToY(db)) + 0.5;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    });
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath(); ctx.moveTo(0, h / 2 + 0.5); ctx.lineTo(w, h / 2 + 0.5); ctx.stroke();

    if (interactive) {
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.font = '9px sans-serif';
      ctx.textBaseline = 'bottom';
      [[100, '100'], [1000, '1k'], [10000, '10k']].forEach(([f, l]) => {
        ctx.fillText(l as string, freqToX(f as number, w) + 3, h - 2);
      });
      ctx.textBaseline = 'middle';
      [-12, 12].forEach((db) => ctx.fillText(`${db > 0 ? '+' : ''}${db}`, 3, gainToY(db)));
    }

    // Spectra: whole-track original (filled) and result (line), plus the
    // live output while playing.
    const specY = (db: number) => h * 0.45 - (db / SPEC_RANGE) * h;
    const drawShape = (shape: Float32Array, fill: string | null, stroke: string) => {
      ctx.beginPath();
      for (let p = 0; p < shape.length; p++) {
        const x = (p / (shape.length - 1)) * w;
        const y = Math.min(h, specY(shape[p]));
        if (p === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1;
      ctx.stroke();
      if (fill) {
        ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
      }
    };
    if (origShape) drawShape(origShape, 'rgba(148,163,184,0.10)', 'rgba(148,163,184,0.35)');
    if (procShape) drawShape(procShape, null, 'rgba(244,114,182,0.45)');
    if (showSpectra && isPlaying) {
      const an = getAnalyserNode();
      const data = new Float32Array(an.frequencyBinCount);
      an.getFloatFrequencyData(data);
      const binHz = getAudioContext().sampleRate / an.fftSize;
      drawShape(shapeCurve(data, binHz, SPEC_POINTS), 'rgba(255,255,255,0.06)', 'rgba(255,255,255,0.55)');
    }

    // Per-band contribution of the selected band, then the combined curve.
    if (interactive && selected !== null && bandIsActive(bands[selected]) && eqEnabled) {
      const f = biquad(bands[selected], DRAW_RATE);
      ctx.beginPath();
      for (let px = 0; px <= w; px += 2) {
        const y = gainToY(biquadDB(f, xToFreq(px, w), DRAW_RATE));
        if (px === 0) ctx.moveTo(px, y); else ctx.lineTo(px, y);
      }
      ctx.lineTo(w, h / 2); ctx.lineTo(0, h / 2); ctx.closePath();
      ctx.fillStyle = BAND_COLORS[selected] + '22';
      ctx.fill();
    }

    ctx.strokeStyle = eqEnabled ? '#6C63FF' : 'rgba(108,99,255,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let px = 0; px <= w; px++) {
      const db = Math.max(-GAIN_RANGE * 1.5, eqResponseDB(bands, xToFreq(px, w), DRAW_RATE, eqEnabled));
      const y = gainToY(db);
      if (px === 0) ctx.moveTo(px, y); else ctx.lineTo(px, y);
    }
    ctx.stroke();

    // Band points: filled when on, hollow when off.
    bands.forEach((b, i) => {
      const x = freqToX(b.freq, w);
      const y = bandY(b);
      const r = interactive ? (i === selected || i === hover ? 7 : 6) : 4;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      if (b.enabled) {
        ctx.fillStyle = BAND_COLORS[i];
        ctx.fill();
      } else {
        ctx.fillStyle = 'rgba(13,13,18,0.9)';
        ctx.fill();
        ctx.strokeStyle = BAND_COLORS[i];
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      if (interactive && i === selected) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, r + 3, 0, Math.PI * 2);
        ctx.stroke();
      }
    });
  }, [width, height, bands, eqEnabled, interactive, selected, hover, showZones, showSpectra, origShape, procShape, isPlaying]);

  // Static redraw on change; continuous while the live spectrum runs.
  useEffect(() => {
    draw();
    if (!(showSpectra && isPlaying)) return;
    let raf = 0;
    const loop = () => { draw(); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [draw, showSpectra, isPlaying]);

  // --- Interaction ---------------------------------------------------------

  const pos = (e: { clientX: number; clientY: number }) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const hitTest = (x: number, y: number): number | null => {
    let best: number | null = null, bestD = HIT_RADIUS;
    bands.forEach((b, i) => {
      const d = Math.hypot(freqToX(b.freq, width) - x, bandY(b) - y);
      if (d <= bestD) { best = i; bestD = d; }
    });
    return best;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!interactive) return;
    const { x, y } = pos(e);
    const i = hitTest(x, y);
    onSelect?.(i);
    if (i === null) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = { band: i, moved: false };
    onGrab?.(i);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!interactive) return;
    const { x, y } = pos(e);
    if (!drag.current) {
      setHover(hitTest(x, y));
      return;
    }
    const i = drag.current.band;
    const b = bands[i];
    const freq = Math.round(Math.min(F_MAX, Math.max(F_MIN, xToFreq(Math.min(width, Math.max(0, x)), width))));
    const edit: BandEdit = { freq };
    if (b.type !== 'highpass' && b.type !== 'lowpass') {
      edit.gain = Math.round(Math.min(GAIN_RANGE, Math.max(-GAIN_RANGE, yToGain(y))) * 10) / 10;
    }
    // Grabbing a band that's off (e.g. the high-pass) switches it on.
    if (!b.enabled) edit.enabled = true;
    drag.current.moved = true;
    onEdit?.(i, edit);
  };
  const endDrag = () => {
    if (drag.current) onGrab?.(null);
    drag.current = null;
  };
  const onDoubleClick = (e: React.MouseEvent) => {
    if (!interactive) return;
    const { x, y } = pos(e);
    const i = hitTest(x, y);
    if (i !== null) onEdit?.(i, { enabled: !bands[i].enabled });
  };

  // Wheel adjusts the width (Q) of the hovered or selected band. React's
  // onWheel is passive, so preventDefault needs a native listener.
  const wheelTarget = hover ?? selected;
  useEffect(() => {
    const el = canvasRef.current;
    if (!el || !interactive) return;
    const onWheel = (e: WheelEvent) => {
      if (wheelTarget === null) return;
      e.preventDefault();
      const b = bands[wheelTarget];
      const q = Math.min(Q_MAX, Math.max(Q_MIN, b.q * Math.pow(1.1, e.deltaY < 0 ? 1 : -1)));
      onEdit?.(wheelTarget, { q: Math.round(q * 100) / 100 });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [interactive, wheelTarget, bands, onEdit]);

  return (
    <Box sx={{ borderRadius: 1, overflow: 'hidden', bgcolor: 'rgba(0,0,0,0.3)' }}>
      <canvas
        ref={canvasRef}
        style={{
          width: '100%', height, display: 'block', touchAction: 'none',
          cursor: interactive ? (drag.current ? 'grabbing' : hover !== null ? 'grab' : 'default') : 'default',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={() => setHover(null)}
        onDoubleClick={onDoubleClick}
      />
    </Box>
  );
};
