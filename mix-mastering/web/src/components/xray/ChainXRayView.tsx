import React, { useRef, useEffect, useState } from 'react';
import {
  Box, Paper, Typography, IconButton, Tooltip, Chip, CircularProgress,
  Button, TextField, Drawer, ToggleButton, ToggleButtonGroup,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import TroubleshootIcon from '@mui/icons-material/Troubleshoot';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import BlurLinearIcon from '@mui/icons-material/BlurLinear';
import TuneIcon from '@mui/icons-material/Tune';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import SaveIcon from '@mui/icons-material/Save';
import UnfoldMoreIcon from '@mui/icons-material/UnfoldMore';
import UnfoldLessIcon from '@mui/icons-material/UnfoldLess';
import { useStore } from '../../store/store';
import { useAudioEngine } from '../../hooks/useAudioEngine';
import type { StageSummary } from '../../wasm/engine';
import { EQPanel } from '../processors/EQPanel';
import { CompressorPanel } from '../processors/CompressorPanel';
import { LimiterPanel } from '../processors/LimiterPanel';
import { StereoPanel } from '../processors/StereoPanel';
import { BassExciterPanel, TrebleExciterPanel } from '../processors/ExciterPanel';

const LANE_HEIGHT = 96;
const BASE_WIDTH = 1000; // canvas logical width at zoom x1
const CLIP = 0.9999; // samples at/above 0 dBFS count as clipping
const SPEC_FLOOR = -90;

type LaneMode = 'wave' | 'spec';

// Stages whose settings can be edited in place.
const SETTINGS_PANELS: Record<string, React.FC<{ expanded: boolean; onExpandToggle: () => void }>> = {
  'Parametric EQ': EQPanel,
  'Bass Exciter': BassExciterPanel,
  Compressor: CompressorPanel,
  'Treble Exciter': TrebleExciterPanel,
  Limiter: LimiterPanel,
  'Stereo Widener': StereoPanel,
};

// Spectrogram colormap: dB in [SPEC_FLOOR, 0] -> dark blue -> purple ->
// orange -> near-white.
function specColor(db: number): string {
  const t = Math.max(0, Math.min(1, (db - SPEC_FLOOR) / -SPEC_FLOOR));
  const stops = [
    [10, 12, 30], [60, 30, 110], [140, 60, 160], [235, 120, 60], [250, 235, 190],
  ];
  const x = t * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const f = x - i;
  const c = stops[i].map((v, k) => Math.round(v + (stops[i + 1][k] - v) * f));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

function drawWave(
  ctx: CanvasRenderingContext2D, stage: StageSummary,
  w: number, h: number,
) {
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(0, 0, w, h);

  const n = stage.mins.length;
  const y = (v: number) => Math.max(0, Math.min(h, (1 - v) * h / 2));

  for (let px = 0; px < w; px++) {
    const i0 = Math.floor((px / w) * n);
    const i1 = Math.max(i0 + 1, Math.floor(((px + 1) / w) * n));
    let mn = 0, mx = 0, rms = 0;
    for (let i = i0; i < i1 && i < n; i++) {
      if (stage.mins[i] < mn) mn = stage.mins[i];
      if (stage.maxs[i] > mx) mx = stage.maxs[i];
      if (stage.rms[i] > rms) rms = stage.rms[i];
    }
    const clipped = mx >= CLIP || mn <= -CLIP;
    ctx.strokeStyle = clipped ? '#FF4D4D' : '#6C63FF';
    ctx.beginPath();
    ctx.moveTo(px + 0.5, y(mx));
    ctx.lineTo(px + 0.5, y(mn));
    ctx.stroke();
    ctx.strokeStyle = clipped ? '#FF9B9B' : '#A78BFA';
    ctx.beginPath();
    ctx.moveTo(px + 0.5, y(rms));
    ctx.lineTo(px + 0.5, y(-rms));
    ctx.stroke();
  }
}

function drawSpec(
  ctx: CanvasRenderingContext2D, stage: StageSummary,
  w: number, h: number,
) {
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(0, 0, w, h);
  const spec = stage.spec_db;
  if (!spec || spec.length === 0) return;
  const cols = spec.length;
  const bins = spec[0].length;

  const cw = w / cols;
  const bh = h / bins;
  for (let c = 0; c < cols; c++) {
    const x = c * cw;
    for (let b = 0; b < bins; b++) {
      if (spec[c][b] <= SPEC_FLOOR) continue;
      const yTop = h - (b + 1) * bh; // low frequencies at the bottom
      ctx.fillStyle = specColor(spec[c][b]);
      ctx.fillRect(x, yTop, cw + 0.5, bh + 0.5);
    }
  }
}

const StageLane: React.FC<{
  stage: StageSummary;
  mode: LaneMode;
  hZoom: number;
  height: number;
}> = ({ stage, mode, hZoom, height }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const width = Math.min(BASE_WIDTH * hZoom, 16000);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (mode === 'spec') drawSpec(ctx, stage, canvas.width, canvas.height);
    else drawWave(ctx, stage, canvas.width, canvas.height);
  }, [stage, mode, width, height]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{ width: '100%', height, display: 'block', borderRadius: 4 }}
    />
  );
};

