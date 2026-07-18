import React from 'react';
import { Box, Paper, Collapse } from '@mui/material';
import { Knob } from '../controls/Knob';
import { ProcessorHeader } from '../controls/ParamSlider';
import { useAudioEngine } from '../../hooks/useAudioEngine';
import { useStore } from '../../store/store';
import { EMPTY_PARAMS } from '../../store/constants';

interface StereoPanelProps {
  expanded: boolean;
  onExpandToggle: () => void;
}

export const StereoPanel: React.FC<StereoPanelProps> = ({ expanded, onExpandToggle }) => {
  const { setParam, setProcessorEnabled } = useAudioEngine();
  const widthParams = useStore((s) => s.params['Stereo Widener'] ?? EMPTY_PARAMS);
  const msParams = useStore((s) => s.params['Mid/Side Processor'] ?? EMPTY_PARAMS);
  const enabled = useStore((s) => s.processorEnabled['Stereo Widener'] ?? true);

  const handleToggle = (v: boolean) => setProcessorEnabled('Stereo Widener', v);

  return (
    <Paper sx={{ p: 2 }}>
      <ProcessorHeader title="Stereo" enabled={enabled} onToggle={handleToggle} expanded={expanded} onExpandToggle={onExpandToggle} />
      <Collapse in={expanded}>
        <Box sx={{ display: 'flex', gap: 3, justifyContent: 'center' }}>
          <Knob
            label="Width"
            value={widthParams.width ?? 1.0}
            min={0}
            max={2}
            step={0.01}
            color="#A78BFA"
            onChange={(v) => setParam('Stereo Widener', 'width', v)}
          />
          <Knob
            label="Mid Gain"
            value={msParams.mid_gain ?? 0}
            min={-12}
            max={12}
            step={0.1}
            unit="dB"
            color="#4ADE80"
            onChange={(v) => setParam('Mid/Side Processor', 'mid_gain', v)}
          />
          <Knob
            label="Side Gain"
            value={msParams.side_gain ?? 0}
            min={-12}
            max={12}
            step={0.1}
            unit="dB"
            color="#22D3EE"
            onChange={(v) => setParam('Mid/Side Processor', 'side_gain', v)}
          />
        </Box>
      </Collapse>
    </Paper>
  );
};
