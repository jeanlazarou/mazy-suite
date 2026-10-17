import React, { useEffect, useMemo } from 'react';
import {
  Box, Paper, Typography, Switch, Button, IconButton, Tooltip, Chip, CircularProgress,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import RemoveIcon from '@mui/icons-material/Remove';
import AddIcon from '@mui/icons-material/Add';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import { useStore, type AppState, type AlbumTrack } from '../../store/store';
import type { AlbumLevels } from '../../hooks/useAudioEngine';
import { useAudioEngine, albumTargetLUFS, albumTrackGainDB, albumSettingsReady } from '../../hooks/useAudioEngine';
import { stopPlayback } from '../../hooks/usePlayback';
import { stopTransition } from '../../audio/transition';
import type { AnalysisResult } from '../../wasm/engine';
import { Caption } from '../master/MasterPanel';

// Level scale of the bars, relative to the album target (dB).
const SCALE_MIN = -12;
const SCALE_MAX = 3;
const NUDGE_STEP = 0.5;
const NUDGE_MAX = 6;
// A track's tone stands out when a band differs this much from the
// album's median (dB). Songs vary naturally; smaller differences aren't
// worth a flag.
const TONE_FLAG_DB = 3;

// Step 3: the album as a whole — how loud each track ends up next to the
// others, whose tone stands out, and how one track flows into the next.
// The goal is intended levels, not equal ones: a ballad may stay quieter
// than the single.
export const BalancePanel: React.FC = () => {
  const { exportAlbum, calibrateAlbum, previewTransition } = useAudioEngine();
  const tracks = useStore((s) => s.tracks);
  const albumCal = useStore((s) => s.albumCal);
  const albumPostLufs = useStore((s) => s.albumPostLufs);
  const albumMode = useStore((s) => s.albumMode);
  const setAlbumMode = useStore((s) => s.setAlbumMode);
  const isProcessing = useStore((s) => s.isProcessing);
  const transitionPlaying = useStore((s) => s.transitionPlaying);
  const ready = useStore(albumSettingsReady);
  const target = useStore(albumTargetLUFS);
  const activeTrackId = useStore((s) => s.activeTrackId);
  const recipeOptions = useStore((s) => s.recipeOptions);
  const choice = useStore((s) => s.choice);
  const levels: AlbumLevels = useMemo(
    () => ({ albumCal, albumMode, albumPostLufs, recipeOptions, choice }),
    [albumCal, albumMode, albumPostLufs, recipeOptions, choice]);

  // Measure the album when this view opens on stale numbers (the preview
  // keeps them fresh as settings change).
  const calibrated = tracks.length > 0 && tracks.every((t) => albumCal[t.id]) && albumPostLufs !== null;
  useEffect(() => {
    if (ready && !calibrated && !isProcessing) calibrateAlbum();
  }, [ready, calibrated, isProcessing]);

  const tone = toneOutliers(tracks, albumCal);

  return (
    <Paper sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        <Typography variant="h6" sx={{ fontSize: '0.9rem' }}>Album balance</Typography>
        <Typography variant="body2" sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>
          Target {target} LUFS {albumMode ? 'for the whole album' : 'for each track'}
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Tooltip title={albumMode
          ? 'On: one shared loudness offset for the whole album, so the level differences between tracks stay as mixed.'
          : 'Off: every track is brought to the target on its own — level differences between tracks disappear.'}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Typography variant="body2" sx={{ fontSize: '0.72rem' }}>Keep the level differences between tracks</Typography>
            <Switch size="small" checked={albumMode} onChange={(_, v) => setAlbumMode(v)} />
          </Box>
        </Tooltip>
        <Tooltip title="Master every track with its settings and level, and download them all as one zip">
          <span>
            <Button
              size="small"
              variant="contained"
              startIcon={<DownloadIcon sx={{ fontSize: 14 }} />}
              disabled={isProcessing || !ready}
              onClick={exportAlbum}
              sx={{ fontSize: '0.72rem' }}
            >
              Export album
            </Button>
          </span>
        </Tooltip>
      </Box>

      <Caption>
        Listen across the album: nothing should jump out by accident. Quieter tracks staying quieter is
        fine when it's meant — a ballad after the single. Nudge a level, or go back to a track to fix
        its tone, then play the transitions.
      </Caption>

      {!ready ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 3 }}>
          <CircularProgress size={14} />
          <Caption>Waiting for every track's settings (tracks are still being analyzed)…</Caption>
        </Box>
      ) : (
        <Box>
          {/* Scale header */}
          <Box sx={{ display: 'grid', gridTemplateColumns: COLUMNS, gap: 1, alignItems: 'end', px: 1, mb: 0.5 }}>
            <span /><span />
            <Box sx={{ position: 'relative', height: 14 }}>
              {[SCALE_MIN, -6, 0].map((v) => (
                <Typography key={v} sx={{
                  position: 'absolute', left: `${pos(v)}%`, transform: 'translateX(-50%)',
                  fontSize: '0.6rem', color: v === 0 ? 'primary.light' : 'text.secondary',
                }}>
                  {v === 0 ? 'target' : `${v} dB`}
                </Typography>
              ))}
            </Box>
            <Typography sx={{ fontSize: '0.6rem', color: 'text.secondary', textAlign: 'center' }}>Level nudge</Typography>
            <Typography sx={{ fontSize: '0.6rem', color: 'text.secondary' }}>Tone vs. the album</Typography>
          </Box>

          {tracks.map((t, i) => (
            <React.Fragment key={t.id}>
              <TrackRow
                t={t} i={i} last={i === tracks.length - 1} levels={levels}
                active={t.id === activeTrackId} toneFlags={tone[t.id] ?? []}
              />
              {i < tracks.length - 1 && (
                <Box sx={{ display: 'flex', justifyContent: 'center', my: 0.25 }}>
                  <Button
                    size="small"
                    disabled={isProcessing && transitionPlaying !== i}
                    onClick={() => {
                      if (transitionPlaying === i) {
                        stopTransition();
                        useStore.getState().setTransitionPlaying(null);
                      } else {
                        previewTransition(i);
                      }
                    }}
                    startIcon={transitionPlaying === i ? <StopIcon sx={{ fontSize: 14 }} /> : <PlayArrowIcon sx={{ fontSize: 14 }} />}
                    sx={{ fontSize: '0.65rem', textTransform: 'none', py: 0, color: 'text.secondary' }}
                  >
                    {transitionPlaying === i ? 'Stop' : `Transition ${i + 1} → ${i + 2}`}
                  </Button>
                </Box>
              )}
            </React.Fragment>
          ))}
        </Box>
      )}
    </Paper>
  );
};

