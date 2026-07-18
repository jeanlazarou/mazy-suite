import { useEffect, useRef, useState } from 'react';
import { AudioFile } from '../types';
import { generateWaveformData } from '../utils/audioEngine';

interface WaveformEditorModalProps {
  audioFile: AudioFile;
  onClose: () => void;
  onCreateClip: (start: number, end: number, name: string) => void;
  initialStart?: number;
  initialEnd?: number;
}

export function WaveformEditorModal({
  audioFile,
  onClose,
  onCreateClip,
  initialStart = 0,
  initialEnd = 0,
}: WaveformEditorModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionStart, setSelectionStart] = useState<number>(initialStart);
  const [selectionEnd, setSelectionEnd] = useState<number>(initialEnd || audioFile.duration);
  const [clipName, setClipName] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 1200, height: 300 });
  const [zoomLevel, setZoomLevel] = useState(1);
  const [viewStart, setViewStart] = useState(0);
  const [viewEnd, setViewEnd] = useState(() => audioFile.duration);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState(0);
  const [isDraggingSelection, setIsDraggingSelection] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);

  useEffect(() => {
    // Initialize audio context
    audioContextRef.current = new AudioContext();

    return () => {
      // Cleanup
      if (audioSourceRef.current) {
        try {
          audioSourceRef.current.stop();
        } catch (e) {
          // Already stopped
        }
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  useEffect(() => {
    // Set canvas size based on container using ResizeObserver
    if (!containerRef.current) return;

    const updateCanvasSize = (entries: ResizeObserverEntry[]) => {
      if (entries[0]) {
        const width = Math.floor(entries[0].contentRect.width);
        if (width > 0) {
          setCanvasSize({ width, height: 300 });
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

    const waveformData = generateWaveformData(audioFile.buffer, canvasSize.width, viewStart, viewEnd);

    // Clear canvas
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw waveform
    const height = canvas.height;
    const maxAmplitude = Math.max(...waveformData);

    ctx.fillStyle = '#3b82f6';
    waveformData.forEach((amplitude, i) => {
      const barHeight = (amplitude / maxAmplitude) * (height / 2);
      const x = i;
      const y = height / 2;

      ctx.fillRect(x, y - barHeight, 1, barHeight * 2);
    });

    // Draw selection
    const start = selectionStart;
    const end = selectionEnd;

    if (start !== null && end !== null) {
      const viewDuration = viewEnd - viewStart;
      const startX = ((start - viewStart) / viewDuration) * canvas.width;
      const endX = ((end - viewStart) / viewDuration) * canvas.width;

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


      // Draw time labels
      ctx.fillStyle = '#22c55e';
      ctx.font = '12px monospace';
      ctx.fillText(`${start.toFixed(2)}s`, startX + 4, 20);
      ctx.fillText(`${end.toFixed(2)}s`, endX - 50, 20);
    }
  }, [audioFile, selectionStart, selectionEnd, canvasSize, viewStart, viewEnd]);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const viewDuration = viewEnd - viewStart;
    const time = viewStart + (x / rect.width) * viewDuration;

    if (e.shiftKey) {
      // Pan mode
      setIsPanning(true);
      setPanStart(x);
    } else if (e.altKey) {
      // Alt+drag to move existing selection
      const selStart = Math.min(selectionStart, selectionEnd);
      const selEnd = Math.max(selectionStart, selectionEnd);
      const selectionDuration = selEnd - selStart;

      // Only allow dragging if selection exists and clicking inside it
      if (selectionDuration > 0.01 && time >= selStart && time <= selEnd) {
        setIsDraggingSelection(true);
        setDragOffset(time - selStart);
      } else {
        // Alt+click outside selection - start new selection
        setIsSelecting(true);
        setSelectionStart(time);
        setSelectionEnd(time);
      }
    } else {
      // Normal click - always create new selection
      setIsSelecting(true);
      setSelectionStart(time);
      setSelectionEnd(time);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const viewDuration = viewEnd - viewStart;
    const time = viewStart + (x / rect.width) * viewDuration;

    if (isPanning) {
      const deltaX = x - panStart;
      const deltaTime = (deltaX / rect.width) * viewDuration;
      const newViewStart = Math.max(0, viewStart - deltaTime);
      const newViewEnd = Math.min(audioFile.duration, viewEnd - deltaTime);

      if (newViewStart >= 0 && newViewEnd <= audioFile.duration) {
        setViewStart(newViewStart);
        setViewEnd(newViewEnd);
        setPanStart(x);
      }
    } else if (isDraggingSelection) {
      // Drag existing selection
      const selectionDuration = Math.abs(selectionEnd - selectionStart);
      const newStart = time - dragOffset;
      const newEnd = newStart + selectionDuration;

      // Constrain to audio bounds
      if (newStart >= 0 && newEnd <= audioFile.duration) {
        setSelectionStart(newStart);
        setSelectionEnd(newEnd);
      }
    } else if (isSelecting) {
      setSelectionEnd(time);
    }
  };

  const handleMouseUp = () => {
    setIsSelecting(false);
    setIsPanning(false);
    setIsDraggingSelection(false);
  };

  const handlePlaySelection = () => {
    if (!audioContextRef.current) return;

    // Stop any currently playing audio
    if (audioSourceRef.current) {
      try {
        audioSourceRef.current.stop();
      } catch (e) {
        // Already stopped
      }
    }

    const start = Math.min(selectionStart, selectionEnd);
    const end = Math.max(selectionStart, selectionEnd);
    const duration = end - start;

    // Create and play audio source
    const source = audioContextRef.current.createBufferSource();
    source.buffer = audioFile.buffer;
    source.connect(audioContextRef.current.destination);

    source.onended = () => {
      setIsPlaying(false);
      audioSourceRef.current = null;
    };

    source.start(0, start, duration);
    audioSourceRef.current = source;
    setIsPlaying(true);
  };

  const handleStopPlayback = () => {
    if (audioSourceRef.current) {
      try {
        audioSourceRef.current.stop();
      } catch (e) {
        // Already stopped
      }
      audioSourceRef.current = null;
    }
    setIsPlaying(false);
  };

  const handleCreate = () => {
    if (!clipName.trim()) {
      alert('Please enter a clip name');
      return;
    }

    const start = Math.min(selectionStart, selectionEnd);
    const end = Math.max(selectionStart, selectionEnd);

    if (end - start < 0.01) {
      alert('Selection is too short');
      return;
    }

    onCreateClip(start, end, clipName);
    onClose();
  };

  const handleZoomIn = () => {
    const newZoomLevel = Math.min(zoomLevel * 2, 32);
    const zoomFactor = newZoomLevel / zoomLevel;
    const currentCenter = (viewStart + viewEnd) / 2;
    const newDuration = (viewEnd - viewStart) / zoomFactor;
    
    const newViewStart = Math.max(0, currentCenter - newDuration / 2);
    const newViewEnd = Math.min(audioFile.duration, newViewStart + newDuration);
    
    setZoomLevel(newZoomLevel);
    setViewStart(newViewStart);
    setViewEnd(newViewEnd);
  };

  const handleZoomOut = () => {
    const newZoomLevel = Math.max(zoomLevel / 2, 1);
    const zoomFactor = zoomLevel / newZoomLevel;
    const currentCenter = (viewStart + viewEnd) / 2;
    const newDuration = (viewEnd - viewStart) * zoomFactor;
    
    const newViewStart = Math.max(0, currentCenter - newDuration / 2);
    const newViewEnd = Math.min(audioFile.duration, newViewStart + newDuration);
    
    setZoomLevel(newZoomLevel);
    setViewStart(newViewStart);
    setViewEnd(newViewEnd);
  };

  const handleZoomToFit = () => {
    setZoomLevel(1);
    setViewStart(0);
    setViewEnd(audioFile.duration);
  };

  const handleZoomToSelection = () => {
    if (selectionStart !== null && selectionEnd !== null) {
      const start = Math.min(selectionStart, selectionEnd);
      const end = Math.max(selectionStart, selectionEnd);
      const padding = (end - start) * 0.1; // 10% padding
      
      const newViewStart = Math.max(0, start - padding);
      const newViewEnd = Math.min(audioFile.duration, end + padding);
      
      setViewStart(newViewStart);
      setViewEnd(newViewEnd);
      
      // Calculate corresponding zoom level
      const newZoomLevel = audioFile.duration / (newViewEnd - newViewStart);
      setZoomLevel(newZoomLevel);
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();

    if (e.deltaY < 0) {
      // Zoom in
      handleZoomIn();
    } else {
      // Zoom out
      handleZoomOut();
    }
  };

  const selectedDuration = Math.abs(selectionEnd - selectionStart);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-auto">
        {/* Header */}
        <div className="p-4 border-b border-gray-700 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold">Waveform Editor</h2>
            <p className="text-sm text-gray-400">{audioFile.name}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl"
          >
            ×
          </button>
        </div>

        {/* Waveform */}
        <div className="p-6">
          {/* Zoom Controls */}
          <div className="mb-4 flex items-center gap-2 text-sm">
            <button
              onClick={handleZoomOut}
              disabled={zoomLevel <= 1}
              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:cursor-not-allowed rounded"
            >
              🔍−
            </button>
            <button
              onClick={handleZoomIn}
              disabled={zoomLevel >= 32}
              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:cursor-not-allowed rounded"
            >
              🔍+
            </button>
            <span className="px-2 py-1 bg-gray-900 rounded font-mono">
              {zoomLevel.toFixed(1)}x
            </span>
            <button
              onClick={handleZoomToFit}
              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded"
            >
              Fit
            </button>
            <button
              onClick={handleZoomToSelection}
              disabled={selectedDuration < 0.01}
              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:cursor-not-allowed rounded"
            >
              Zoom to Selection
            </button>
            <span className="text-gray-400 ml-4">
              View: {viewStart.toFixed(2)}s - {viewEnd.toFixed(2)}s
            </span>
            <span className="text-gray-400 ml-2">
              | Shift+drag to pan | Alt+drag to move selection
            </span>
          </div>
          
          <div className="mb-4" ref={containerRef}>
            <canvas
              ref={canvasRef}
              width={canvasSize.width}
              height={canvasSize.height}
              className={`w-full border border-gray-700 rounded bg-gray-900 ${
                isDraggingSelection ? 'cursor-grabbing' :
                isPanning ? 'cursor-grabbing' :
                'cursor-crosshair'
              }`}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onWheel={handleWheel}
            />
          </div>

          {/* Info */}
          <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
            <div className="bg-gray-900 p-3 rounded">
              <span className="text-gray-400">Total Duration:</span>{' '}
              <span className="font-mono">{audioFile.duration.toFixed(2)}s</span>
            </div>
            <div className="bg-gray-900 p-3 rounded">
              <span className="text-gray-400">Selection:</span>{' '}
              <span className="font-mono">
                {Math.min(selectionStart, selectionEnd).toFixed(2)}s - {Math.max(selectionStart, selectionEnd).toFixed(2)}s
              </span>
              {' '}
              <span className="text-green-400">({selectedDuration.toFixed(2)}s)</span>
            </div>
          </div>

          {/* Controls */}
          <div className="flex gap-2 mb-4">
            {!isPlaying ? (
              <button
                onClick={handlePlaySelection}
                disabled={selectedDuration < 0.01}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded font-semibold"
              >
                ▶ Play Selection
              </button>
            ) : (
              <button
                onClick={handleStopPlayback}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded font-semibold"
              >
                ⏹ Stop
              </button>
            )}
          </div>

          {/* Clip name input */}
          <div className="mb-4">
            <label className="block text-sm mb-2">Clip Name:</label>
            <input
              type="text"
              value={clipName}
              onChange={(e) => setClipName(e.target.value)}
              placeholder="Enter clip name..."
              className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2"
              autoFocus
            />
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={selectedDuration < 0.01}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded font-semibold"
            >
              Create Clip
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
