import React from 'react';
import { AppBar, Toolbar, Typography, Box, Chip } from '@mui/material';
import GraphicEqIcon from '@mui/icons-material/GraphicEq';
import { useStore } from '../../store/store';

export const Header: React.FC = () => {
  const wasmReady = useStore((s) => s.wasmReady);

  return (
    <AppBar position="static" sx={{ bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider' }}>
      <Toolbar variant="dense" sx={{ gap: 2 }}>
        <GraphicEqIcon sx={{ color: 'primary.main' }} />
        <Typography variant="h6" sx={{ fontSize: '1rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
          Audio Mastering Studio
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Chip
          label={wasmReady ? 'Engine Ready' : 'Loading...'}
          size="small"
          color={wasmReady ? 'success' : 'default'}
          variant="outlined"
          sx={{ fontSize: '0.7rem' }}
        />
      </Toolbar>
    </AppBar>
  );
};
