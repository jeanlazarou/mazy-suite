import { useState } from 'react';
import TextField from '@mui/material/TextField';

interface NumberFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  /** Decimals shown when the field is not being edited; 0 for whole numbers. */
  decimals?: number;
  className?: string;
}

/**
 * A number field that can be typed into freely. While it has focus it shows
 * exactly what was typed - "1." stays "1.", an emptied field stays empty -
 * and passes on each value that parses, kept within [min, max]. On blur it
 * settles back to the formatted value.
 */
export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  decimals = 0,
  className,
}: NumberFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const format = (v: number) => v.toFixed(decimals);

  return (
    <TextField
      label={label}
      type="number"
      value={draft ?? format(value)}
      onFocus={() => setDraft(format(value))}
      onChange={(e) => {
        setDraft(e.target.value);
        const parsed = decimals > 0 ? parseFloat(e.target.value) : parseInt(e.target.value, 10);
        if (Number.isFinite(parsed)) onChange(Math.min(max, Math.max(min, parsed)));
      }}
      onBlur={() => setDraft(null)}
      fullWidth
      inputProps={{ min, max, step }}
      variant="outlined"
      size="small"
      className={className}
      sx={{
        '& .MuiOutlinedInput-root': {
          color: 'white',
          '& fieldset': { borderColor: 'rgba(255, 255, 255, 0.23)' },
          '&:hover fieldset': { borderColor: 'rgba(255, 255, 255, 0.4)' },
        },
        '& .MuiInputLabel-root': { color: 'rgba(255, 255, 255, 0.7)' },
      }}
    />
  );
}
