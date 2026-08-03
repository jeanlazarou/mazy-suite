import React, { useState, useMemo } from 'react';
import { Box, Paper, Typography, TextField, List, ListItemButton, ListItemText, IconButton, Tabs, Tab, Button, Dialog, DialogTitle, DialogContent, DialogActions, Tooltip } from '@mui/material';
import LibraryMusicIcon from '@mui/icons-material/LibraryMusic';
import SaveIcon from '@mui/icons-material/Save';
import DeleteIcon from '@mui/icons-material/Delete';
import { useAudioEngine } from '../../hooks/useAudioEngine';
import { useStore } from '../../store/store';
import { saveCustomPreset, deleteCustomPreset, type CustomPreset } from '../../audio/customPresets';

export const PresetBrowser: React.FC = () => {
  const { applyPreset, applyCustomPreset, processAudio } = useAudioEngine();
  const presets = useStore((s) => s.presets);
  const customPresets = useStore((s) => s.customPresets);
  const setCustomPresets = useStore((s) => s.setCustomPresets);
  const activePreset = useStore((s) => s.activePreset);
  const [tab, setTab] = useState(0);
  const [search, setSearch] = useState('');
  const [saveOpen, setSaveOpen] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');

  const categories = ['all', 'genre', 'usecase'];

  const filtered = useMemo(() => {
    // Exclude target presets — device targeting is handled by Analysis & Recommendations
    let list = [...presets.filter(p => p.category !== 'target'), ...customPresets];
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
  }, [presets, customPresets, tab, search]);

  const handleApply = async (name: string) => {
    // Custom presets only exist in the browser — the engine can't look
    // them up by name the way it does built-ins, so their params are
    // replayed directly instead of asking the engine to resolve `name`.
    const custom = customPresets.find((p) => p.name === name);
    if (custom) {
      await applyCustomPreset(custom);
    } else {
      await applyPreset(name);
    }
    await processAudio();
  };

  const handleSave = () => {
    const name = newPresetName.trim();
    if (!name) return;
    const preset: CustomPreset = {
      name,
      category: 'custom',
      description: 'Custom preset',
      tags: ['custom'],
      processors: useStore.getState().params,
    };
    setCustomPresets(saveCustomPreset(preset));
    setSaveOpen(false);
    setNewPresetName('');
  };

  const handleDelete = (e: React.MouseEvent, name: string) => {
    e.stopPropagation(); // don't trigger the row's onClick (apply)
    setCustomPresets(deleteCustomPreset(name));
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
          <Tooltip key={p.name} title={p.description} placement="right" enterDelay={400}>
            <ListItemButton
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
              {p.category === 'custom' && (
                <IconButton size="small" onClick={(e) => handleDelete(e, p.name)} sx={{ ml: 0.5 }}>
                  <DeleteIcon sx={{ fontSize: 16 }} />
                </IconButton>
              )}
            </ListItemButton>
          </Tooltip>
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
