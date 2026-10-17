import React, { useState } from 'react';
import {
  Box, Paper, Typography, Chip, Switch, Button, Divider, CircularProgress,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, Tooltip,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { useAudioEngine } from '../../hooks/useAudioEngine';
import { useStore } from '../../store/store';
import { saveCustomPreset, deleteCustomPreset, type CustomPreset } from '../../audio/customPresets';
import type { RecipeOption } from '../../wasm/engine';


// Track workspace: the one place where the sound is chosen. Three
// independent questions, each owning a different part of the chain (see
// pkg/recipe):
//   1. What is it?               → character (tone, compressor motion)
//   2. Where will it be heard?   → delivery (loudness, peaks, device tuning)
//   3. Fix problems?             → corrections from the analysis
// The choices combine — a rock song for a podcast keeps rock's tone and
// gets podcast loudness — and any change updates the preview by itself.
// The album screens reuse the pieces below (components/album).
export const MasterPanel: React.FC = () => {
  const options = useStore((s) => s.recipeOptions);
  const choice = useStore((s) => s.choice);
  const setChoice = useStore((s) => s.setChoice);
  const fromChoice = useStore((s) => s.customPreset === null);
  const style = options?.styles.find((o) => o.id === choice.style);

  return (
    <Paper sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.75 }}>
      <Typography variant="h6" sx={{ fontSize: '0.9rem' }}>Master settings</Typography>

      <Step n={1} title="What is it?" hint="optional — sets the character">
        <StyleChips
          selected={fromChoice ? choice.style : null}
          onSelect={(id) => setChoice({ style: id })}
        />
        <Caption>{style?.description ?? 'No genre-specific shaping — only the destination and the fixes shape the sound.'}</Caption>
      </Step>

      <DestinationStep n={2} />

      <Step
        n={3}
        title="Fix problems found in this track"
        action={<Switch size="small" checked={choice.fix} onChange={(_, v) => setChoice({ fix: v })} />}
      >
        <FixList subject="track" expectStyle={choice.style} />
      </Step>

      <Divider />

      <ResultSummary
        expectStyle={choice.style}
        footer="The preview (B) updates automatically. Fine-tune any stage in the chain; changing a choice above rebuilds the settings."
      />

      <ResultChips />

      <Divider />

      <PresetsSection hint="Save the current settings to reuse them on other songs." />
    </Paper>
  );
};

/** Style chips, with "Not specified" first (id ''). */
export const StyleChips: React.FC<{
  selected: string | null;
  onSelect: (id: string) => void;
  firstLabel?: string;
}> = ({ selected, onSelect, firstLabel = 'Not specified' }) => {
  const options = useStore((s) => s.recipeOptions);
  return (
    <ChipRow
      options={[{ id: '', name: firstLabel, description: '' }, ...(options?.styles ?? [])]}
      selected={selected}
      onSelect={onSelect}
    />
  );
};

/** "Where will it be heard?" — the destination is always the whole
 *  session's (one release). */
export const DestinationStep: React.FC<{ n: number; hint?: string }> = ({ n, hint = 'sets loudness and delivery' }) => {
  const options = useStore((s) => s.recipeOptions);
  const destination = useStore((s) => s.choice.destination);
  const setChoice = useStore((s) => s.setChoice);
  const fromChoice = useStore((s) => s.customPreset === null || s.workspace === 'album');
  const dest = options?.destinations.find((o) => o.id === destination);
  return (
    <Step n={n} title="Where will it be heard?" hint={hint}>
      <GroupLabel>Release</GroupLabel>
      <ChipRow
        options={options?.destinations.filter((d) => d.group === 'release') ?? []}
        selected={fromChoice ? destination : null}
        onSelect={(id) => setChoice({ destination: id })}
      />
      <GroupLabel>Mostly played on</GroupLabel>
      <ChipRow
        options={options?.destinations.filter((d) => d.group === 'device') ?? []}
        selected={fromChoice ? destination : null}
        onSelect={(id) => setChoice({ destination: id })}
      />
      {dest && (
        <Caption>
          {dest.description} <strong>{dest.target_lufs} LUFS, peaks ≤ {dest.ceiling_dbtp} dBTP.</strong>
        </Caption>
      )}
    </Step>
  );
};

// The applied recipe of the active track, once it matches what is
// selected (expectStyle: the style the track should be built with).
function useCurrentRecipe(expectStyle: string) {
  return useStore((s) => {
    const r = s.recipe;
    if (s.customPreset !== null || !r) return null;
    return r.style === expectStyle && r.destination === s.choice.destination && r.fix === s.choice.fix ? r : null;
  });
}

