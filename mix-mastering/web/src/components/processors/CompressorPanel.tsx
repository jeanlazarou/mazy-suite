import React from 'react';
import { Box, Paper, Collapse, Typography } from '@mui/material';
import { Knob } from '../controls/Knob';
import { ProcessorHeader } from '../controls/ParamSlider';
import { useAudioEngine } from '../../hooks/useAudioEngine';
import { useStore } from '../../store/store';
import { EMPTY_PARAMS } from '../../store/constants';

interface CompressorPanelProps {
  expanded: boolean;
  onExpandToggle: () => void;
}

export const CompressorPanel: React.FC<CompressorPanelProps> = ({ expanded, onExpandToggle }) => {
  const { setParam, setProcessorEnabled } = useAudioEngine();
  const params = useStore((s) => s.params['Compressor'] ?? EMPTY_PARAMS);
  const meters = useStore((s) => s.meters['Compressor']);
  const enabled = useStore((s) => s.processorEnabled['Compressor'] ?? true);

  const handleToggle = (v: boolean) => setProcessorEnabled('Compressor', v);

  return (
    <Paper sx={{ p: 2 }}>
      <ProcessorHeader title="Compressor" enabled={enabled} onToggle={handleToggle} expanded={expanded} onExpandToggle={onExpandToggle} />
      <Collapse in={expanded}>
        <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', justifyContent: 'center' }}>
          <Knob
            label="Threshold"
            value={params.threshold ?? -18}
            min={-60}
            max={0}
            step={0.5}
            unit="dB"
            color="#FF6584"
            onChange={(v) => setParam('Compressor', 'threshold', v)}
          />
          <Knob
            label="Ratio"
            value={params.ratio ?? 4}
            min={1}
            max={20}
            step={0.1}
            unit=":1"
            color="#FBBF24"
            onChange={(v) => setParam('Compressor', 'ratio', v)}
          />
          <Knob
            label="Attack"
            value={params.attack ?? 10}
            min={0.1}
            max={200}
            step={0.1}
            unit="ms"
            color="#4ADE80"
            onChange={(v) => setParam('Compressor', 'attack', v)}
          />
          <Knob
            label="Release"
            value={params.release ?? 100}
            min={1}
            max={1000}
            step={1}
            unit="ms"
            color="#6C63FF"
            onChange={(v) => setParam('Compressor', 'release', v)}
          />
          <Knob
            label="Knee"
            value={params.knee ?? 6}
            min={0}
            max={20}
            step={0.5}
            unit="dB"
            color="#A78BFA"
            onChange={(v) => setParam('Compressor', 'knee', v)}
          />
          <Knob
            label="Makeup"
            value={params.makeup ?? 0}
            min={0}
            max={24}
            step={0.5}
            unit="dB"
            color="#22D3EE"
            onChange={(v) => setParam('Compressor', 'makeup', v)}
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
