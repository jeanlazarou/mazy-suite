import { useCallback, useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useMixStore, getLane, selectTotalDuration, selectView } from '../state/store';
import { engine } from '../audio/engine';
import { recordHistory, cancelGesture } from '../state/history';
import { effectiveGain, envelopeAt } from '../model/envelope';
import { snapTime } from '../model/snap';
import { LANE_PAD, TRACK_HEIGHT, MASTER_HEIGHT } from './layout';
import { addEnvPoint } from '../actions/add_env_point';
import { moveEnvPoint } from '../actions/move_env_point';
import { deleteEnvPoint } from '../actions/delete_env_point';
import { addMuteRegion } from '../actions/add_mute_region';
import { resizeMuteRegion } from '../actions/resize_mute_region';
import { deleteRegion } from '../actions/delete_region';
import { selectRegion } from '../actions/select_region';
import { selectPoint } from '../actions/select_point';
import { clearSelection } from '../actions/clear_selection';
import { seek } from '../actions/seek';

const MIN_REGION = 0.05; // s — a shorter drag was accidental
const POINT_HIT = 9; // px
const LINE_HIT = 10; // px
const EDGE_HIT = 6; // px
const SNAP_PX = 8; // px — marker snapping range for points and region edges

const PAN_COLOR = '#5ad6c8';

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

const maybeSnap = (s, t, w, view) =>
  s.markersVisible && s.markers.length
    ? snapTime(t, s.markers, (SNAP_PX / w) * view.duration)
    : t;

// Coordinate mapping between canvas pixels and (time, value) in the
// current zoom window. Gain v is 0..1; pan v is -1..1 (top = right).
const mapper = (w, h, view) => ({
  t2x: (t) => ((t - view.start) / view.duration) * w,
  x2t: (x) => view.start + (x / w) * view.duration,
  v2y: (v) => LANE_PAD + (1 - v) * (h - 2 * LANE_PAD),
  y2v: (y) => clamp(1 - (y - LANE_PAD) / (h - 2 * LANE_PAD), 0, 1),
  p2y: (v) => LANE_PAD + (1 - (v + 1) / 2) * (h - 2 * LANE_PAD),
  y2p: (y) => clamp(1 - (2 * (y - LANE_PAD)) / (h - 2 * LANE_PAD), -1, 1),
});

function drawPoints(c, points, toX, toY, selectedPointId, color) {
  const w = c.canvas.clientWidth;
  for (const p of points) {
    const x = toX(p.t);
    if (x < -6 || x > w + 6) continue;
    const sel = p.id === selectedPointId;
    c.beginPath();
    c.arc(x, toY(p.v), sel ? 6 : 4.5, 0, Math.PI * 2);
    c.fillStyle = color;
    c.fill();
    c.strokeStyle = sel ? '#ffffff' : '#12141a';
    c.lineWidth = 1.5;
    c.stroke();
  }
}

