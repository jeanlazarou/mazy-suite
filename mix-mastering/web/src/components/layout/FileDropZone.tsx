import React, { useCallback, useState } from 'react';
import { Box, Typography, Paper } from '@mui/material';
import AudioFileIcon from '@mui/icons-material/AudioFile';
import AlbumIcon from '@mui/icons-material/Album';
import { openTrackFiles, startAlbumFiles, pickAudioFiles } from '../../audio/loadFiles';

// Start screen: the user says up front whether this is one track or an
// album — the album workflow (release → tracks → balance) is different
// enough that it must not just happen because a second file was opened.
export const FileDropZone: React.FC = () => (
  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2.5, width: '100%', maxWidth: 860 }}>
    <Typography variant="h6" sx={{ fontSize: '1.05rem' }}>What are you mastering?</Typography>
    <Box sx={{ display: 'flex', gap: 2.5, width: '100%', flexWrap: 'wrap' }}>
      <StartCard
        icon={<AudioFileIcon sx={{ fontSize: 44, color: 'primary.main' }} />}
        title="Master a track"
        lines={[
          'One song, on its own.',
          'Say what it is and where it will be heard; the preview updates as you go.',
        ]}
        cta="Drop an audio file here or click to browse"
        multiple={false}
        onFiles={openTrackFiles}
      />
      <StartCard
        icon={<AlbumIcon sx={{ fontSize: 44, color: 'primary.main' }} />}
        title="Master an album"
        lines={[
          'Several songs that belong together.',
          'Choose the release, get each track right, then balance the album as a whole.',
        ]}
        cta="Drop the album's files here or click to browse"
        multiple
        onFiles={startAlbumFiles}
      />
    </Box>
    <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
      WAV, MP3, FLAC, OGG, AIFF
    </Typography>
  </Box>
);

const StartCard: React.FC<{
  icon: React.ReactNode;
  title: string;
  lines: string[];
  cta: string;
  multiple: boolean;
  onFiles: (files: File[]) => void;
}> = ({ icon, title, lines, cta, multiple, onFiles }) => {
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length) onFiles(Array.from(e.dataTransfer.files));
  }, [onFiles]);

  return (
    <Paper
      role="button"
      aria-label={title}
      onClick={() => pickAudioFiles(multiple, onFiles)}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      sx={{
        flex: '1 1 300px',
        p: 4,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        gap: 1.25,
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
      {icon}
      <Typography variant="h6" sx={{ fontSize: '1rem' }}>{title}</Typography>
      {lines.map((l) => (
        <Typography key={l} variant="body2" sx={{ color: 'text.secondary', fontSize: '0.8rem' }}>{l}</Typography>
      ))}
      <Typography variant="body2" sx={{ mt: 1, fontSize: '0.75rem', color: 'primary.light' }}>{cta}</Typography>
    </Paper>
  );
};
