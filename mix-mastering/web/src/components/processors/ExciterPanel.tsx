import React from 'react';
import { Box, Paper, Collapse } from '@mui/material';
import { Knob } from '../controls/Knob';
import { ProcessorHeader } from '../controls/ParamSlider';
import { useAudioEngine } from '../../hooks/useAudioEngine';
import { useStore } from '../../store/store';
import { EMPTY_PARAMS } from '../../store/constants';

interface ExciterPanelProps {
  expanded: boolean;
  onExpandToggle: () => void;
}

interface ExciterPanelBaseProps extends ExciterPanelProps {
  procName: 'Bass Exciter' | 'Treble Exciter';
  title: string;
  freqMin: number;
  freqMax: number;
  freqDefault: number;
  color: string;
}

// Shared by BassExciterPanel/TrebleExciterPanel below. Unlike every other
// processor panel, exciters default OFF (they're a creative addition, not
// a corrective one — see NewFullChain in pkg/engine), so the enabled read
// falls back to false, not true.
const ExciterPanelBase: React.FC<ExciterPanelBaseProps> = ({
  procName, title, freqMin, freqMax, freqDefault, color, expanded, onExpandToggle,
}) => {
  const { setParam, setProcessorEnabled } = useAudioEngine();
  const params = useStore((s) => s.params[procName] ?? EMPTY_PARAMS);
  const enabled = useStore((s) => s.processorEnabled[procName] ?? false);

  const handleToggle = (v: boolean) => setProcessorEnabled(procName, v);

  return (
    <Paper sx={{ p: 2 }}>
      <ProcessorHeader title={title} enabled={enabled} onToggle={handleToggle} expanded={expanded} onExpandToggle={onExpandToggle} />
      <Collapse in={expanded}>
        <Box sx={{ display: 'flex', gap: 3, justifyContent: 'center' }}>
          <Knob
            label="Frequency"
            value={params.frequency ?? freqDefault}
            min={freqMin}
            max={freqMax}
            step={10}
            unit="Hz"
            color={color}
            onChange={(v) => setParam(procName, 'frequency', v)}
          />
          <Knob
            label="Drive"
            value={params.drive ?? 0.3}
            min={0}
            max={1}
            step={0.01}
            color={color}
            onChange={(v) => setParam(procName, 'drive', v)}
          />
          <Knob
            label="Mix"
            value={params.mix ?? 0.2}
            min={0}
            max={1}
            step={0.01}
            color={color}
            onChange={(v) => setParam(procName, 'mix', v)}
          />
        </Box>
      </Collapse>
    </Paper>
  );
};

export const BassExciterPanel: React.FC<ExciterPanelProps> = (props) => (
  <ExciterPanelBase
    procName="Bass Exciter" title="Bass Exciter"
    freqMin={60} freqMax={300} freqDefault={120} color="#F59E0B"
    {...props}
  />
);

export const TrebleExciterPanel: React.FC<ExciterPanelProps> = (props) => (
  <ExciterPanelBase
    procName="Treble Exciter" title="Treble Exciter"
    freqMin={2000} freqMax={10000} freqDefault={5000} color="#FBBF24"
    {...props}
  />
);
