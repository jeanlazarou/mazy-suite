/**
 * waveguide — WaveformCanvas
 *
 * Canvas-based waveform renderer. Pure visualization, no audio knowledge.
 * Designed to be extracted as a standalone library component.
 *
 * Props:
 *   peaks      Float32Array | null   — amplitude peaks from AudioPlayer 'wavedata'
 *   progress   number 0–1            — playback position as a fraction of duration
 *   width      number                — display width in CSS pixels
 *   height     number                — display height in CSS pixels
 *   onSeek     (progress: 0–1) => void  — called when user clicks the waveform
 */

import React, { useRef, useEffect } from "react";

const WAVE_COLOR = "gray";
const PROGRESS_COLOR = "#f935ef";

function WaveformCanvas({ peaks, progress, width, height, onSeek }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !peaks || width === 0) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);

    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const mid = height / 2;

    for (let x = 0; x < width; x++) {
      // Map pixel column to peaks array index
      const idx = Math.floor((x / width) * peaks.length);
      const peak = peaks[idx] || 0;
      const barH = Math.max(1, peak * height);

      ctx.fillStyle = x / width < progress ? PROGRESS_COLOR : WAVE_COLOR;
      ctx.fillRect(x, mid - barH / 2, 1, barH);
    }
  }, [peaks, progress, width, height]);

  const handleClick = (e) => {
    if (!peaks || !onSeek) return;
    const rect = canvasRef.current.getBoundingClientRect();
    onSeek((e.clientX - rect.left) / rect.width);
  };

  return (
    <canvas
      ref={canvasRef}
      style={{
        width,
        height,
        cursor: peaks ? "pointer" : "default",
        display: "block",
      }}
      onClick={handleClick}
    />
  );
}

export { WaveformCanvas };
