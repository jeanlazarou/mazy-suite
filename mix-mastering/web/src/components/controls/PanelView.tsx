import React, { useState } from 'react';
import { ToggleButton, ToggleButtonGroup } from '@mui/material';

// Each processor panel offers a visual view (direct manipulation on a
// picture of what the processor does) and the knob view. The choice is
// per panel and per viewer, remembered in localStorage.

export type PanelView = 'visual' | 'knobs';

export function usePanelView(key: string): [PanelView, (v: PanelView) => void] {
  const storageKey = `mm.view.${key}`;
  const [view, setView] = useState<PanelView>(() => {
    try {
      return localStorage.getItem(storageKey) === 'knobs' ? 'knobs' : 'visual';
    } catch {
      return 'visual';
    }
  });
  const set = (v: PanelView) => {
    setView(v);
    try { localStorage.setItem(storageKey, v); } catch { /* per-viewer convenience only */ }
  };
  return [view, set];
}

export const ViewToggle: React.FC<{ view: PanelView; onChange: (v: PanelView) => void; visualLabel: string }> = ({
  view, onChange, visualLabel,
}) => (
  <ToggleButtonGroup size="small" exclusive value={view} onChange={(_, v) => v && onChange(v)}>
    <ToggleButton value="visual" sx={{ py: 0.25, px: 1.5, fontSize: '0.7rem' }}>{visualLabel}</ToggleButton>
    <ToggleButton value="knobs" sx={{ py: 0.25, px: 1.5, fontSize: '0.7rem' }}>Knobs</ToggleButton>
  </ToggleButtonGroup>
);
