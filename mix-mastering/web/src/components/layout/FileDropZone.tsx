import React, { useCallback, useState } from 'react';
import { Box, Typography, Paper } from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import { loadAudioFiles, openAudioFilePicker } from '../../audio/loadFiles';

export const FileDropZone: React.FC = () => {
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length) {
      loadAudioFiles(Array.from(e.dataTransfer.files));
    }
  }, []);

  return (
    <Paper
      onClick={openAudioFilePicker}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      sx={{
        p: 6,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
        cursor: 'pointer',
        border: '2px dashed',
        borderColor: dragOver ? 'primary.main' : 'rgba(255,255,255,0.1)',
        bgcolor: dragOver ? 'rgba(108,99,255,0.05)' : 'transparent',
        transition: 'all 0.2s',
        '&:hover': {
          borderColor: 'primary.light',
          bgcolor: 'rgba(108,99,255,0.03)',
        },
      }}
    >
      <CloudUploadIcon sx={{ fontSize: 48, color: 'text.secondary' }} />
      <Typography variant="h6" sx={{ fontSize: '1rem' }}>
        Drop audio file(s) here or click to browse
      </Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        Supports WAV, MP3, FLAC, OGG, AIFF — load several tracks to master an album
      </Typography>
    </Paper>
  );
};
