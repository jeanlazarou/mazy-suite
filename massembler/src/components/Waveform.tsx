import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioFile } from '../types';
import { generateWaveformData } from '../utils/audioEngine';

export interface WaveformSelection {
  start: number;
  end: number;
}

interface WaveformProps {
  audioFile: AudioFile;
  selection: WaveformSelection | null;
  onSelectionChange: (selection: WaveformSelection | null) => void;
}

/** How close to an edge the pointer must be to grab it, in pixels. */
const EDGE_GRAB_PX = 8;
/** Movement before a press counts as a drag rather than a stray click. */
const DRAG_THRESHOLD_PX = 3;
/** Smallest selection we allow, so an edge can never cross the other. */
const MIN_SELECTION_SECONDS = 0.01;

type DragMode = 'new' | 'start' | 'end' | 'move';

interface DragState {
  mode: DragMode;
  originX: number;
  originTime: number;
  origin: WaveformSelection | null;
  started: boolean;
}

export function Waveform({ audioFile, selection, onSelectionChange }: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 120 });
  const [hoverMode, setHoverMode] = useState<DragMode>('new');

  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      if (entries[0]) {
        const width = Math.floor(entries[0].contentRect.width);
        if (width > 0) setCanvasSize({ width, height: 120 });
      }
    });
    resizeObserver.observe(containerRef.current);

    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const waveformData = generateWaveformData(audioFile.buffer, canvasSize.width);

    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const height = canvas.height;
    const maxAmplitude = Math.max(...waveformData);

    ctx.fillStyle = '#3b82f6';
    waveformData.forEach((amplitude, i) => {
      const barHeight = (amplitude / maxAmplitude) * (height / 2);
      ctx.fillRect(i, height / 2 - barHeight, 1, barHeight * 2);
    });

    if (!selection) return;

    const startX = (selection.start / audioFile.duration) * canvas.width;
    const endX = (selection.end / audioFile.duration) * canvas.width;

    ctx.fillStyle = 'rgba(34, 197, 94, 0.3)';
    ctx.fillRect(startX, 0, endX - startX, height);

    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(startX, 0);
    ctx.lineTo(startX, height);
    ctx.moveTo(endX, 0);
    ctx.lineTo(endX, height);
    ctx.stroke();

    // Grips, so the edges read as draggable rather than decorative
    ctx.fillStyle = '#22c55e';
    ctx.fillRect(startX - 3, 0, 6, 14);
    ctx.fillRect(endX - 3, 0, 6, 14);
    ctx.fillRect(startX - 3, height - 14, 6, 14);
    ctx.fillRect(endX - 3, height - 14, 6, 14);
  }, [audioFile, selection, canvasSize]);

  const timeAt = useCallback(
    (clientX: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return 0;
      const rect = canvas.getBoundingClientRect();
      return ((clientX - rect.left) / rect.width) * audioFile.duration;
    },
    [audioFile.duration]
  );

  const offsetX = useCallback((clientX: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return 0;
    return clientX - canvas.getBoundingClientRect().left;
  }, []);

  /** Which part of the selection sits under this pixel, if any. */
  const modeAt = (x: number): DragMode => {
    const canvas = canvasRef.current;
    if (!canvas || !selection) return 'new';

    const rect = canvas.getBoundingClientRect();
    const startX = (selection.start / audioFile.duration) * rect.width;
    const endX = (selection.end / audioFile.duration) * rect.width;

    if (Math.abs(x - startX) <= EDGE_GRAB_PX) return 'start';
    if (Math.abs(x - endX) <= EDGE_GRAB_PX) return 'end';
    if (x > startX && x < endX) return 'move';
    return 'new';
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const x = offsetX(e.clientX);
    dragRef.current = {
      mode: modeAt(x),
      originX: x,
      originTime: timeAt(e.clientX),
      origin: selection,
      started: false,
    };
    e.preventDefault();
  };

  // Dragging is tracked on the document so the pointer can leave the canvas
  // mid-drag without the selection being abandoned.
  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;

      const x = offsetX(e.clientX);
      const time = timeAt(e.clientX);
      const clamp = (value: number) => Math.max(0, Math.min(audioFile.duration, value));

      if (!drag.started) {
        if (Math.abs(x - drag.originX) < DRAG_THRESHOLD_PX) return;
        drag.started = true;
      }

      if (drag.mode === 'new') {
        onSelectionChange({
          start: clamp(Math.min(drag.originTime, time)),
          end: clamp(Math.max(drag.originTime, time)),
        });
        return;
      }

      if (!drag.origin) return;

      if (drag.mode === 'start') {
        onSelectionChange({
          start: clamp(Math.min(time, drag.origin.end - MIN_SELECTION_SECONDS)),
          end: drag.origin.end,
        });
      } else if (drag.mode === 'end') {
        onSelectionChange({
          start: drag.origin.start,
          end: clamp(Math.max(time, drag.origin.start + MIN_SELECTION_SECONDS)),
        });
      } else {
        const width = drag.origin.end - drag.origin.start;
        const start = Math.max(
          0,
          Math.min(drag.origin.start + (time - drag.originTime), audioFile.duration - width)
        );
        onSelectionChange({ start, end: start + width });
      }
    };

    const handleUp = () => {
      dragRef.current = null;
    };

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
    return () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };
  }, [audioFile.duration, onSelectionChange, offsetX, timeAt]);

  const cursor =
    hoverMode === 'start' || hoverMode === 'end'
      ? 'ew-resize'
      : hoverMode === 'move'
        ? 'grab'
        : 'crosshair';

  return (
    <div className="relative" ref={containerRef}>
      <div className="border border-gray-700 rounded overflow-hidden bg-gray-900">
        <canvas
          ref={canvasRef}
          width={canvasSize.width}
          height={canvasSize.height}
          className="w-full block"
          style={{ cursor }}
          onMouseDown={handleMouseDown}
          onMouseMove={(e) => {
            if (!dragRef.current) setHoverMode(modeAt(offsetX(e.clientX)));
          }}
        />
      </div>
      <div className="mt-1 text-xs text-gray-400 flex items-center gap-3 flex-wrap">
        <span>Duration: {audioFile.duration.toFixed(2)}s</span>
        {selection && (
          <>
            <span className="text-green-400">
              Selection: {selection.start.toFixed(2)}s - {selection.end.toFixed(2)}s (
              {(selection.end - selection.start).toFixed(2)}s)
            </span>
            <button
              onClick={() => onSelectionChange(null)}
              className="text-gray-500 hover:text-gray-300 underline"
            >
              clear
            </button>
          </>
        )}
      </div>
      <p className="text-xs text-gray-500 mt-1">
        Drag to select, then drag the green edges to adjust or the middle to move it.
      </p>
    </div>
  );
}
