import React, { useRef, useEffect } from 'react';
import { Box, Paper, Typography, IconButton, Tooltip, Chip, CircularProgress } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import TroubleshootIcon from '@mui/icons-material/Troubleshoot';
import { useStore } from '../../store/store';
import type { StageSummary } from '../../wasm/engine';

const LANE_WIDTH = 800; // matches the envelope bucket count from the engine
const LANE_HEIGHT = 44;

// Samples at or above 0 dBFS count as clipping. Slightly under 1.0 so a
// hard-clipped signal (samples exactly at ±1.0) is caught despite float
// rounding on the way through float32 and the envelope summary.
const CLIP = 0.9999;

// One stage of the chain: bucketed waveform with clipping columns in red,
// an RMS band for perceived level, and the shared playhead.
const StageLane: React.FC<{
  stage: StageSummary;
  duration: number;
  playbackPosition: number;
  onSeek: (pos: number) => void;
}> = ({ stage, duration, playbackPosition, onSeek }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(0, 0, w, h);

    const n = stage.mins.length;
    const y = (v: number) => (1 - Math.max(-1, Math.min(1, v))) * h / 2;

    // Peak envelope; red where the bucket reaches 0 dBFS.
    for (let px = 0; px < w; px++) {
      const bkt = Math.min(n - 1, Math.floor((px / w) * n));
      const mn = stage.mins[bkt];
      const mx = stage.maxs[bkt];
      const clipped = mx >= CLIP || mn <= -CLIP;
      ctx.strokeStyle = clipped ? '#FF4D4D' : '#6C63FF';
      ctx.beginPath();
      ctx.moveTo(px + 0.5, y(mx));
      ctx.lineTo(px + 0.5, y(mn));
      ctx.stroke();
      // Brighter inner RMS band shows the perceived level.
      const rms = stage.rms[bkt];
      ctx.strokeStyle = clipped ? '#FF9B9B' : '#A78BFA';
      ctx.beginPath();
      ctx.moveTo(px + 0.5, y(rms));
      ctx.lineTo(px + 0.5, y(-rms));
      ctx.stroke();
    }

    // Playhead
    if (duration > 0) {
      const posX = (playbackPosition / duration) * w;
      ctx.strokeStyle = '#FF6584';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(posX, 0);
      ctx.lineTo(posX, h);
      ctx.stroke();
      ctx.lineWidth = 1;
    }
  }, [stage, duration, playbackPosition]);

  return (
    <canvas
      ref={canvasRef}
      width={LANE_WIDTH}
      height={LANE_HEIGHT}
      style={{ width: '100%', height: LANE_HEIGHT, display: 'block', borderRadius: 4, cursor: 'pointer' }}
      onClick={(e) => {
        if (duration <= 0) return;
        const rect = e.currentTarget.getBoundingClientRect();
        onSeek(((e.clientX - rect.left) / rect.width) * duration);
      }}
    />
  );
};

// Chain X-Ray: the signal at every stage of the mastering chain as
// stacked waveform lanes with a shared playhead, so you can watch the
// level evolve — and see where it goes into the red — while listening.
export const ChainXRayPanel: React.FC = () => {
  const open = useStore((s) => s.xrayOpen);
  const stages = useStore((s) => s.xrayStages);
  const meters = useStore((s) => s.meters);
  const fileInfo = useStore((s) => s.fileInfo);
  const playbackPosition = useStore((s) => s.playbackPosition);
  const requestSeek = useStore((s) => s.requestSeek);
  const isProcessing = useStore((s) => s.isProcessing);
  const paramsDirty = useStore((s) => s.paramsDirty);
  const setXrayOpen = useStore((s) => s.setXrayOpen);

  if (!open) return null;

  const duration = fileInfo?.duration ?? 0;

  return (
    <Paper sx={{ p: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <TroubleshootIcon sx={{ fontSize: 18, color: 'primary.main' }} />
        <Typography variant="h6" sx={{ fontSize: '0.9rem' }}>
          Chain X-Ray{fileInfo ? ` — ${fileInfo.name}` : ''}
        </Typography>
        {isProcessing && <CircularProgress size={14} />}
        {!isProcessing && paramsDirty && stages && (
          <Tooltip title="The lanes show the last processing run. Press Process to update them with the current settings.">
            <Chip label="Settings changed — press Process to update" size="small" color="warning" variant="outlined" sx={{ fontSize: '0.65rem', height: 20 }} />
          </Tooltip>
        )}
        <Box sx={{ flex: 1 }} />
        <IconButton size="small" onClick={() => setXrayOpen(false)}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>

      {!stages ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 3, justifyContent: 'center' }}>
          <CircularProgress size={16} />
          <Typography variant="body2" sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
            Processing chain stages…
          </Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          {stages.map((stage) => {
            const gr = meters[stage.name];
            const hot = stage.peak_db >= -0.05;
            return (
              <Box key={stage.name} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box sx={{ width: 170, flexShrink: 0 }}>
                  <Typography variant="body2" sx={{ fontSize: '0.72rem', fontWeight: 600 }} noWrap>
                    {stage.name}
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{ fontSize: '0.65rem', color: hot ? 'error.main' : 'text.secondary', fontWeight: hot ? 600 : 400 }}
                  >
                    Peak {stage.peak_db.toFixed(1)} dB · RMS {stage.rms_db.toFixed(1)} dB
                    {gr && ` · GR ${gr.max_gr_db.toFixed(1)} dB`}
                  </Typography>
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <StageLane
                    stage={stage}
                    duration={duration}
                    playbackPosition={playbackPosition}
                    onSeek={requestSeek}
                  />
                </Box>
              </Box>
            );
          })}
          <Typography variant="body2" sx={{ fontSize: '0.65rem', color: 'text.secondary', mt: 0.25 }}>
            Each lane shows the signal after that stage of the chain (top lane is the
            unprocessed input). Red columns reach 0 dBFS — expected before the limiter,
            gone after it. Click any lane to seek.
          </Typography>
        </Box>
      )}
    </Paper>
  );
};