const COLUMNS = '44px minmax(140px, 1.2fr) minmax(200px, 2fr) 120px minmax(160px, 1fr)';

const pos = (rel: number) =>
  ((Math.max(SCALE_MIN, Math.min(SCALE_MAX, rel)) - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)) * 100;

const TrackRow: React.FC<{
  t: AlbumTrack; i: number; last: boolean; levels: AlbumLevels; active: boolean; toneFlags: string[];
}> = ({ t, i, last, levels, active, toneFlags }) => {
  const cal = levels.albumCal[t.id];
  const gain = albumTrackGainDB(levels, t);
  const target = albumTargetLUFS(levels);
  // Estimated mastered loudness: measured chain output plus its gain (the
  // limiter can take a little off on loud destinations).
  const lufs = cal && gain !== null ? cal.lufs + gain : null;
  const rel = lufs !== null ? lufs - target : null;
  const nudge = t.settings.nudgeDB;

  const setNudge = (v: number) => {
    const clamped = Math.max(-NUDGE_MAX, Math.min(NUDGE_MAX, Math.round(v / NUDGE_STEP) * NUDGE_STEP));
    useStore.getState().setTrackSettings(t.id, { nudgeDB: clamped });
  };
  const openTrack = () => {
    stopPlayback();
    useStore.getState().setActiveTrack(t.id);
    useStore.getState().setAlbumStep('tracks');
  };

  return (
    <Box sx={{
      display: 'grid', gridTemplateColumns: COLUMNS, gap: 1, alignItems: 'center',
      px: 1, py: 0.6, borderRadius: 1,
      bgcolor: active ? 'rgba(108,99,255,0.1)' : 'rgba(255,255,255,0.02)',
    }}>
      {/* Play order */}
      <Box sx={{ display: 'flex', alignItems: 'center' }}>
        <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary', width: 14 }}>{i + 1}</Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column' }}>
          <IconButton size="small" sx={{ p: 0 }} disabled={i === 0} aria-label={`Move ${t.name} up`}
            onClick={() => useStore.getState().moveTrack(t.id, -1)}>
            <ArrowUpwardIcon sx={{ fontSize: 12 }} />
          </IconButton>
          <IconButton size="small" sx={{ p: 0 }} disabled={last} aria-label={`Move ${t.name} down`}
            onClick={() => useStore.getState().moveTrack(t.id, 1)}>
            <ArrowDownwardIcon sx={{ fontSize: 12 }} />
          </IconButton>
        </Box>
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography noWrap sx={{ fontSize: '0.75rem', fontWeight: active ? 600 : 400 }}>{t.name}</Typography>
        <Typography sx={{ fontSize: '0.62rem', color: 'text.secondary' }}>
          {lufs !== null ? `≈ ${lufs.toFixed(1)} LUFS (${rel! >= 0 ? '+' : ''}${rel!.toFixed(1)} dB)` : 'measuring…'}
        </Typography>
      </Box>

      {/* Level bar relative to the target */}
      <Box sx={{ position: 'relative', height: 14, borderRadius: 1, bgcolor: 'rgba(255,255,255,0.05)' }}>
        {rel !== null && (
          <Box sx={{
            position: 'absolute', left: 0, top: 2, bottom: 2, width: `${pos(rel)}%`, borderRadius: 1,
            bgcolor: Math.abs(rel) > 3 ? 'warning.main' : 'primary.main', opacity: 0.8,
            transition: 'width 0.2s',
          }} />
        )}
        <Box sx={{ position: 'absolute', left: `${pos(0)}%`, top: -2, bottom: -2, width: 2, bgcolor: 'primary.light' }} />
      </Box>

      {/* Nudge */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.25 }}>
        <IconButton size="small" aria-label={`Lower ${t.name}`} onClick={() => setNudge(nudge - NUDGE_STEP)} disabled={nudge <= -NUDGE_MAX}>
          <RemoveIcon sx={{ fontSize: 14 }} />
        </IconButton>
        <Tooltip title="Double-click to reset">
          <Typography
            onDoubleClick={() => setNudge(0)}
            sx={{ fontSize: '0.7rem', width: 46, textAlign: 'center', fontWeight: nudge !== 0 ? 600 : 400, cursor: 'default' }}
          >
            {nudge === 0 ? '0 dB' : `${nudge > 0 ? '+' : ''}${nudge.toFixed(1)}`}
          </Typography>
        </Tooltip>
        <IconButton size="small" aria-label={`Raise ${t.name}`} onClick={() => setNudge(nudge + NUDGE_STEP)} disabled={nudge >= NUDGE_MAX}>
          <AddIcon sx={{ fontSize: 14 }} />
        </IconButton>
      </Box>

      {/* Tone */}
      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', alignItems: 'center' }}>
        {!cal ? null : toneFlags.length === 0 ? (
          <Typography sx={{ fontSize: '0.65rem', color: 'text.secondary' }}>in line</Typography>
        ) : (
          <>
            {toneFlags.map((f) => (
              <Chip key={f} label={f} size="small" color="warning" variant="outlined" sx={{ height: 18, fontSize: '0.6rem' }} />
            ))}
            <Tooltip title="Open this track in step 2 to adjust it">
              <IconButton size="small" onClick={openTrack} aria-label={`Fix ${t.name}`}>
                <ArrowForwardIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </Tooltip>
          </>
        )}
      </Box>
    </Box>
  );
};

