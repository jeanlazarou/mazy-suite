import { useEffect, useRef, useState } from 'react';

interface VolumeKnobProps {
  value: number; // 0 to 1
  onChange: (value: number) => void;
  size?: number;
  /** Value restored on double-click. */
  defaultValue?: number;
  label?: string;
}

/** Pixels of vertical travel that sweep the whole range. */
const RANGE_PX = 150;
/** Multiplier while Shift is held, for fine adjustment. */
const FINE_FACTOR = 0.25;
const STEP = 0.02;
const COARSE_STEP = 0.1;

const ANGLE_MIN = -135;
const ANGLE_SWEEP = 270;

const clamp = (value: number) => Math.max(0, Math.min(1, value));

/** Point on the knob's arc, in a 0-100 viewBox. */
function polar(angleDeg: number, radius: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: 50 + radius * Math.cos(rad), y: 50 + radius * Math.sin(rad) };
}

function arcPath(fromValue: number, toValue: number, radius: number) {
  const from = polar(ANGLE_MIN + fromValue * ANGLE_SWEEP, radius);
  const to = polar(ANGLE_MIN + toValue * ANGLE_SWEEP, radius);
  const largeArc = (toValue - fromValue) * ANGLE_SWEEP > 180 ? 1 : 0;
  return `M ${from.x} ${from.y} A ${radius} ${radius} 0 ${largeArc} 1 ${to.x} ${to.y}`;
}

export function VolumeKnob({
  value,
  onChange,
  size = 40,
  defaultValue = 0.8,
  label = 'Volume',
}: VolumeKnobProps) {
  const knobRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Live during a drag: the pointer's last Y and the value we have accumulated.
  // Accumulating (rather than deriving from the press point) means toggling
  // Shift part-way through a drag changes sensitivity without jumping.
  const dragRef = useRef<{ lastY: number; value: number } | null>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    knobRef.current?.focus();
    dragRef.current = { lastY: e.clientY, value };
    setIsDragging(true);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;

      // Relative: the knob moves *by* how far the pointer moved, so grabbing
      // it never changes the value and there is no wrap-around to snap across.
      const dy = drag.lastY - moveEvent.clientY;
      drag.lastY = moveEvent.clientY;
      drag.value = clamp(
        drag.value + (dy / RANGE_PX) * (moveEvent.shiftKey ? FINE_FACTOR : 1)
      );
      onChange(drag.value);
    };

    const handleMouseUp = () => {
      dragRef.current = null;
      setIsDragging(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // Registered manually so preventDefault works: React's onWheel is passive
  // and could not stop the timeline scrolling underneath.
  useEffect(() => {
    const node = knobRef.current;
    if (!node) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const step = STEP * (e.shiftKey ? FINE_FACTOR : 1);
      onChange(clamp(value + (e.deltaY < 0 ? step : -step)));
    };

    node.addEventListener('wheel', handleWheel, { passive: false });
    return () => node.removeEventListener('wheel', handleWheel);
  }, [value, onChange]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const step = STEP * (e.shiftKey ? FINE_FACTOR : 1);
    const moves: Record<string, number | undefined> = {
      ArrowUp: value + step,
      ArrowRight: value + step,
      ArrowDown: value - step,
      ArrowLeft: value - step,
      PageUp: value + COARSE_STEP,
      PageDown: value - COARSE_STEP,
      Home: 0,
      End: 1,
    };

    const next = moves[e.key];
    if (next === undefined) return;

    e.preventDefault();
    onChange(clamp(next));
  };

  const percent = Math.round(value * 100);
  const angle = ANGLE_MIN + value * ANGLE_SWEEP;

  return (
    <div
      ref={knobRef}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-valuetext={`${percent}%`}
      title={`${label}: ${percent}% - drag up/down, wheel, or arrow keys. Shift for fine, double-click to reset.`}
      className={`relative rounded-full bg-gray-700 border-2 select-none outline-none cursor-ns-resize ${
        isDragging ? 'border-blue-400 ring-2 ring-blue-500' : 'border-gray-600'
      } focus-visible:ring-2 focus-visible:ring-blue-400`}
      style={{ width: size, height: size }}
      onMouseDown={handleMouseDown}
      onDoubleClick={() => onChange(defaultValue)}
      onKeyDown={handleKeyDown}
    >
      {/* Value arc: shows the setting at a glance, and how much room is left */}
      <svg viewBox="0 0 100 100" className="absolute inset-0 pointer-events-none">
        <path
          d={arcPath(0, 1, 42)}
          fill="none"
          stroke="#4b5563"
          strokeWidth={8}
          strokeLinecap="round"
        />
        {value > 0.001 && (
          <path
            d={arcPath(0, value, 42)}
            fill="none"
            stroke="#60a5fa"
            strokeWidth={8}
            strokeLinecap="round"
          />
        )}
      </svg>

      {/* Pointer line */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ transform: `rotate(${angle}deg)` }}
      >
        <div className="absolute top-1.5 left-1/2 -translate-x-1/2 w-0.5 h-2 bg-blue-200 rounded" />
      </div>

      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <span className="text-[11px] font-semibold text-gray-100">{percent}</span>
      </div>
    </div>
  );
}
