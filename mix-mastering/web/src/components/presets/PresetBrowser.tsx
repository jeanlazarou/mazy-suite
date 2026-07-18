import React, { useState, useMemo } from 'react';
import { Box, Paper, Typography, TextField, Chip, List, ListItemButton, ListItemText, Tabs, Tab, Button, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';
import LibraryMusicIcon from '@mui/icons-material/LibraryMusic';
import SaveIcon from '@mui/icons-material/Save';
import { useAudioEngine } from '../../hooks/useAudioEngine';
import { useStore } from '../../store/store';

export const PresetBrowser: React.FC = () => {
  const { applyPreset, processAudio } = useAudioEngine();
  const presets = useStore((s) => s.presets);
  const activePreset = useStore((s) => s.activePreset);
  const [tab, setTab] = useState(0);
  const [search, setSearch] = useState('');
  const [saveOpen, setSaveOpen] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');

  const categories = ['all', 'genre', 'usecase'];

  const filtered = useMemo(() => {
    // Exclude target presets — device targeting is handled by Analysis & Recommendations
    let list = presets.filter(p => p.category !== 'target');
    if (tab > 0) {
      list = list.filter(p => p.category === categories[tab]);
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.tags.some(t => t.toLowerCase().includes(q))
      );
    }
    return list;
  }, [presets, tab, search]);

  const handleApply = async (name: string) => {
    await applyPreset(name);
    await processAudio();
  };

  const handleSave = () => {
    if (!newPresetName.trim()) return;
    // Save to IndexedDB in production
    const params = useStore.getState().params;
    const preset = {
      name: newPresetName,
      category: 'custom',
      description: 'Custom preset',
      tags: ['custom'],
      processors: params,
    };
    // Store in IndexedDB
    try {
      const tx = indexedDB.open('audiomaster-presets', 1);
      tx.onupgradeneeded = () => {
        tx.result.createObjectStore('presets', { keyPath: 'name' });
      };
      tx.onsuccess = () => {
        const db = tx.result;
        const store = db.transaction('presets', 'readwrite').objectStore('presets');
        store.put(preset);
      };
    } catch (e) {
      console.warn('IndexedDB save failed:', e);
    }
    setSaveOpen(false);
    setNewPresetName('');
  };

  return (
    <Paper sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <LibraryMusicIcon sx={{ fontSize: 18, color: 'primary.main' }} />
          <Typography variant="h6" sx={{ fontSize: '0.9rem' }}>Presets</Typography>
        </Box>
        <Button size="small" startIcon={<SaveIcon />} onClick={() => setSaveOpen(true)} sx={{ fontSize: '0.7rem' }}>
          Save
        </Button>
      </Box>

      <TextField
        size="small"
        placeholder="Search presets..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        sx={{ mb: 1, '& input': { fontSize: '0.8rem', py: 0.75 } }}
        fullWidth
      />

      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        variant="fullWidth"
        sx={{ minHeight: 28, mb: 1, '& .MuiTab-root': { minHeight: 28, fontSize: '0.7rem', py: 0 } }}
      >
        <Tab label="All" />
        <Tab label="Genre" />
        <Tab label="Use" />
      </Tabs>

      <List dense sx={{ flex: 1, overflow: 'auto', mx: -1 }}>
        {filtered.map((p) => (
          <ListItemButton
            key={p.name}
            selected={activePreset === p.name}
            onClick={() => handleApply(p.name)}
            sx={{ borderRadius: 1, mx: 1, py: 0.5 }}
          >
            <ListItemText
              primary={p.name}
              secondary={p.description}
              primaryTypographyProps={{ fontSize: '0.8rem', fontWeight: 500 }}
              secondaryTypographyProps={{ fontSize: '0.65rem', noWrap: true }}
            />
          </ListItemButton>
        ))}
        {filtered.length === 0 && (
          <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center', py: 3, fontSize: '0.8rem' }}>
            No presets found
          </Typography>
        )}
      </List>

      <Dialog open={saveOpen} onClose={() => setSaveOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontSize: '1rem' }}>Save Preset</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="Preset Name"
            value={newPresetName}
            onChange={(e) => setNewPresetName(e.target.value)}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSaveOpen(false)}>Cancel</Button>
          <Button onClick={handleSave} variant="contained">Save</Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
};
