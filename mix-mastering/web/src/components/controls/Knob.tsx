import React, { useCallback, useRef, useState } from 'react';
import { Box, Typography } from '@mui/material';

interface KnobProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  label: string;
  unit?: string;
  onChange: (value: number) => void;
  size?: number;
  color?: string;
}

export const Knob: React.FC<KnobProps> = ({
  value, min, max, step = 0.1, label, unit = '', onChange, size = 56, color = '#6C63FF',
}) => {
  const [dragging, setDragging] = useState(false);
  const startY = useRef(0);
  const startValue = useRef(0);

  const range = max - min;
  const normalized = (value - min) / range;
  const angle = -135 + normalized * 270;

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    startY.current = e.clientY;
    startValue.current = value;
    setDragging(true);

    const onMouseMove = (e: MouseEvent) => {
      const dy = startY.current - e.clientY;
      const sensitivity = e.shiftKey ? 0.1 : 1;
      const delta = (dy / 150) * range * sensitivity;
      const newValue = Math.round(Math.min(max, Math.max(min, startValue.current + delta)) / step) * step;
      onChange(newValue);
    };

    const onMouseUp = () => {
      setDragging(false);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [value, min, max, step, range, onChange]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    const delta = -e.deltaY * (range / 1000);
    const newValue = Math.round(Math.min(max, Math.max(min, value + delta)) / step) * step;
    onChange(newValue);
  }, [value, min, max, step, range, onChange]);

  const r = size / 2 - 4;
  const cx = size / 2;
  const cy = size / 2;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5, userSelect: 'none' }}>
      <svg
        width={size}
        height={size}
        onMouseDown={handleMouseDown}
        onWheel={handleWheel}
        style={{ cursor: 'pointer' }}
      >
        {/* Background arc */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={3} />
        {/* Value arc */}
        <circle
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke={color}
          strokeWidth={3}
          strokeDasharray={`${normalized * 2 * Math.PI * r * 0.75} ${2 * Math.PI * r}`}
          strokeDashoffset={2 * Math.PI * r * 0.375}
          strokeLinecap="round"
          opacity={0.8}
        />
        {/* Knob body */}
        <circle cx={cx} cy={cy} r={r - 6} fill={dragging ? '#2A2A36' : '#1E1E2A'} stroke="rgba(255,255,255,0.1)" strokeWidth={1} />
        {/* Indicator */}
        <line
          x1={cx}
          y1={cy - r + 12}
          x2={cx}
          y2={cy - r + 20}
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          transform={`rotate(${angle}, ${cx}, ${cy})`}
        />
      </svg>
      <Typography variant="body2" sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontSize: '0.7rem', fontWeight: 600 }}>
        {typeof value === 'number' ? value.toFixed(1) : value}{unit}
      </Typography>
    </Box>
  );
};
