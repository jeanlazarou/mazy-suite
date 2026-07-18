import React from 'react';
import { Box, IconButton, Typography, ToggleButton, Button, LinearProgress, Tooltip, CircularProgress } from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import SkipPreviousIcon from '@mui/icons-material/SkipPrevious';
import DownloadIcon from '@mui/icons-material/Download';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import { usePlayback } from '../../hooks/usePlayback';
import { useAudioEngine } from '../../hooks/useAudioEngine';
import { useStore } from '../../store/store';
import { audioBufferToWavBlob } from '../../audio/context';
import { openAudioFilePicker } from '../../audio/loadFiles';

export const TransportBar: React.FC = () => {
  const { togglePlayback, seek, pause } = usePlayback();
  const { processAudio } = useAudioEngine();
  const isPlaying = useStore((s) => s.isPlaying);
  const playbackPosition = useStore((s) => s.playbackPosition);
  const fileInfo = useStore((s) => s.fileInfo);
  const listenMode = useStore((s) => s.listenMode);
  const setListenMode = useStore((s) => s.setListenMode);
  const isProcessing = useStore((s) => s.isProcessing);
  const paramsDirty = useStore((s) => s.paramsDirty);
  const processedBuffer = useStore((s) => s.processedBuffer);
  const loudnessMatch = useStore((s) => s.loudnessMatch);
  const setLoudnessMatch = useStore((s) => s.setLoudnessMatch);
  const matchGainDB = useStore((s) => s.matchGainDB);
  const originalLufs = useStore((s) => s.analysis?.loudness.integrated_lufs);
  const processedLufs = useStore((s) => s.processedAnalysis?.loudness.integrated_lufs);

  const handleOpenFile = () => {
    pause();
    openAudioFilePicker();
  };

  if (!fileInfo) return null;

  const formatTime = (s: number) => {
    const min = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${min}:${sec.toString().padStart(2, '0')}`;
  };

  const progress = fileInfo.duration > 0 ? (playbackPosition / fileInfo.duration) * 100 : 0;

  return (
    <Box sx={{ bgcolor: 'background.paper', border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        {/* File info */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 160 }}>
          <Tooltip title="Open another file">
            <IconButton size="small" onClick={handleOpenFile}>
              <FolderOpenIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.8rem' }} noWrap>
              {fileInfo.name}
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
              {fileInfo.sampleRate}Hz / {fileInfo.channels}ch / {formatTime(fileInfo.duration)}
            </Typography>
          </Box>
        </Box>

        {/* Transport controls */}
        <Tooltip title={isPlaying ? 'Pause' : 'Play'}>
          <IconButton onClick={togglePlayback} color="primary" size="small">
            {isPlaying ? <PauseIcon /> : <PlayArrowIcon />}
          </IconButton>
        </Tooltip>
        <Tooltip title="Back to start">
          <IconButton onClick={() => seek(0)} size="small">
            <SkipPreviousIcon />
          </IconButton>
        </Tooltip>

        {/* Timeline */}
        <Box sx={{ flex: 1, mx: 1 }}>
          <LinearProgress
            variant="determinate"
            value={progress}
            sx={{
              height: 6,
              borderRadius: 3,
              cursor: 'pointer',
              bgcolor: 'rgba(255,255,255,0.05)',
              '& .MuiLinearProgress-bar': { borderRadius: 3 },
            }}
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const pos = ((e.clientX - rect.left) / rect.width) * fileInfo.duration;
              seek(pos);
            }}
          />
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
            <Typography variant="body2" sx={{ fontSize: '0.65rem', color: 'text.secondary' }}>
              {formatTime(playbackPosition)}
            </Typography>
            <Typography variant="body2" sx={{ fontSize: '0.65rem', color: 'text.secondary' }}>
              {formatTime(fileInfo.duration)}
            </Typography>
          </Box>
        </Box>

        {/* A/B Toggle */}
        <Box sx={{ display: 'flex' }}>
          <Tooltip title={`Original${originalLufs !== undefined ? ` — ${originalLufs.toFixed(1)} LUFS` : ''}`}>
            <ToggleButton
              value="original"
              size="small"
              selected={listenMode === 'original'}
              onClick={() => setListenMode('original')}
              sx={{ px: 1.5, py: 0.25, fontSize: '0.7rem', borderTopRightRadius: 0, borderBottomRightRadius: 0 }}
            >
              {originalLufs !== undefined ? `A ${originalLufs.toFixed(1)}` : 'A'}
            </ToggleButton>
          </Tooltip>
          <Tooltip title={processedBuffer
            ? `Processed result${processedLufs !== undefined ? ` — ${processedLufs.toFixed(1)} LUFS` : ''}`
            : isProcessing ? 'Processing…' : 'No processed result for this track yet — press Process'}>
            <span>
              <ToggleButton
                value="processed"
                size="small"
                selected={listenMode === 'processed'}
                disabled={!processedBuffer}
                onClick={() => setListenMode('processed')}
                sx={{ px: 1.5, py: 0.25, fontSize: '0.7rem', borderTopLeftRadius: 0, borderBottomLeftRadius: 0, ml: '-1px' }}
              >
                {processedBuffer && processedLufs !== undefined ? `B ${processedLufs.toFixed(1)}` : 'B'}
              </ToggleButton>
            </span>
          </Tooltip>
        </Box>
        <Tooltip
          title={
            matchGainDB === null
              ? 'Loudness-matched A/B (process audio first)'
              : `Loudness-matched A/B: plays B at equal loudness (${matchGainDB >= 0 ? '+' : ''}${matchGainDB.toFixed(1)} dB trim)`
          }
        >
          <span>
            <ToggleButton
              value="match"
              size="small"
              selected={loudnessMatch}
              disabled={matchGainDB === null}
              onChange={() => setLoudnessMatch(!loudnessMatch)}
              sx={{ px: 1.5, py: 0.25, fontSize: '0.7rem' }}
            >
              {loudnessMatch && matchGainDB !== null
                ? `Match ${matchGainDB >= 0 ? '+' : ''}${matchGainDB.toFixed(1)} dB`
                : 'Match'}
            </ToggleButton>
          </span>
        </Tooltip>

        {/* Process / Analyze buttons */}
        <Tooltip title={!paramsDirty ? 'Settings unchanged — already processed' : 'Process audio through mastering chain'}>
          <span>
            <Button
              variant="contained"
              size="small"
              onClick={processAudio}
              disabled={isProcessing || !paramsDirty}
              sx={{ fontSize: '0.75rem', px: 2, minWidth: 100 }}
            >
              {isProcessing ? (
                <CircularProgress size={16} color="inherit" sx={{ mr: 0.75 }} />
              ) : null}
              {isProcessing ? 'Processing...' : 'Process'}
            </Button>
          </span>
        </Tooltip>
        <Tooltip title={processedBuffer ? 'Download processed audio as WAV' : 'Process audio first'}>
          <span>
            <IconButton
              size="small"
              disabled={!processedBuffer}
              onClick={() => {
                if (!processedBuffer || !fileInfo) return;
                const blob = audioBufferToWavBlob(processedBuffer);
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                const baseName = fileInfo.name.replace(/\.[^.]+$/, '');
                a.download = `${baseName}_mastered.wav`;
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              <DownloadIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </Box>
    </Box>
  );
};
