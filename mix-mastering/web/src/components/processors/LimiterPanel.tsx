import React from 'react';
import { Box, Paper, Collapse, Typography } from '@mui/material';
import { Knob } from '../controls/Knob';
import { ProcessorHeader } from '../controls/ParamSlider';
import { useAudioEngine } from '../../hooks/useAudioEngine';
import { useStore } from '../../store/store';
import { EMPTY_PARAMS } from '../../store/constants';

interface LimiterPanelProps {
  expanded: boolean;
  onExpandToggle: () => void;
}

export const LimiterPanel: React.FC<LimiterPanelProps> = ({ expanded, onExpandToggle }) => {
  const { setParam, setProcessorEnabled } = useAudioEngine();
  const params = useStore((s) => s.params['Limiter'] ?? EMPTY_PARAMS);
  const meters = useStore((s) => s.meters['Limiter']);
  const enabled = useStore((s) => s.processorEnabled['Limiter'] ?? true);

  const handleToggle = (v: boolean) => setProcessorEnabled('Limiter', v);

  return (
    <Paper sx={{ p: 2 }}>
      <ProcessorHeader title="Limiter" enabled={enabled} onToggle={handleToggle} expanded={expanded} onExpandToggle={onExpandToggle} />
      <Collapse in={expanded}>
        <Box sx={{ display: 'flex', gap: 3, justifyContent: 'center' }}>
          <Knob
            label="Ceiling"
            value={params.ceiling ?? -0.3}
            min={-12}
            max={0}
            step={0.1}
            unit="dB"
            color="#EF4444"
            onChange={(v) => setParam('Limiter', 'ceiling', v)}
          />
          <Knob
            label="Release"
            value={params.release ?? 50}
            min={1}
            max={500}
            step={1}
            unit="ms"
            color="#FBBF24"
            onChange={(v) => setParam('Limiter', 'release', v)}
          />
          <Knob
            label="Lookahead"
            value={params.lookahead ?? 5}
            min={0.1}
            max={20}
            step={0.1}
            unit="ms"
            color="#6C63FF"
            onChange={(v) => setParam('Limiter', 'lookahead', v)}
          />
        </Box>
        {meters && (
          <Typography
            variant="body2"
            sx={{ mt: 1.5, textAlign: 'center', fontSize: '0.7rem', color: 'text.secondary', fontFamily: 'JetBrains Mono, monospace' }}
          >
            Gain reduction (last process): max {meters.max_gr_db.toFixed(1)} dB · avg {meters.avg_gr_db.toFixed(1)} dB
          </Typography>
        )}
      </Collapse>
    </Paper>
  );
};
