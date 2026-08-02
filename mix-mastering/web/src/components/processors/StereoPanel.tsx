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
        </Box>
      </Collapse>
    </Paper>
  );
};
