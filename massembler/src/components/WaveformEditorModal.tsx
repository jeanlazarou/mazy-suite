import { useEffect, useRef, useState } from 'react';
import { AudioFile } from '../types';
import { useStore } from '../store';
import { drawWaveform } from '../utils/waveformPeaks';
import { isTextEntry } from '../utils/keyboard';
import {
  MIN_SELECTION_SECONDS,
  Selection,
  SelectionGrab,
  advancePlayhead,
  dragSelection,
  grabAt,
  panView,
  zoomView,
} from '../utils/clipSelection';

/** How close to a selection edge a press must be to grab it, in pixels. */
const EDGE_GRAB_PX = 8;
/** Movement before a press counts as a drag rather than a click. */
const DRAG_THRESHOLD_PX = 3;
const MAX_ZOOM = 32;
const WAVEFORM_HEIGHT = 300;

interface WaveformEditorModalProps {
  audioFile: AudioFile;
  /** Creating stays open for the next clip from the same file; editing closes on save. */
  mode: 'create' | 'edit';
  onClose: () => void;
  onSubmit: (start: number, end: number, name: string) => void;
  initialSelection?: Selection;
  initialName?: string;
  /** Editing a clip that is already placed - only the name may change. */
  regionLocked?: boolean;
  /** The clip being edited, left out of the regions shown as already taken. */
  editingClipId?: string;
}

interface Drag {
  grab: SelectionGrab | 'pan';
  originX: number;
  originTime: number;
  origin: Selection | null;
  view: Selection;
  started: boolean;
}

interface Preview {
  source: AudioBufferSourceNode;
  /** Where in the file the playhead was at context time `at`. */
  position: number;
  at: number;
  frame: number;
}

const seconds = (value: number) => `${value.toFixed(2)}s`;