/** What the analysis found in the active track and the fixes applied. */
export const FixList: React.FC<{ subject: string; expectStyle: string }> = ({ subject, expectStyle }) => {
  const fix = useStore((s) => s.choice.fix);
  const fromChoice = useStore((s) => s.customPreset === null);
  const analysisReady = useStore((s) => s.analysis !== null);
  const current = useCurrentRecipe(expectStyle);
  const fixNotes = current?.notes.filter((n) => n.layer === 'fix') ?? [];
  if (!fix) return <Caption>Off — the analysis is not used to correct the sound.</Caption>;
  if (!fromChoice) return <Caption>Not applied while a saved preset is loaded.</Caption>;
  if (!analysisReady) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
        <CircularProgress size={11} />
        <Caption>Analyzing the {subject}…</Caption>
      </Box>
    );
  }
  if (!current) return <Caption>…</Caption>;
  if (fixNotes.length === 0) return <Caption>Nothing to fix — the {subject} is well balanced.</Caption>;
  return <>{fixNotes.map((n, i) => <Bullet key={i}>{n.text}</Bullet>)}</>;
};

/** One-line result of the active track's settings, what they do, and
 *  manual edits with a way back. */
export const ResultSummary: React.FC<{ expectStyle: string; footer: string }> = ({ expectStyle, footer }) => {
  const { resetToRecipe } = useAudioEngine();
  const customPreset = useStore((s) => s.customPreset);
  const paramsEdited = useStore((s) => s.paramsEdited);
  const current = useCurrentRecipe(expectStyle);
  const fromChoice = customPreset === null;
  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
        <CheckCircleIcon sx={{ fontSize: 16, color: 'success.main' }} />
        <Typography variant="body2" sx={{ fontSize: '0.8rem', fontWeight: 600 }}>
          {fromChoice ? (current?.summary ?? '…') : `Saved preset: ${customPreset}`}
        </Typography>
        {paramsEdited && (
          <>
            <Chip label="+ manual edits" size="small" sx={{ height: 18, fontSize: '0.65rem' }} />
            {fromChoice && (
              <Tooltip title="Discard the manual edits and go back to the settings built from the choices">
                <Button size="small" onClick={resetToRecipe} sx={{ fontSize: '0.65rem', minWidth: 0, py: 0 }}>
                  Reset
                </Button>
              </Tooltip>
            )}
          </>
        )}
      </Box>
      {current && (
        <Box sx={{ mt: 0.5 }}>
          {current.notes.filter((n) => n.layer !== 'fix').map((n, i) => <Bullet key={i}>{n.text}</Bullet>)}
        </Box>
      )}
      <Caption sx={{ mt: 0.75 }}>{footer}</Caption>
    </Box>
  );
};

/** Saved presets: save the active track's settings, load one onto it. */
export const PresetsSection: React.FC<{ hint: string }> = ({ hint }) => {
  const { applyCustomPreset } = useAudioEngine();
  const customPreset = useStore((s) => s.customPreset);
  const customPresets = useStore((s) => s.customPresets);
  const setCustomPresets = useStore((s) => s.setCustomPresets);
  const [saveOpen, setSaveOpen] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');

  const handleSave = () => {
    const name = newPresetName.trim();
    if (!name) return;
    const st = useStore.getState();
    const preset: CustomPreset = {
      name,
      category: 'custom',
      description: st.recipe?.summary ?? 'Custom preset',
      tags: ['custom'],
      processors: st.params,
    };
    setCustomPresets(saveCustomPreset(preset));
    st.setCustomPreset(name);
    st.setParamsEdited(false);
    setSaveOpen(false);
    setNewPresetName('');
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="body2" sx={{ fontSize: '0.75rem', fontWeight: 600 }}>My presets</Typography>
        <Button size="small" startIcon={<SaveIcon />} onClick={() => setSaveOpen(true)} sx={{ fontSize: '0.7rem' }}>
          Save current
        </Button>
      </Box>
      {customPresets.length === 0 ? (
        <Caption>{hint}</Caption>
      ) : (
        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 0.5 }}>
          {customPresets.map((p) => (
            <Tooltip key={p.name} title={p.description}>
              <Chip
                label={p.name}
                size="small"
                color={customPreset === p.name ? 'primary' : 'default'}
                variant={customPreset === p.name ? 'filled' : 'outlined'}
                onClick={() => applyCustomPreset(p)}
                onDelete={() => setCustomPresets(deleteCustomPreset(p.name))}
                sx={{ fontSize: '0.7rem' }}
              />
            </Tooltip>
          ))}
        </Box>
      )}

      <Dialog open={saveOpen} onClose={() => setSaveOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontSize: '1rem' }}>Save preset</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="Preset name"
            value={newPresetName}
            onChange={(e) => setNewPresetName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSaveOpen(false)}>Cancel</Button>
          <Button onClick={handleSave} variant="contained">Save</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export const Step: React.FC<{
  n: number; title: string; hint?: string; action?: React.ReactNode; children: React.ReactNode;
}> = ({ n, title, hint, action, children }) => (
  <Box>
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.75 }}>
      <Box sx={{
        width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '0.65rem', fontWeight: 700,
        bgcolor: 'rgba(108,99,255,0.2)', color: 'primary.main',
      }}>
        {n}
      </Box>
      <Typography variant="body2" sx={{ fontSize: '0.8rem', fontWeight: 600 }}>{title}</Typography>
      {hint && (
        <Typography variant="body2" sx={{ fontSize: '0.65rem', color: 'text.secondary' }}>{hint}</Typography>
      )}
      {action && <Box sx={{ ml: 'auto' }}>{action}</Box>}
    </Box>
    <Box sx={{ pl: 3.25 }}>{children}</Box>
  </Box>
);

