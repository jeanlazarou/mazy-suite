import React from 'react';
import { Box, Typography, LinearProgress } from '@mui/material';
import { useStore } from '../../store/store';

export const LUFSMeter: React.FC = () => {
  const analysis = useStore((s) => s.analysis);

  if (!analysis?.loudness) return null;

  const { integrated_lufs, momentary_max_lufs, loudness_range_lu, true_peak_dbtp } = analysis.loudness;

  const meterValue = (lufs: number) => Math.max(0, Math.min(100, (lufs + 60) / 60 * 100));

  const getColor = (lufs: number) => {
    if (lufs > -6) return 'error';
    if (lufs > -14) return 'warning';
    return 'primary';
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Typography variant="body2" sx={{ fontSize: '0.7rem', color: 'text.secondary', fontWeight: 600 }}>
        LOUDNESS
      </Typography>

      <MeterRow label="Integrated" value={integrated_lufs} unit="LUFS" barValue={meterValue(integrated_lufs)} color={getColor(integrated_lufs)} />
      <MeterRow label="Momentary Max" value={momentary_max_lufs} unit="LUFS" barValue={meterValue(momentary_max_lufs)} color={getColor(momentary_max_lufs)} />
      <MeterRow label="Range" value={loudness_range_lu} unit="LU" barValue={Math.min(100, loudness_range_lu * 3)} color="primary" />
      <MeterRow label="True Peak" value={true_peak_dbtp} unit="dBTP" barValue={meterValue(true_peak_dbtp)} color={true_peak_dbtp > -1 ? 'error' : 'success'} />
    </Box>
  );
};

interface MeterRowProps {
  label: string;
  value: number;
  unit: string;
  barValue: number;
  color: 'primary' | 'secondary' | 'error' | 'warning' | 'info' | 'success';
}

const MeterRow: React.FC<MeterRowProps> = ({ label, value, unit, barValue, color }) => (
  <Box>
    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.25 }}>
      <Typography variant="body2" sx={{ fontSize: '0.65rem', color: 'text.secondary' }}>{label}</Typography>
      <Typography variant="body2" sx={{ fontSize: '0.7rem', fontWeight: 600 }}>
        {value > -200 ? value.toFixed(1) : '--'} {unit}
      </Typography>
    </Box>
    <LinearProgress
      variant="determinate"
      value={barValue}
      color={color}
      sx={{ height: 4, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.04)' }}
    />
  </Box>
);