function drawLane(cv, lane, sel, view, stemDuration, panMode, isTrack) {
  const dpr = window.devicePixelRatio || 1;
  const w = cv.clientWidth;
  const h = cv.clientHeight;
  if (cv.width !== Math.round(w * dpr)) {
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
  }
  const c = cv.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, w, h);
  if (!view.duration) return;
  const { t2x, x2t, v2y, p2y } = mapper(w, h, view);
  const selectedRegionId = sel?.laneId === lane.id ? sel.regionId : null;
  const selectedPointId = sel?.laneId === lane.id ? sel.pointId : null;

  // waveform (visible slice of the stem)
  if (stemDuration) {
    const peaks = engine.getPeaks(lane.id, Math.max(1, Math.floor(w)), view.start, view.start + view.duration);
    if (peaks) {
      c.fillStyle = lane.color + '55';
      const mid = h / 2;
      const amp = h / 2 - 3;
      for (let x = 0; x < peaks.length; x++) {
        if (!peaks[x]) continue;
        c.fillRect(x, mid + peaks[x][0] * amp, 1, Math.max(1, (peaks[x][1] - peaks[x][0]) * amp));
      }
    }
  }

  // regions (mute / fade-in / fade-out; disabled = dashed, no fill)
  for (const r of lane.regions) {
    const x0 = t2x(r.start);
    const x1 = t2x(r.end);
    if (x1 < 0 || x0 > w) continue;
    const isSel = r.id === selectedRegionId;
    const mode = r.mode ?? 'mute';
    const off = r.enabled === false;
    if (!off) {
      const dark = isSel ? 'rgba(224,106,90,.28)' : 'rgba(0,0,0,.45)';
      if (mode === 'mute') {
        c.fillStyle = dark;
      } else { // gradient shows the fade direction: dark = silent side
        const grad = c.createLinearGradient(x0, 0, x1, 0);
        grad.addColorStop(mode === 'fade-in' ? 0 : 1, dark);
        grad.addColorStop(mode === 'fade-in' ? 1 : 0, 'rgba(0,0,0,0)');
        c.fillStyle = grad;
      }
      c.fillRect(x0, 0, x1 - x0, h);
    }
    c.strokeStyle = isSel ? '#e06a5a' : 'rgba(224,106,90,.5)';
    c.lineWidth = isSel ? 2 : 1;
    c.setLineDash(off ? [4, 4] : []);
    c.strokeRect(x0 + 0.5, 0.5, x1 - x0 - 1, h - 1);
    c.setLineDash([]);
    if (isSel) {
      c.fillStyle = '#e06a5a';
      c.font = '10px sans-serif';
      const what = mode === 'mute' ? `mute ${r.fade}s` : mode;
      c.fillText(
        `${what} ${r.shape ?? 'linear'}${off ? ' · OFF' : ''}  (1/2/3, T=type, E=on/off, Del, ←/→)`,
        x0 + 4,
        12
      );
    }
  }

  // effective gain line (envelope × regions), dimmed while editing pan
  c.globalAlpha = panMode && isTrack ? 0.35 : 1;
  c.strokeStyle = '#ffd75e';
  c.lineWidth = 1.6;
  c.beginPath();
  for (let x = 0; x <= w; x += 2) {
    const y = v2y(effectiveGain(lane, x2t(x)));
    x === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
  }
  c.stroke();
  if (!(panMode && isTrack)) {
    drawPoints(c, lane.env, t2x, v2y, sel?.curve !== 'pan' ? selectedPointId : null, '#ffd75e');
  }
  c.globalAlpha = 1;

  // pan line (center = waveform middle, top = right)
  if (panMode && isTrack) {
    c.strokeStyle = PAN_COLOR;
    c.lineWidth = 1.6;
    c.setLineDash([]);
    c.beginPath();
    for (let x = 0; x <= w; x += 2) {
      const y = p2y(envelopeAt(lane.pan ?? [], x2t(x), 0));
      x === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
    }
    c.stroke();
    drawPoints(c, lane.pan ?? [], t2x, p2y, sel?.curve === 'pan' ? selectedPointId : null, PAN_COLOR);
  }
}