export const ChipRow: React.FC<{
  options: RecipeOption[]; selected: string | null; onSelect: (id: string) => void;
}> = ({ options, selected, onSelect }) => (
  <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mb: 0.75 }}>
    {options.map((o) => (
      <Chip
        key={o.id || 'none'}
        label={o.name}
        size="small"
        onClick={() => onSelect(o.id)}
        variant={selected === o.id ? 'filled' : 'outlined'}
        color={selected === o.id ? 'primary' : 'default'}
        sx={{ fontSize: '0.7rem' }}
      />
    ))}
  </Box>
);

export const GroupLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Typography variant="body2" sx={{ fontSize: '0.62rem', color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.5, mb: 0.4 }}>
    {children}
  </Typography>
);

export const Caption: React.FC<{ children: React.ReactNode; sx?: object }> = ({ children, sx }) => (
  <Typography variant="body2" sx={{ fontSize: '0.7rem', color: 'text.secondary', ...sx }}>{children}</Typography>
);

export const Bullet: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Typography variant="body2" sx={{ fontSize: '0.7rem', color: 'text.secondary', pl: 1.25, textIndent: -8 }}>
    • {children}
  </Typography>
);

// Original → mastered characteristics of the active track.
export const ResultChips: React.FC = () => {
  const analysis = useStore((s) => s.analysis);
  const processed = useStore((s) => s.processedAnalysis);
  if (!analysis) return null;
  return (
    <Box>
      <Typography variant="body2" sx={{ fontSize: '0.7rem', fontWeight: 600, mb: 0.75 }}>
        Original{processed ? ' → mastered' : ''}
      </Typography>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <InfoChip label="Balance" value={analysis.spectrum?.spectral_balance || 'N/A'}
          processed={processed?.spectrum?.spectral_balance} />
        <InfoChip label="LUFS" value={analysis.loudness?.integrated_lufs.toFixed(1)}
          processed={processed?.loudness?.integrated_lufs.toFixed(1)} />
        <InfoChip label="True peak" value={`${analysis.loudness?.true_peak_dbtp.toFixed(1)} dB`}
          processed={processed && `${processed.loudness?.true_peak_dbtp.toFixed(1)} dB`} />
        <InfoChip label="Loudness range" value={`${analysis.loudness?.loudness_range_lu.toFixed(1)} LU`}
          processed={processed && `${processed.loudness?.loudness_range_lu.toFixed(1)} LU`} />
        {analysis.stereo_field && (
          <InfoChip label="Width" value={`${(analysis.stereo_field.width * 100).toFixed(0)}%`}
            processed={processed?.stereo_field && `${(processed.stereo_field.width * 100).toFixed(0)}%`} />
        )}
      </Box>
    </Box>
  );
};

const InfoChip: React.FC<{
  label: string;
  value: string;
  processed?: string | null | false;
}> = ({ label, value, processed }) => (
  <Box sx={{
    px: 1.25, py: 0.4, borderRadius: 1,
    bgcolor: 'rgba(108,99,255,0.08)',
    border: 1, borderColor: 'rgba(108,99,255,0.15)',
  }}>
    <Typography variant="body2" sx={{ fontSize: '0.6rem', color: 'text.secondary' }}>{label}</Typography>
    <Typography variant="body2" sx={{ fontSize: '0.72rem', fontWeight: 600 }}>
      {processed && processed !== value ? (
        <>
          <Typography component="span" sx={{ fontSize: '0.68rem', color: 'text.secondary' }}>{value}</Typography>
          {' → '}{processed}
        </>
      ) : value}
    </Typography>
  </Box>
);
