import React, { useState } from 'react';
import { Box, Paper, Typography, Collapse } from '@mui/material';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { EQPanel } from './EQPanel';
import { CompressorPanel } from './CompressorPanel';
import { LimiterPanel } from './LimiterPanel';
import { StereoPanel } from './StereoPanel';
import { useStore } from '../../store/store';
import { TARGET_LABELS } from '../../store/constants';

const STAGES = [
  { id: 'eq', label: 'EQ', color: '#6C63FF' },
  { id: 'compressor', label: 'Compressor', color: '#FF6584' },
  { id: 'limiter', label: 'Limiter', color: '#EF4444' },
  { id: 'stereo', label: 'Stereo', color: '#A78BFA' },
] as const;

type StageId = typeof STAGES[number]['id'];

// One-line summary of where the current settings come from:
// preset base, target adjustments layered on top, then manual edits.
const SettingsProvenance: React.FC = () => {
  const activePreset = useStore((s) => s.activePreset);
  const appliedTarget = useStore((s) => s.appliedTarget);
  const paramsEdited = useStore((s) => s.paramsEdited);

  const parts: string[] = [];
  if (activePreset) parts.push(`${activePreset} preset`);
  if (appliedTarget) parts.push(`${TARGET_LABELS[appliedTarget] ?? appliedTarget} adjustments`);
  if (paramsEdited) parts.push('manual edits');
  const summary = parts.length > 0 ? parts.join(' + ') : 'defaults';

  return (
    <Typography variant="body2" sx={{ fontSize: '0.65rem', color: 'text.secondary', textAlign: 'center', mt: 1 }}>
      Settings: {summary}
    </Typography>
  );
};

export const ProcessorPipeline: React.FC = () => {
  const [active, setActive] = useState<StageId | null>(null);

  const toggle = (id: StageId) => setActive(active === id ? null : id);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Pipeline strip */}
      <Paper sx={{ p: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0 }}>
        {/* Input node */}
        <Box sx={{
          px: 1.5, py: 0.5, borderRadius: 1,
          bgcolor: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.1)',
        }}>
          <Typography variant="body2" sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>Input</Typography>
        </Box>

        {STAGES.map((stage) => {
          const isActive = active === stage.id;
          return (
            <React.Fragment key={stage.id}>
              {/* Arrow */}
              <ArrowForwardIcon sx={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.2)', mx: 0.5 }} />

              {/* Processor node */}
              <Box
                onClick={() => toggle(stage.id)}
                sx={{
                  px: 1.5, py: 0.5, borderRadius: 1,
                  cursor: 'pointer',
                  userSelect: 'none',
                  bgcolor: isActive ? `${stage.color}22` : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${isActive ? stage.color : 'rgba(255,255,255,0.1)'}`,
                  transition: 'all 0.15s',
                  '&:hover': {
                    bgcolor: `${stage.color}15`,
                    borderColor: `${stage.color}80`,
                  },
                }}
              >
                <Typography variant="body2" sx={{
                  fontSize: '0.7rem',
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? stage.color : 'text.secondary',
                  transition: 'color 0.15s',
                }}>
                  {stage.label}
                </Typography>
              </Box>
            </React.Fragment>
          );
        })}

          {/* Arrow + Output node */}
          <ArrowForwardIcon sx={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.2)', mx: 0.5 }} />
          <Box sx={{
            px: 1.5, py: 0.5, borderRadius: 1,
            bgcolor: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
          }}>
            <Typography variant="body2" sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>Output</Typography>
          </Box>
        </Box>
        <SettingsProvenance />
      </Paper>

      {/* Active processor panel */}
      <Collapse in={active === 'eq'}><EQPanel expanded={active === 'eq'} onExpandToggle={() => toggle('eq')} /></Collapse>
      <Collapse in={active === 'compressor'}><CompressorPanel expanded={active === 'compressor'} onExpandToggle={() => toggle('compressor')} /></Collapse>
      <Collapse in={active === 'limiter'}><LimiterPanel expanded={active === 'limiter'} onExpandToggle={() => toggle('limiter')} /></Collapse>
      <Collapse in={active === 'stereo'}><StereoPanel expanded={active === 'stereo'} onExpandToggle={() => toggle('stereo')} /></Collapse>
    </Box>
  );
};
