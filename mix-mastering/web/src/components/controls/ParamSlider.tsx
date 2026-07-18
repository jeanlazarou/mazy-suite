import React from 'react';
import { Box, Slider, Typography, Switch } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

interface ParamSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
}

export const ParamSlider: React.FC<ParamSliderProps> = ({
  label, value, min, max, step = 0.1, unit = '', onChange,
}) => (
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%' }}>
    <Typography variant="body2" sx={{ minWidth: 80, color: 'text.secondary', fontSize: '0.75rem' }}>
      {label}
    </Typography>
    <Slider
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(_, v) => onChange(v as number)}
      sx={{ flex: 1 }}
      size="small"
    />
    <Typography variant="body2" sx={{ minWidth: 55, textAlign: 'right', fontSize: '0.75rem', fontWeight: 600 }}>
      {value.toFixed(1)}{unit}
    </Typography>
  </Box>
);

interface ProcessorHeaderProps {
  title: string;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  expanded?: boolean;
  onExpandToggle?: () => void;
}

export const ProcessorHeader: React.FC<ProcessorHeaderProps> = ({ title, enabled, onToggle, expanded, onExpandToggle }) => (
  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: expanded ? 1 : 0 }}>
    <Box
      onClick={onExpandToggle}
      sx={{ display: 'flex', alignItems: 'center', gap: 0.5, cursor: onExpandToggle ? 'pointer' : 'default', userSelect: 'none', flex: 1 }}
    >
      {onExpandToggle && (
        <ExpandMoreIcon
          sx={{
            fontSize: '1.2rem',
            color: 'text.secondary',
            transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)',
            transition: 'transform 0.2s',
          }}
        />
      )}
      <Typography variant="h6" sx={{ fontSize: '0.9rem', fontWeight: 600 }}>
        {title}
      </Typography>
    </Box>
    <Switch size="small" checked={enabled} onChange={(_, v) => onToggle(v)} />
  </Box>
);
