import React from 'react';
import {
  Box, Paper, Typography, Switch, Tooltip, CircularProgress, Button,
  Table, TableBody, TableCell, TableHead, TableRow,
} from '@mui/material';
import AlbumIcon from '@mui/icons-material/Album';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import DownloadIcon from '@mui/icons-material/Download';
import CheckIcon from '@mui/icons-material/Check';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { useStore } from '../../store/store';
import { useAudioEngine } from '../../hooks/useAudioEngine';

const fmt = (v: number | undefined, digits = 1, suffix = '') =>
  v === undefined || Number.isNaN(v) ? '—' : `${v.toFixed(digits)}${suffix}`;

const STEPS = [
  {
    label: 'Set the shared sound',
    tip: 'Pick a preset and/or "Apply to Album". Settings apply to every track of the album at once.',
  },
  {
    label: 'Audition tracks',
    tip: 'Click any track, Process, and A/B it against the original. Optional — listen to as many tracks as you like; nothing has to be repeated per track.',
  },
  {
    label: 'Export album',
    tip: '"Export album" masters all tracks with the current settings and downloads them as one zip.',
  },
];

// Workflow guide: highlights the suggested next step. Steps are advisory,
// not gates — everything stays clickable at all times.
const AlbumSteps: React.FC<{ current: number }> = ({ current }) => (
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1.25, flexWrap: 'wrap' }}>
    {STEPS.map((step, i) => {
      const n = i + 1;
      const done = n < current;
      const active = n === current;
      const color = done ? 'success.main' : active ? 'primary.main' : 'text.disabled';
      return (
        <React.Fragment key={step.label}>
          {i > 0 && <ArrowForwardIcon sx={{ fontSize: 12, color: 'text.disabled' }} />}
          <Tooltip title={step.tip}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6, cursor: 'default' }}>
              <Box sx={{
                width: 16, height: 16, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.6rem', fontWeight: 700,
                bgcolor: done ? 'rgba(74,222,128,0.15)' : active ? 'rgba(108,99,255,0.2)' : 'rgba(255,255,255,0.06)',
                color,
              }}>
                {done ? <CheckIcon sx={{ fontSize: 11 }} /> : n}
              </Box>
              <Typography variant="body2" sx={{ fontSize: '0.68rem', fontWeight: active ? 600 : 400, color }}>
                {step.label}
              </Typography>
            </Box>
          </Tooltip>
        </React.Fragment>
      );
    })}
  </Box>
);

