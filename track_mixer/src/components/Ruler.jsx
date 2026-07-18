import { useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useMixStore, selectView } from '../state/store';
import { seek } from '../actions/seek';
import { fmt } from '../utils';

// Smallest tick step (s) that keeps ticks at least ~8 px apart.
function tickStep(width, duration) {
  for (const step of [0.1, 0.5, 1, 5, 15, 30, 60]) {
    if ((width / duration) * step >= 8) return step;
  }
  return 120;
}

export default function Ruler() {
  const canvasRef = useRef(null);
  const [width, setWidth] = useState(0);
  const view = useMixStore(useShallow(selectView));
  const markers = useMixStore((s) => s.markers);
  const markersVisible = useMixStore((s) => s.markersVisible);

  useEffect(() => {
    const cv = canvasRef.current;
    const ro = new ResizeObserver(() => setWidth(cv.clientWidth));
    ro.observe(cv);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const cv = canvasRef.current;
    const dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth;
    const h = cv.clientHeight;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    const c = cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    if (!view.duration) return;
    const t2x = (t) => ((t - view.start) / view.duration) * w;
    if (markersVisible) { // SRT markers (lyric lines / sections)
      c.fillStyle = 'rgba(255, 215, 94, 0.5)';
      for (const m of markers) {
        const x = t2x(m.t);
        if (x >= 0 && x <= w) c.fillRect(x, 0, 1, h);
      }
    }
    c.fillStyle = '#8a8fa0';
    c.font = '10px sans-serif';
    const step = tickStep(w, view.duration);
    const first = Math.ceil(view.start / step) * step;
    for (let s = first; s <= view.start + view.duration; s += step) {
      const x = t2x(s);
      const major = Math.round(s / step) % 5 === 0;
      c.fillRect(x, major ? 10 : 14, 1, major ? 10 : 6);
      if (major) c.fillText(step < 1 ? s.toFixed(1) : fmt(s), x + 3, 9);
    }
  }, [view, width, markers, markersVisible]);

  return (
    <canvas
      ref={canvasRef}
      className="ruler"
      style={{ height: '22px' }}
      onPointerDown={(e) => {
        const rect = e.target.getBoundingClientRect();
        seek(view.start + ((e.clientX - rect.left) / rect.width) * view.duration);
      }}
    />
  );
}