// Full-screen Chain X-Ray: the signal at every stage of the mastering
// chain, with per-lane waveform/spectrogram views, zoom, in-place stage
// settings (changes ripple through all following lanes), and saved
// setups that can be visually diffed against the current settings.
export const ChainXRayView: React.FC = () => {
  const stages = useStore((s) => s.xrayStages);
  const stagesKey = useStore((s) => s.xrayStagesKey);
  const busy = useStore((s) => s.xrayBusy);
  const meters = useStore((s) => s.meters);
  const fileInfo = useStore((s) => s.fileInfo);
  const params = useStore((s) => s.params);
  const processorEnabled = useStore((s) => s.processorEnabled);
  const activeTrackId = useStore((s) => s.activeTrackId);
  const albumMode = useStore((s) => s.albumMode);
  const albumCalibrating = useStore((s) => s.albumCalibrating);
  const wasmReady = useStore((s) => s.wasmReady);
  const setups = useStore((s) => s.xraySetups);
  const activeSetupId = useStore((s) => s.xrayActiveSetupId);
  const setXrayOpen = useStore((s) => s.setXrayOpen);
  const deleteXraySetup = useStore((s) => s.deleteXraySetup);

  const {
    computeXrayStages, xraySettingsKey, applyXraySetup, saveXraySetup, processAudio,
  } = useAudioEngine();

  const [hZoom, setHZoom] = useState(1);
  const [laneModes, setLaneModes] = useState<Record<string, LaneMode>>({});
  const [vZooms, setVZooms] = useState<Record<string, number>>({});
  const [settingsFor, setSettingsFor] = useState<string | null>(null);
  const [saveName, setSaveName] = useState('');

  // Recompute stages whenever the settings/track no longer match the
  // capture. Debounced so knob drags don't queue a run per tick; also
  // re-checked when a run finishes, in case settings moved meanwhile.
  useEffect(() => {
    if (!wasmReady || busy) return;
    if (stagesKey === xraySettingsKey()) return;
    const timer = setTimeout(() => computeXrayStages(), 400);
    return () => clearTimeout(timer);
  }, [wasmReady, busy, params, processorEnabled, activeTrackId, stagesKey]);

  const processAndListen = async () => {
    setXrayOpen(false);
    const s = useStore.getState();
    if (s.paramsDirty || !s.processedBuffer) {
      await processAudio();
    }
    if (useStore.getState().processedBuffer) {
      useStore.getState().setListenMode('processed');
    }
  };

  const handleSave = () => {
    const name = saveName.trim() || `Setup ${setups.length + 1}`;
    saveXraySetup(name);
    setSaveName('');
  };

  const SettingsPanel = settingsFor ? SETTINGS_PANELS[settingsFor] : null;

  return (
    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', p: 2, gap: 1.5 }}>
      {/* Header bar */}
      <Paper sx={{ p: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
        <Tooltip title="Back to the studio (no processing)">
          <IconButton size="small" onClick={() => setXrayOpen(false)}>
            <ArrowBackIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <TroubleshootIcon sx={{ fontSize: 18, color: 'primary.main' }} />
        <Typography variant="h6" sx={{ fontSize: '0.9rem' }} noWrap>
          Chain X-Ray{fileInfo ? ` — ${fileInfo.name}` : ''}
        </Typography>
        {(busy || albumCalibrating) && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <CircularProgress size={13} />
            <Typography variant="body2" sx={{ fontSize: '0.68rem', color: 'text.secondary' }}>
              {albumCalibrating ?? 'Processing chain…'}
            </Typography>
          </Box>
        )}
        <Box sx={{ flex: 1 }} />
        <Tooltip title="Horizontal zoom out">
          <span>
            <IconButton size="small" disabled={hZoom <= 1} onClick={() => setHZoom(Math.max(1, hZoom / 2))}>
              <ZoomOutIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Typography variant="body2" sx={{ fontSize: '0.7rem', color: 'text.secondary', minWidth: 26, textAlign: 'center' }}>
          ×{hZoom}
        </Typography>
        <Tooltip title="Horizontal zoom in">
          <span>
            <IconButton size="small" disabled={hZoom >= 16} onClick={() => setHZoom(Math.min(16, hZoom * 2))}>
              <ZoomInIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Apply the current settings, go back to the studio and listen to the result">
          <Button
            variant="contained"
            size="small"
            startIcon={<PlayArrowIcon sx={{ fontSize: 16 }} />}
            onClick={processAndListen}
            sx={{ fontSize: '0.72rem', ml: 1 }}
          >
            Process & listen
          </Button>
        </Tooltip>
      </Paper>

      {/* Setups bar */}
      <Paper sx={{ p: 1, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <TextField
          size="small"
          placeholder="Setup name"
          value={saveName}
          onChange={(e) => setSaveName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
          sx={{ width: 150, '& input': { fontSize: '0.72rem', py: 0.6 } }}
        />
        <Tooltip title="Save the current settings (and their lanes) as a setup">
          <Button size="small" variant="outlined" startIcon={<SaveIcon sx={{ fontSize: 14 }} />} onClick={handleSave} sx={{ fontSize: '0.7rem' }}>
            Save setup
          </Button>
        </Tooltip>
        <Box sx={{ width: 8 }} />
        {setups.map((setup) => (
          <Tooltip
            key={setup.id}
            title={setup.stages
              ? 'Apply this setup — the lanes flip to it instantly, so click back and forth to compare setups visually'
              : 'Apply this setup — the lanes recompute to show it'}
          >
            <Chip
              label={setup.name}
              size="small"
              color={setup.id === activeSetupId ? 'primary' : 'default'}
              variant={setup.id === activeSetupId ? 'filled' : 'outlined'}
              onClick={() => applyXraySetup(setup.id)}
              onDelete={() => deleteXraySetup(setup.id)}
              sx={{ fontSize: '0.68rem', height: 22 }}
            />
          </Tooltip>
        ))}
        {setups.length === 0 ? (
          <Typography variant="body2" sx={{ fontSize: '0.68rem', color: 'text.secondary' }}>
            No setups saved yet — tweak the chain, then save snapshots to compare them.
          </Typography>
        ) : (
          <>
            <Box sx={{ flex: 1 }} />
            <Typography variant="body2" sx={{ fontSize: '0.68rem', color: 'text.secondary' }}>
              Click setups back and forth — the lanes flip instantly, so differences pop out.
            </Typography>
          </>
        )}
      </Paper>

      {/* Lanes */}
      <Paper sx={{ flex: 1, overflow: 'auto', p: 1.5 }}>
        {!stages ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 6, justifyContent: 'center' }}>
            <CircularProgress size={18} />
            <Typography variant="body2" sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>
              Processing chain stages…
            </Typography>
          </Box>
        ) : (
          <Box sx={{ minWidth: `${100 * Math.min(hZoom, 16)}%`, display: 'flex', flexDirection: 'column', gap: 1, opacity: busy ? 0.55 : 1, transition: 'opacity 0.2s' }}>
            {stages.map((stage) => {
              const gr = meters[stage.name];
              const hot = stage.peak_db >= -0.05;
              const mode = laneModes[stage.name] ?? 'wave';
              const vZoom = vZooms[stage.name] ?? 1;
              const CanEdit = SETTINGS_PANELS[stage.name] !== undefined;
              return (
                <Box key={stage.name} sx={{ display: 'flex', gap: 1 }}>
                  {/* Label column, sticky so it stays visible when zoomed */}
                  <Box sx={{
                    width: 190, flexShrink: 0, position: 'sticky', left: 0, zIndex: 2,
                    bgcolor: 'background.paper', display: 'flex', flexDirection: 'column', gap: 0.25,
                    pr: 0.5,
                  }}>
                    <Typography variant="body2" sx={{ fontSize: '0.75rem', fontWeight: 600 }} noWrap>
                      {stage.name}
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{ fontSize: '0.65rem', color: hot ? 'error.main' : 'text.secondary', fontWeight: hot ? 600 : 400 }}
                    >
                      Peak {stage.peak_db.toFixed(1)} dB · RMS {stage.rms_db.toFixed(1)} dB
                      {gr && ` · GR ${gr.max_gr_db.toFixed(1)} dB`}
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                      <ToggleButtonGroup
                        size="small"
                        exclusive
                        value={mode}
                        onChange={(_, v) => v && setLaneModes({ ...laneModes, [stage.name]: v })}
                        sx={{ '& .MuiToggleButton-root': { py: 0, px: 0.75 } }}
                      >
                        <ToggleButton value="wave">
                          <Tooltip title="Waveform (dynamics)"><ShowChartIcon sx={{ fontSize: 14 }} /></Tooltip>
                        </ToggleButton>
                        <ToggleButton value="spec">
                          <Tooltip title="Spectrogram (tone: 30 Hz bottom → 20 kHz top)"><BlurLinearIcon sx={{ fontSize: 14 }} /></Tooltip>
                        </ToggleButton>
                      </ToggleButtonGroup>
                      <Tooltip title="Taller lane (vertical zoom in)">
                        <span>
                          <IconButton size="small" disabled={vZoom >= 8} onClick={() => setVZooms({ ...vZooms, [stage.name]: vZoom * 2 })}>
                            <UnfoldMoreIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                        </span>
                      </Tooltip>
                      <Tooltip title="Shorter lane (vertical zoom out)">
                        <span>
                          <IconButton size="small" disabled={vZoom <= 1} onClick={() => setVZooms({ ...vZooms, [stage.name]: vZoom / 2 })}>
                            <UnfoldLessIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                        </span>
                      </Tooltip>
                      {vZoom > 1 && (
                        <Typography variant="body2" sx={{ fontSize: '0.62rem', color: 'text.secondary' }}>×{vZoom}</Typography>
                      )}
                      {CanEdit && (
                        <Tooltip title={`Edit ${stage.name} settings — changes ripple through all following lanes`}>
                          <IconButton size="small" color={settingsFor === stage.name ? 'primary' : 'default'} onClick={() => setSettingsFor(stage.name)}>
                            <TuneIcon sx={{ fontSize: 15 }} />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Box>
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <StageLane stage={stage} mode={mode} hZoom={hZoom} height={LANE_HEIGHT * vZoom} />
                  </Box>
                </Box>
              );
            })}
            <Typography variant="body2" sx={{ fontSize: '0.65rem', color: 'text.secondary', mt: 0.5 }}>
              Top lane is the unprocessed input; each following lane is the signal after that
              stage. Waveform: red columns reach 0 dBFS; lane edges are 0 dBFS.
              Spectrogram: 30 Hz at the bottom, 20 kHz at the top.
            </Typography>
          </Box>
        )}
      </Paper>

      {/* Per-stage settings drawer */}
      <Drawer
        anchor="right"
        open={!!SettingsPanel}
        onClose={() => setSettingsFor(null)}
        PaperProps={{ sx: { width: 480, maxWidth: '90vw', p: 1.5, bgcolor: 'background.default' } }}
      >
        {SettingsPanel && (
          <SettingsPanel expanded onExpandToggle={() => setSettingsFor(null)} />
        )}
      </Drawer>
    </Box>
  );
};