export function WaveformEditorModal({
  audioFile,
  mode,
  onClose,
  onSubmit,
  initialSelection,
  initialName = '',
  regionLocked = false,
  editingClipId,
}: WaveformEditorModalProps) {
  const showToast = useStore((state) => state.showToast);
  const allClips = useStore((state) => state.clips);
  const taken = allClips.filter((c) => c.audioFileId === audioFile.id && c.id !== editingClipId);
  const duration = audioFile.duration;

  const [selection, setSelection] = useState<Selection | null>(initialSelection ?? null);
  const [view, setView] = useState<Selection>({ start: 0, end: duration });
  const [name, setName] = useState(initialName);
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(false);
  const [hover, setHover] = useState<SelectionGrab>('new');
  const [dragging, setDragging] = useState<SelectionGrab | 'pan' | null>(null);
  const [width, setWidth] = useState(0);

  const areaRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const previewRef = useRef<Preview | null>(null);

  // What listeners and the animation loop read: they outlive a render.
  const latest = useRef({ selection, view, loop });
  latest.current = { selection, view, loop };

  const span = view.end - view.start;
  const percentOf = (time: number) => ((time - view.start) / span) * 100;
  const xOf = (time: number, rect: DOMRect) => ((time - view.start) / span) * rect.width;

  /* ---------------------------------------------------------------- preview */

  const placePlayhead = (position: number | null) => {
    const line = playheadRef.current;
    if (!line) return;
    const { view } = latest.current;
    if (position === null || position < view.start || position > view.end) {
      line.style.display = 'none';
      return;
    }
    line.style.display = 'block';
    line.style.left = `${((position - view.start) / (view.end - view.start)) * 100}%`;
  };

  const stopPreview = () => {
    const preview = previewRef.current;
    if (!preview) return;
    previewRef.current = null;
    cancelAnimationFrame(preview.frame);
    preview.source.onended = null;
    try {
      preview.source.stop();
    } catch {
      // already stopped
    }
    placePlayhead(null);
    setPlaying(false);
  };

  const tick = () => {
    const preview = previewRef.current;
    const current = latest.current.selection;
    if (!preview || !current) return;
    const now = preview.source.context.currentTime;
    preview.position = advancePlayhead(preview.position, now - preview.at, current, preview.source.loop);
    preview.at = now;
    placePlayhead(preview.position);
    preview.frame = requestAnimationFrame(tick);
  };

  /** Play the selection - from `from` when that lies inside it - once, or looping. */
  const startPreview = (from?: number) => {
    const current = latest.current.selection;
    if (!current || current.end - current.start < MIN_SELECTION_SECONDS) return;
    stopPreview();

    const ctx = useStore.getState().ensureAudioContext();
    if (ctx.state === 'suspended') void ctx.resume();

    const position =
      from !== undefined && from >= current.start && from < current.end ? from : current.start;
    const source = ctx.createBufferSource();
    source.buffer = audioFile.buffer;
    source.connect(ctx.destination);
    if (latest.current.loop) {
      source.loop = true;
      source.loopStart = current.start;
      source.loopEnd = current.end;
      source.start(0, position);
    } else {
      source.start(0, position, current.end - position);
    }
    source.onended = () => {
      if (previewRef.current?.source === source) stopPreview();
    };

    previewRef.current = { source, position, at: ctx.currentTime, frame: requestAnimationFrame(tick) };
    setPlaying(true);
  };

  const toggleLoop = () => {
    const next = !loop;
    latest.current.loop = next;
    setLoop(next);
    // Carry on from the same spot, in the new mode.
    if (previewRef.current) startPreview(previewRef.current.position);
  };

  /* -------------------------------------------------------------- selection */

  const changeSelection = (next: Selection) => {
    setSelection(next);
    latest.current.selection = next;

    // A looping preview follows the edges as they move, so the cut points can
    // be heard while they are being placed.
    const source = previewRef.current?.source;
    if (!source?.loop) return;
    if (next.start >= source.loopEnd) {
      source.loopEnd = next.end;
      source.loopStart = next.start;
    } else {
      source.loopStart = next.start;
      source.loopEnd = next.end;
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const area = areaRef.current;
    if (!area || e.button !== 0) return;
    e.preventDefault();
    // Out of the name field, so Space plays the selection rather than typing.
    area.focus();

    const rect = area.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const grab = e.shiftKey
      ? 'pan'
      : regionLocked
        ? null
        : grabAt(x, selection, (t) => xOf(t, rect), EDGE_GRAB_PX);
    if (!grab) return;

    dragRef.current = {
      grab,
      originX: x,
      originTime: view.start + (x / rect.width) * span,
      origin: selection,
      view,
      started: false,
    };
  };

  const handleHover = (e: React.MouseEvent<HTMLDivElement>) => {
    if (dragRef.current || regionLocked) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setHover(grabAt(e.clientX - rect.left, selection, (t) => xOf(t, rect), EDGE_GRAB_PX));
  };

  /* ----------------------------------------------------------------- submit */

  const close = () => {
    stopPreview();
    onClose();
  };

  const submit = () => {
    if (!selection || selection.end - selection.start < MIN_SELECTION_SECONDS) {
      showToast('Select a region first', 'warning');
      return;
    }
    const trimmed = name.trim();
    if (!trimmed) {
      showToast('Please enter a clip name', 'warning');
      nameRef.current?.focus();
      return;
    }

    onSubmit(selection.start, selection.end, trimmed);
    if (mode === 'edit') {
      close();
      return;
    }
    // Ready for the next clip from the same file.
    setName('');
    areaRef.current?.focus();
  };

  // Listeners registered once read the current handlers through this.
  const actions = useRef({ changeSelection, startPreview, stopPreview, close });
  actions.current = { changeSelection, startPreview, stopPreview, close };

  /* ---------------------------------------------------------------- effects */

  useEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    const observer = new ResizeObserver(() => setWidth(area.clientWidth));
    observer.observe(area);
    setWidth(area.clientWidth);
    return () => observer.disconnect();
  }, []);

  // The waveform redraws only when the view or the size changes; the
  // selection and the playhead are drawn over it.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width === 0) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(WAVEFORM_HEIGHT * ratio);
    drawWaveform(canvas, audioFile.buffer, view.start, view.end, '#3b82f6');
  }, [audioFile.buffer, view, width]);

  // Drags are followed on the document, so the pointer may leave the waveform.
  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      const drag = dragRef.current;
      const area = areaRef.current;
      if (!drag || !area) return;

      const rect = area.getBoundingClientRect();
      const x = e.clientX - rect.left;
      if (!drag.started) {
        if (Math.abs(x - drag.originX) < DRAG_THRESHOLD_PX) return;
        drag.started = true;
        setDragging(drag.grab);
      }

      const dragSpan = drag.view.end - drag.view.start;
      if (drag.grab === 'pan') {
        setView(panView(drag.view, ((drag.originX - x) / rect.width) * dragSpan, duration));
        return;
      }
      const time = drag.view.start + (x / rect.width) * dragSpan;
      actions.current.changeSelection(
        dragSelection(drag.grab, drag.origin, drag.originTime, time, duration)
      );
    };

    const handleUp = () => {
      dragRef.current = null;
      setDragging(null);
    };

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
    return () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };
  }, [duration]);

  // The wheel zooms around the pointer; a sideways swipe pans. Registered by
  // hand: React's wheel listener is passive and could not stop the page
  // scrolling instead.
  useEffect(() => {
    const area = areaRef.current;
    if (!area) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = area.getBoundingClientRect();
      const scale = e.deltaMode === 1 ? 16 : 1; // lines rather than pixels
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        setView((v) => panView(v, ((e.deltaX * scale) / rect.width) * (v.end - v.start), duration));
      } else if (e.deltaY !== 0) {
        const anchor = (e.clientX - rect.left) / rect.width;
        setView((v) => zoomView(v, Math.exp(-e.deltaY * scale * 0.002), anchor, duration, MAX_ZOOM));
      }
    };

    area.addEventListener('wheel', handleWheel, { passive: false });
    return () => area.removeEventListener('wheel', handleWheel);
  }, [duration]);

  // Space plays and stops the selection; Escape closes.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        actions.current.close();
        return;
      }
      if (e.code !== 'Space' || e.repeat || isTextEntry(e.target)) return;
      e.preventDefault();
      if (previewRef.current) actions.current.stopPreview();
      else actions.current.startPreview();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Closing the editor any way at all silences its preview.
  useEffect(() => {
    return () => {
      const preview = previewRef.current;
      if (!preview) return;
      cancelAnimationFrame(preview.frame);
      preview.source.onended = null;
      try {
        preview.source.stop();
      } catch {
        // already stopped
      }
    };
  }, []);

  /* ----------------------------------------------------------------- render */

  const length = selection ? selection.end - selection.start : 0;
  const hasSelection = length >= MIN_SELECTION_SECONDS;
  const zoom = duration / span;

  const zoomBy = (factor: number) => setView((v) => zoomView(v, factor, 0.5, duration, MAX_ZOOM));
  const zoomToSelection = () => {
    if (!selection) return;
    const pad = length * 0.1;
    const minSpan = duration / MAX_ZOOM;
    let start = Math.max(0, selection.start - pad);
    let end = Math.min(duration, selection.end + pad);
    if (end - start < minSpan) {
      start = Math.max(0, Math.min((start + end) / 2 - minSpan / 2, duration - minSpan));
      end = start + minSpan;
    }
    setView({ start, end });
  };

  const grabbed = dragging ?? hover;
  const cursor = regionLocked
    ? dragging === 'pan' ? 'cursor-grabbing' : 'cursor-default'
    : grabbed === 'start' || grabbed === 'end'
      ? 'cursor-ew-resize'
      : grabbed === 'move' || grabbed === 'pan'
        ? dragging ? 'cursor-grabbing' : 'cursor-grab'
        : 'cursor-crosshair';

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"
    >
      <div className="bg-gray-800 rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-auto">
        {/* Header */}
        <div className="p-4 border-b border-gray-700 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold">{mode === 'edit' ? 'Edit Clip' : 'Make Clips'}</h2>
            <p className="text-sm text-gray-400">
              {audioFile.name} · {seconds(duration)} · {taken.length} other clip
              {taken.length === 1 ? '' : 's'} from this file
            </p>
          </div>
          <button onClick={close} className="text-gray-400 hover:text-white text-2xl" title="Close (Esc)">
            ×
          </button>
        </div>

        <div className="p-6">
          {/* Zoom */}
          <div className="mb-3 flex items-center gap-2 text-sm flex-wrap">
            <button
              onClick={() => zoomBy(0.5)}
              disabled={zoom <= 1.0001}
              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:cursor-not-allowed rounded"
              title="Zoom out"
            >
              🔍−
            </button>
            <button
              onClick={() => zoomBy(2)}
              disabled={zoom >= MAX_ZOOM - 0.001}
              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:cursor-not-allowed rounded"
              title="Zoom in"
            >
              🔍+
            </button>
            <span className="px-2 py-1 bg-gray-900 rounded font-mono">{zoom.toFixed(1)}x</span>
            <button
              onClick={() => setView({ start: 0, end: duration })}
              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded"
            >
              Fit
            </button>
            <button
              onClick={zoomToSelection}
              disabled={!hasSelection}
              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:cursor-not-allowed rounded"
            >
              Zoom to Selection
            </button>
            <span className="text-gray-400 ml-2">
              View: {seconds(view.start)} - {seconds(view.end)}
            </span>
          </div>

          {regionLocked && (
            <div className="mb-3 px-3 py-2 rounded bg-yellow-900/40 border border-yellow-700 text-sm text-yellow-200">
              This clip is placed on a track, so its region is locked - changing it
              would move audio already arranged on the timeline. You can still
              rename it.
            </div>
          )}

          {/* Waveform, with the selection and the playhead drawn over it */}
          <div
            ref={areaRef}
            tabIndex={0}
            aria-label="Waveform: drag to select a region"
            className={`relative w-full overflow-hidden border border-gray-700 rounded bg-gray-900 outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${cursor}`}
            style={{ height: WAVEFORM_HEIGHT }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleHover}
            onMouseLeave={() => !dragRef.current && setHover('new')}
          >
            {/* Regions already made into clips */}
            {taken.map((clip) => (
              <div
                key={clip.id}
                className="absolute top-0 bottom-0 bg-gray-400/10 border-x border-gray-500/50 pointer-events-none"
                style={{
                  left: `${percentOf(clip.startTime)}%`,
                  width: `${(clip.duration / span) * 100}%`,
                }}
              >
                <span className="absolute bottom-1 left-1 right-1 text-[10px] text-gray-400 truncate">
                  {clip.name}
                </span>
              </div>
            ))}

            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />

            {selection && (
              <div
                className="absolute top-0 bottom-0 bg-green-500/25 border-x-2 border-green-500 pointer-events-none"
                style={{ left: `${percentOf(selection.start)}%`, width: `${(length / span) * 100}%` }}
              >
                {!regionLocked && (
                  <>
                    {/* Grips, so the edges read as draggable rather than decorative */}
                    <span className="absolute -left-1 top-0 w-1.5 h-4 bg-green-500" />
                    <span className="absolute -right-1 top-0 w-1.5 h-4 bg-green-500" />
                    <span className="absolute -left-1 bottom-0 w-1.5 h-4 bg-green-500" />
                    <span className="absolute -right-1 bottom-0 w-1.5 h-4 bg-green-500" />
                  </>
                )}
                <span className="absolute top-1 left-2 text-xs font-mono text-green-400 whitespace-nowrap">
                  {seconds(selection.start)}
                </span>
                <span className="absolute top-5 right-2 text-xs font-mono text-green-400 whitespace-nowrap">
                  {seconds(selection.end)}
                </span>
              </div>
            )}

            <div
              ref={playheadRef}
              className="absolute top-0 bottom-0 w-px bg-red-500 pointer-events-none"
              style={{ display: 'none' }}
            />
          </div>
          <p className="mt-1 mb-4 text-xs text-gray-500">
            {regionLocked
              ? 'Shift+drag or swipe sideways to pan; the wheel zooms.'
              : 'Drag to select. Drag an edge, or the middle, to adjust it. Shift+drag or swipe sideways to pan; the wheel zooms.'}
          </p>

          {/* Listening */}
          <div className="flex items-center gap-4 mb-4 flex-wrap">
            <button
              onClick={() => (playing ? stopPreview() : startPreview())}
              disabled={!hasSelection}
              className={`px-4 py-2 rounded font-semibold disabled:bg-gray-600 disabled:cursor-not-allowed ${
                playing ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'
              }`}
              title="Space plays and stops"
            >
              {playing ? '⏹ Stop' : '▶ Play Selection'}
            </button>
            <label
              className="flex items-center gap-1.5 text-sm cursor-pointer select-none"
              title="Repeat the selection, following its edges as you move them"
            >
              <input type="checkbox" checked={loop} onChange={toggleLoop} />
              Loop
            </label>
            <span className="text-sm text-gray-400">
              Selection:{' '}
              <span className="font-mono text-gray-200">
                {selection ? `${seconds(selection.start)} - ${seconds(selection.end)}` : 'none'}
              </span>{' '}
              {selection && <span className="text-green-400">({seconds(length)})</span>}
            </span>
          </div>

          {/* Clip name */}
          <div className="mb-4">
            <label className="block text-sm mb-2" htmlFor="clip-name">
              Clip Name:
            </label>
            <input
              id="clip-name"
              ref={nameRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit();
              }}
              placeholder="Enter clip name..."
              className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2"
              autoFocus
            />
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 justify-end items-center">
            {mode === 'create' && (
              <span className="text-xs text-gray-500 mr-auto">
                The editor stays open: make as many clips from this file as you need.
              </span>
            )}
            <button onClick={close} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded">
              {mode === 'edit' ? 'Cancel' : 'Done'}
            </button>
            <button
              onClick={submit}
              disabled={!hasSelection}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded font-semibold"
            >
              {mode === 'edit' ? 'Save Changes' : 'Create Clip'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
