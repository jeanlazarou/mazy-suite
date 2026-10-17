import React, { useState } from 'react';
import {
  AppBar, Toolbar, Typography, Box, Chip, Button, Dialog, DialogTitle, DialogContent,
  DialogContentText, DialogActions,
} from '@mui/material';
import GraphicEqIcon from '@mui/icons-material/GraphicEq';
import AddIcon from '@mui/icons-material/Add';
import { useStore } from '../../store/store';
import { stopPlayback } from '../../hooks/usePlayback';

export const Header: React.FC = () => {
  const wasmReady = useStore((s) => s.wasmReady);
  const workspace = useStore((s) => s.workspace);
  const trackCount = useStore((s) => s.tracks.length);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const startOver = () => {
    setConfirmOpen(false);
    stopPlayback();
    useStore.getState().closeSession();
  };

  return (
    <AppBar position="static" sx={{ bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider' }}>
      <Toolbar variant="dense" sx={{ gap: 2 }}>
        <GraphicEqIcon sx={{ color: 'primary.main' }} />
        <Typography variant="h6" sx={{ fontSize: '1rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
          Audio Mastering Studio
        </Typography>
        {workspace && (
          <Chip
            label={workspace === 'album' ? `Album · ${trackCount} track${trackCount === 1 ? '' : 's'}` : 'Single track'}
            size="small"
            sx={{ fontSize: '0.7rem' }}
          />
        )}
        <Box sx={{ flex: 1 }} />
        {workspace && (
          <Button size="small" startIcon={<AddIcon />} onClick={() => setConfirmOpen(true)} sx={{ fontSize: '0.72rem' }}>
            New
          </Button>
        )}
        <Chip
          label={wasmReady ? 'Engine Ready' : 'Loading...'}
          size="small"
          color={wasmReady ? 'success' : 'default'}
          variant="outlined"
          sx={{ fontSize: '0.7rem' }}
        />
      </Toolbar>

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontSize: '1rem' }}>Start something new?</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ fontSize: '0.85rem' }}>
            {workspace === 'album'
              ? 'The album is closed. Export it first if you want to keep the mastered tracks.'
              : 'The track is closed. Download it first if you want to keep the mastered version.'}
            {' '}Your choices and saved presets stay.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
          <Button onClick={startOver} variant="contained">Start new</Button>
        </DialogActions>
      </Dialog>
    </AppBar>
  );
};