// Mean power (dB) of the spectrum between lo and hi Hz.
function bandDB(a: AnalysisResult, lo: number, hi: number): number | null {
  const { frequencies, magnitudes } = a.spectrum ?? {};
  if (!frequencies || !magnitudes) return null;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < frequencies.length; i++) {
    if (frequencies[i] >= lo && frequencies[i] < hi) {
      sum += Math.pow(10, magnitudes[i] / 10);
      n++;
    }
  }
  return n > 0 && sum > 0 ? 10 * Math.log10(sum / n) : null;
}

function median(v: number[]): number {
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Tracks whose mastered tone differs from the rest of the album: bass and
// top end, each relative to the track's own mids (so loudness doesn't
// count), compared with the album's median.
function toneOutliers(tracks: AlbumTrack[], cal: AppState['albumCal']): Record<string, string[]> {
  const shape: Record<string, { low: number; high: number }> = {};
  for (const t of tracks) {
    const a = cal[t.id]?.analysis;
    if (!a) continue;
    const mid = bandDB(a, 300, 3000);
    const low = bandDB(a, 30, 150);
    const high = bandDB(a, 4000, 16000);
    if (mid === null || low === null || high === null) continue;
    shape[t.id] = { low: low - mid, high: high - mid };
  }
  const ids = Object.keys(shape);
  if (ids.length < 3) return {}; // no meaningful "rest of the album"
  const lowMed = median(ids.map((id) => shape[id].low));
  const highMed = median(ids.map((id) => shape[id].high));
  const out: Record<string, string[]> = {};
  for (const id of ids) {
    const flags: string[] = [];
    const dl = shape[id].low - lowMed;
    const dh = shape[id].high - highMed;
    if (dh >= TONE_FLAG_DB) flags.push('brighter than the rest');
    if (dh <= -TONE_FLAG_DB) flags.push('darker than the rest');
    if (dl >= TONE_FLAG_DB) flags.push('more bass');
    if (dl <= -TONE_FLAG_DB) flags.push('less bass');
    out[id] = flags;
  }
  return out;
}
