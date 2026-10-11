import { useEffect, useRef } from 'react';

export const MIN_PREVIEW = 5;
export const MAX_PREVIEW = 15;

interface PreviewDialProps {
  seconds: number;
  onChange: (seconds: number) => void;
}

// A 15-second timer face: one full turn is 15 s, 12 o'clock is 0 (and 15).
const C = 50;
const FACE = 46;

const clamp = (s: number) => Math.min(MAX_PREVIEW, Math.max(MIN_PREVIEW, s));

/** Point on the face at `seconds` on the dial, `r` from the center */
function at(seconds: number, r: number) {
  const a = (seconds / MAX_PREVIEW) * 2 * Math.PI;
  return { x: C + r * Math.sin(a), y: C - r * Math.cos(a) };
}

function wedge(seconds: number, r: number) {
  const end = at(seconds, r);
  const large = seconds > MAX_PREVIEW / 2 ? 1 : 0;
  // a full turn cannot be one arc: two halves
  if (seconds >= MAX_PREVIEW) {
    return `M ${C} ${C - r} A ${r} ${r} 0 1 1 ${C} ${C + r} A ${r} ${r} 0 1 1 ${C} ${C - r} Z`;
  }
  return `M ${C} ${C} L ${C} ${C - r} A ${r} ${r} 0 ${large} 1 ${end.x} ${end.y} Z`;
}

/**
 * Preview length as an analog timer: drag the hand or click the face, scroll
 * over it, or use the arrow keys. Whole seconds between 5 and 15.
 */
function PreviewDial({ seconds, onChange }: PreviewDialProps) {
  const ref = useRef<SVGSVGElement>(null);
  const latest = useRef({ seconds, onChange });
  latest.current = { seconds, onChange };

  // React's wheel listener is passive; the page must not scroll under the dial
  useEffect(() => {
    const svg = ref.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { seconds, onChange } = latest.current;
      onChange(clamp(seconds + (e.deltaY < 0 ? 1 : -1)));
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, []);

  const fromPointer = (e: React.PointerEvent) => {
    const box = ref.current!.getBoundingClientRect();
    const dx = e.clientX - (box.left + box.width / 2);
    const dy = e.clientY - (box.top + box.height / 2);
    let turn = Math.atan2(dx, -dy) / (2 * Math.PI);
    if (turn < 0) turn += 1;
    const raw = turn * MAX_PREVIEW;
    const s = Math.round(raw) % MAX_PREVIEW;
    if (s === 0) return MAX_PREVIEW;
    // in the dead zone, go to the nearer end: past 12 o'clock is 15, not 5
    if (s < MIN_PREVIEW) return raw < MIN_PREVIEW / 2 ? MAX_PREVIEW : MIN_PREVIEW;
    return s;
  };

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.focus();
    onChange(fromPointer(e));
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) onChange(fromPointer(e));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const step: Record<string, number> = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 };
    if (e.key in step) onChange(clamp(seconds + step[e.key]));
    else if (e.key === 'Home') onChange(MIN_PREVIEW);
    else if (e.key === 'End') onChange(MAX_PREVIEW);
    else return;
    e.preventDefault();
  };

  const hand = at(seconds, 40);

  return (
    <svg
      ref={ref}
      className="preview-dial"
      viewBox="0 0 100 100"
      role="slider"
      tabIndex={0}
      aria-label="Preview length"
      aria-valuemin={MIN_PREVIEW}
      aria-valuemax={MAX_PREVIEW}
      aria-valuenow={seconds}
      aria-valuetext={`${seconds} seconds`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onKeyDown={handleKeyDown}
    >
      <title>{`Preview length: ${seconds} s — drag, scroll or use the arrow keys`}</title>
      <circle className="dial-face" cx={C} cy={C} r={FACE} />
      <path className="dial-wedge" d={wedge(seconds, FACE)} />
      {Array.from({ length: MAX_PREVIEW }, (_, s) => {
        const major = s % 5 === 0;
        const a = at(s, FACE - 2);
        const b = at(s, FACE - (major ? 11 : 6));
        return (
          <line
            key={s}
            className={major ? 'dial-tick major' : 'dial-tick'}
            x1={a.x} y1={a.y} x2={b.x} y2={b.y}
          />
        );
      })}
      <line className="dial-hand" x1={C} y1={C} x2={hand.x} y2={hand.y} />
      <circle className="dial-hub" cx={C} cy={C} r={23} />
      <text className="dial-label" x={C} y={C} textAnchor="middle" dominantBaseline="central">
        {seconds}s
      </text>
    </svg>
  );
}

export default PreviewDial;
