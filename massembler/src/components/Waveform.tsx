import { useEffect, useRef, useState } from 'react';
import { AudioFile } from '../types';
import { generateWaveformData } from '../utils/audioEngine';

interface WaveformProps {
  audioFile: AudioFile;
  onRegionSelect?: (start: number, end: number) => void;
  selectedStart?: number;
  selectedEnd?: number;
}

export function Waveform({ audioFile, onRegionSelect, selectedStart, selectedEnd }: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionStart, setSelectionStart] = useState<number | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<number | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 120 });

  useEffect(() => {
    // Set canvas size based on container using ResizeObserver
    if (!containerRef.current) return;

    const updateCanvasSize = (entries: ResizeObserverEntry[]) => {
      if (entries[0]) {
        const width = Math.floor(entries[0].contentRect.width);
        if (width > 0) {
          setCanvasSize({ width, height: 120 });
        }
      }
    };

    const resizeObserver = new ResizeObserver(updateCanvasSize);
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const waveformData = generateWaveformData(audioFile.buffer, canvasSize.width);

    // Clear canvas
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw waveform
    const height = canvas.height;
    const maxAmplitude = Math.max(...waveformData);

    ctx.fillStyle = '#3b82f6';
    let barsDrawn = 0;
    waveformData.forEach((amplitude, i) => {
      const barHeight = (amplitude / maxAmplitude) * (height / 2);
      const x = i;
      const y = height / 2;

      ctx.fillRect(x, y - barHeight, 1, barHeight * 2);

      barsDrawn++;
    });

    // Draw selection
    const start = selectedStart ?? selectionStart;
    const end = selectedEnd ?? selectionEnd;

    if (start !== null && end !== null) {
      const startX = (start / audioFile.duration) * canvas.width;
      const endX = (end / audioFile.duration) * canvas.width;

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
    }
  }, [audioFile, selectionStart, selectionEnd, selectedStart, selectedEnd, canvasSize]);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const time = (x / canvas.width) * audioFile.duration;

    setIsSelecting(true);
    setSelectionStart(time);
    setSelectionEnd(time);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isSelecting) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const time = (x / canvas.width) * audioFile.duration;

    setSelectionEnd(time);
  };

  const handleMouseUp = () => {
    if (isSelecting && selectionStart !== null && selectionEnd !== null) {
      const start = Math.min(selectionStart, selectionEnd);
      const end = Math.max(selectionStart, selectionEnd);

      if (onRegionSelect) {
        onRegionSelect(start, end);
      }
    }
    setIsSelecting(false);
  };

  return (
    <div className="relative" ref={containerRef}>
      <div className="border border-gray-700 rounded overflow-hidden bg-gray-900">
        <canvas
          ref={canvasRef}
          width={canvasSize.width}
          height={canvasSize.height}
          className="w-full cursor-crosshair block"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        />
      </div>
      <div className="mt-1 text-xs text-gray-400">
        Duration: {audioFile.duration.toFixed(2)}s
        {selectionStart !== null && selectionEnd !== null && (
          <span className="ml-4">
            Selection: {Math.min(selectionStart, selectionEnd).toFixed(2)}s - {Math.max(selectionStart, selectionEnd).toFixed(2)}s
            (Duration: {Math.abs(selectionEnd - selectionStart).toFixed(2)}s)
          </span>
        )}
      </div>
    </div>
  );
}