export default function Lane({ laneId, kind = 'track' }) {
  const canvasRef = useRef(null);
  const dragRef = useRef(null);
  const [width, setWidth] = useState(0);
  const isTrack = kind === 'track'; // only tracks carry audio + regions + pan
  const lane = useMixStore(useCallback((s) => getLane(s, laneId), [laneId]));
  const selection = useMixStore((s) => (s.selection?.laneId === laneId ? s.selection : null));
  const view = useMixStore(useShallow(selectView));
  const panMode = useMixStore((s) => s.panMode);
  const stemDuration = useMixStore((s) => s.durations[laneId]);

  useEffect(() => {
    const cv = canvasRef.current;
    const ro = new ResizeObserver(() => setWidth(cv.clientWidth));
    ro.observe(cv);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    drawLane(canvasRef.current, lane, selection, view, stemDuration, panMode, isTrack);
  }, [lane, selection, view, stemDuration, panMode, isTrack, width]);

  const localPoint = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { mx: e.clientX - rect.left, my: e.clientY - rect.top, w: rect.width, h: rect.height };
  };

  const onPointerDown = (e) => {
    if (e.button !== 0 && e.button !== 2) return;
    const s = useMixStore.getState();
    const laneNow = getLane(s, laneId);
    const totalNow = selectTotalDuration(s);
    if (!totalNow) return;
    const viewNow = selectView(s);
    const { mx, my, w, h } = localPoint(e);
    const m = mapper(w, h, viewNow);
    const t = m.x2t(mx);
    const capture = () => canvasRef.current.setPointerCapture(e.pointerId);
    const editPan = panMode && isTrack;

    if (editPan) { // pan mode: point drag / add on the pan line, else seek
      for (const p of laneNow.pan ?? []) {
        if (Math.hypot(m.t2x(p.t) - mx, m.p2y(p.v) - my) < POINT_HIT) {
          if (e.button === 2) {
            deleteEnvPoint(laneId, p.id, 'pan');
            return;
          }
          selectPoint(laneId, p.id, 'pan');
          recordHistory();
          dragRef.current = { type: 'point', id: p.id, curve: 'pan' };
          capture();
          return;
        }
      }
      const lineY = m.p2y(envelopeAt(laneNow.pan ?? [], t, 0));
      if (Math.abs(my - lineY) < LINE_HIT && e.button !== 2) {
        const id = addEnvPoint(laneId, maybeSnap(s, t, w, viewNow), m.y2p(my), 'pan');
        dragRef.current = { type: 'point', id, curve: 'pan' };
        capture();
        return;
      }
      if (e.button !== 2) {
        clearSelection();
        seek(t);
      }
      return;
    }

    if (e.shiftKey && isTrack && e.button === 0) { // create mute region
      const t0 = maybeSnap(s, t, w, viewNow);
      const id = addMuteRegion(laneId, t0, t0);
      dragRef.current = { type: 'region-new', id, t0 };
      capture();
      return;
    }
    for (const p of laneNow.env) { // existing breakpoint?
      if (Math.hypot(m.t2x(p.t) - mx, m.v2y(p.v) - my) < POINT_HIT) {
        if (e.button === 2) {
          deleteEnvPoint(laneId, p.id);
          return;
        }
        selectPoint(laneId, p.id, 'env');
        recordHistory(); // one undo step per drag gesture
        dragRef.current = { type: 'point', id: p.id, curve: 'env' };
        capture();
        return;
      }
    }
    if (e.button === 0 && isTrack) { // region edge → resize
      const tol = (EDGE_HIT / w) * viewNow.duration;
      for (const r of laneNow.regions) {
        const dStart = Math.abs(t - r.start);
        const dEnd = Math.abs(t - r.end);
        if (Math.min(dStart, dEnd) < tol) {
          selectRegion(laneId, r.id);
          recordHistory(); // one undo step per resize gesture
          dragRef.current = { type: 'region-edge', id: r.id, edge: dStart <= dEnd ? 'start' : 'end' };
          capture();
          return;
        }
      }
    }
    const lineY = m.v2y(effectiveGain(laneNow, t)); // near the line → add point
    if (Math.abs(my - lineY) < LINE_HIT && e.button !== 2) {
      const id = addEnvPoint(laneId, maybeSnap(s, t, w, viewNow), m.y2v(my));
      dragRef.current = { type: 'point', id, curve: 'env' };
      capture();
      return;
    }
    const hit = laneNow.regions.find((r) => t > r.start && t < r.end);
    if (hit) { // select / delete region
      if (e.button === 2) deleteRegion(laneId, hit.id);
      else selectRegion(laneId, hit.id);
      return;
    }
    if (e.button !== 2) {
      clearSelection();
      seek(t);
    }
  };

  const onPointerMove = (e) => {
    const drag = dragRef.current;
    if (!drag) return;
    const s = useMixStore.getState();
    const laneNow = getLane(s, laneId);
    const totalNow = selectTotalDuration(s);
    const viewNow = selectView(s);
    const { mx, my, w, h } = localPoint(e);
    const m = mapper(w, h, viewNow);
    const t = maybeSnap(s, clamp(m.x2t(mx), 0, totalNow), w, viewNow);

    if (drag.type === 'point') {
      const v = drag.curve === 'pan' ? m.y2p(my) : m.y2v(my);
      moveEnvPoint(laneId, drag.id, t, v, drag.curve);
    } else if (drag.type === 'region-new') {
      resizeMuteRegion(laneId, drag.id, Math.min(drag.t0, t), Math.max(drag.t0, t));
    } else if (drag.type === 'region-edge') {
      const r = laneNow.regions.find((x) => x.id === drag.id);
      if (!r) return;
      if (drag.edge === 'start') resizeMuteRegion(laneId, drag.id, Math.min(t, r.end - 0.01), r.end);
      else resizeMuteRegion(laneId, drag.id, r.start, Math.max(t, r.start + 0.01));
    }
  };

  const onPointerUp = () => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    if (drag.type === 'region-new') {
      const laneNow = getLane(useMixStore.getState(), laneId);
      const r = laneNow.regions.find((x) => x.id === drag.id);
      if (r && r.end - r.start < MIN_REGION) {
        cancelGesture(); // accidental drag: remove region AND its undo step
        return;
      }
    }
    engine.modelChanged(); // one live-playback resync per drag, not per move
  };

  return (
    <canvas
      ref={canvasRef}
      style={{ height: (isTrack ? TRACK_HEIGHT : MASTER_HEIGHT) + 'px' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onContextMenu={(e) => e.preventDefault()}
    />
  );
}
