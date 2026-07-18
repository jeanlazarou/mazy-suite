import { useRef, useState } from 'react';

interface VolumeKnobProps {
  value: number; // 0 to 1
  onChange: (value: number) => void;
  size?: number;
}

export function VolumeKnob({ value, onChange, size = 40 }: VolumeKnobProps) {
  const knobRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Convert value (0-1) to rotation angle (-135 to 135 degrees)
  const valueToAngle = (val: number) => {
    return -135 + val * 270;
  };

  const angle = valueToAngle(value);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!knobRef.current) return;

      const rect = knobRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      // Calculate angle from center (atan2 returns -180° to 180°)
      const deltaX = moveEvent.clientX - centerX;
      const deltaY = moveEvent.clientY - centerY;
      let deg = Math.atan2(deltaY, deltaX) * (180 / Math.PI);

      // Adjust so that top is 0° (atan2 has right as 0°, we want top as 0°)
      deg = deg - 90;

      // Normalize to -180 to 180 range
      if (deg < -180) deg += 360;
      if (deg > 180) deg -= 360;

      // Our knob range is -135° to +135° (270° total)
      // Clamp the angle to this range
      if (deg < -135) {
        // If beyond min, check which side is closer
        if (deg < -157.5) {
          deg = -135; // Snap to min
        } else {
          deg = 135; // Snap to max
        }
      } else if (deg > 135) {
        // If beyond max, check which side is closer
        if (deg > 157.5) {
          deg = -135; // Snap to min
        } else {
          deg = 135; // Snap to max
        }
      }

      // Map -135° to +135° range to 0-1 value
      const newValue = (deg + 135) / 270;

      onChange(Math.max(0, Math.min(1, newValue)));
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div
      ref={knobRef}
      className={`relative rounded-full bg-gray-700 border-2 border-gray-600 cursor-pointer select-none ${
        isDragging ? 'ring-2 ring-blue-500' : ''
      }`}
      style={{ width: size, height: size }}
      onMouseDown={handleMouseDown}
    >
      {/* Knob indicator */}
      <div
        className="absolute inset-0 transition-transform"
        style={{ transform: `rotate(${angle}deg)` }}
      >
        <div
          className="absolute top-1 left-1/2 -translate-x-1/2 w-0.5 h-3 bg-blue-400 rounded"
        />
      </div>

      {/* Value display in center */}
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[11px] font-semibold text-gray-100">
          {Math.round(value * 100)}
        </span>
      </div>
    </div>
  );
}