const formatTime = (s: number) => {
  const min = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${min}:${sec.toString().padStart(2, '0')}`;
};

export const AlbumPanel: React.FC = () => {
  const { exportAlbum } = useAudioEngine();
  const isProcessing = useStore((s) => s.isProcessing);
  const tracks = useStore((s) => s.tracks);
  const activeTrackId = useStore((s) => s.activeTrackId);
  const setActiveTrack = useStore((s) => s.setActiveTrack);
  const albumMode = useStore((s) => s.albumMode);
  const setAlbumMode = useStore((s) => s.setAlbumMode);
  const albumLufs = useStore((s) => s.albumLufs);
  const albumPostLufs = useStore((s) => s.albumPostLufs);
  const albumCalibrating = useStore((s) => s.albumCalibrating);
  const params = useStore((s) => s.params);

  // Suggested next step for the workflow guide: settings first, then
  // audition (until the current settings have been processed), then export.
  const settingsTouched = useStore((s) => !!(s.activePreset || s.appliedTarget || s.paramsEdited));
  const auditionReady = useStore((s) => s.processedBuffer !== null && !s.paramsDirty);
  const currentStep = !settingsTouched ? 1 : auditionReady ? 3 : 2;

  const target = params['Loudness Normalizer']?.target_lufs ?? -14;
  const analyzedCount = tracks.filter((t) => t.analysis && t.blocks).length;
  const pending = analyzedCount < tracks.length;

  // Median track loudness, for outlier hints
  const lufsValues = tracks
    .map((t) => t.analysis?.loudness.integrated_lufs)
    .filter((v): v is number => v !== undefined)
    .sort((a, b) => a - b);
  const median = lufsValues.length
    ? lufsValues[Math.floor(lufsValues.length / 2)]
    : null;

  return (
    <Paper sx={{ p: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
        <AlbumIcon sx={{ fontSize: 18, color: 'primary.main' }} />
        <Typography variant="h6" sx={{ fontSize: '0.9rem' }}>
          Album — {tracks.length} tracks
        </Typography>
        {pending || albumCalibrating ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <CircularProgress size={12} />
            <Typography variant="body2" sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>
              {albumCalibrating ?? `Analyzing tracks… (${analyzedCount}/${tracks.length})`}
            </Typography>
          </Box>
        ) : albumLufs !== null && (
          <Typography variant="body2" sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>
            Album loudness {albumLufs.toFixed(1)} LUFS
            {albumMode && albumPostLufs !== null &&
              ` — with current settings ${albumPostLufs.toFixed(1)} LUFS → target ${target.toFixed(1)} (offset ${target - albumPostLufs >= 0 ? '+' : ''}${(target - albumPostLufs).toFixed(1)} dB, same for all tracks)`}
            {albumMode && albumPostLufs === null &&
              ` — target ${target.toFixed(1)} LUFS; offset is measured on first Process`}
          </Typography>
        )}
        <Box sx={{ flex: 1 }} />
        <Tooltip title="Album loudness mode: normalize with one shared offset from the album's integrated loudness, preserving the level differences between tracks. Off: each track is normalized to the target individually.">
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Typography variant="body2" sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>
              Album loudness
            </Typography>
            <Switch size="small" checked={albumMode} onChange={(_, v) => setAlbumMode(v)} />
          </Box>
        </Tooltip>
        <Tooltip title="Master every track with the current settings and download all of them as one zip">
          <span>
            <Button
              size="small"
              variant="outlined"
              startIcon={<DownloadIcon sx={{ fontSize: 14 }} />}
              disabled={isProcessing || pending}
              onClick={exportAlbum}
              sx={{ fontSize: '0.7rem', ml: 1 }}
            >
              Export album
            </Button>
          </span>
        </Tooltip>
      </Box>

      <Table size="small" sx={{ '& td, & th': { fontSize: '0.7rem', py: 0.4, px: 1, borderColor: 'rgba(255,255,255,0.06)' } }}>
        <TableHead>
          <TableRow>
            <TableCell>#</TableCell>
            <TableCell>Track</TableCell>
            <TableCell align="right">Length</TableCell>
            <TableCell align="right">LUFS</TableCell>
            <TableCell align="right">vs. album</TableCell>
            <TableCell align="right">True peak</TableCell>
            <TableCell align="right">DR</TableCell>
            <TableCell>Balance</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {tracks.map((t, i) => {
            const lufs = t.analysis?.loudness.integrated_lufs;
            const isOutlier = median !== null && lufs !== undefined && Math.abs(lufs - median) > 3;
            const active = t.id === activeTrackId;
            return (
              <TableRow
                key={t.id}
                hover
                onClick={() => setActiveTrack(t.id)}
                sx={{
                  cursor: 'pointer',
                  bgcolor: active ? 'rgba(108,99,255,0.12)' : undefined,
                  '& td': { fontWeight: active ? 600 : 400 },
                }}
              >
                <TableCell>{i + 1}</TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    {t.name}
                    {isOutlier && (
                      <Tooltip title={`Sits ${(lufs! - median!) >= 0 ? '+' : ''}${(lufs! - median!).toFixed(1)} dB relative to the album median — intentional?`}>
                        <WarningAmberIcon sx={{ fontSize: 14, color: 'warning.main' }} />
                      </Tooltip>
                    )}
                  </Box>
                </TableCell>
                <TableCell align="right">{formatTime(t.info.duration)}</TableCell>
                <TableCell align="right">{fmt(lufs)}</TableCell>
                <TableCell align="right">
                  {albumLufs !== null && lufs !== undefined
                    ? `${lufs - albumLufs >= 0 ? '+' : ''}${(lufs - albumLufs).toFixed(1)} dB`
                    : '—'}
                </TableCell>
                <TableCell align="right">{fmt(t.analysis?.loudness.true_peak_dbtp, 1, ' dBTP')}</TableCell>
                <TableCell align="right">{fmt(t.analysis?.dynamics.dynamic_range_db, 1, ' dB')}</TableCell>
                <TableCell>{t.analysis?.spectrum.spectral_balance ?? '—'}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <AlbumSteps current={currentStep} />
      <Typography variant="body2" sx={{ fontSize: '0.65rem', color: 'text.secondary', mt: 0.75 }}>
        Settings apply to the whole album — nothing is repeated per track.
        Table values describe the original audio.
      </Typography>
    </Paper>
  );
};
