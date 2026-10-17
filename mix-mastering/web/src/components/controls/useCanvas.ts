import { useEffect, useRef, useState } from 'react';

/** A canvas that fills its container's width at device resolution.
 *  `begin()` sizes the backing store and returns a context in CSS pixels. */
export function useCanvas(height: number) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(400);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.max(100, el.clientWidth)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const begin = (): CanvasRenderingContext2D | null => {
    const canvas = ref.current;
    if (!canvas) return null;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(width * dpr)) canvas.width = Math.round(width * dpr);
    if (canvas.height !== Math.round(height * dpr)) canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    return ctx;
  };

  /** Pointer position in CSS pixels relative to the canvas. */
  const pos = (e: { clientX: number; clientY: number }) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  return { ref, width, height, begin, pos };
}
