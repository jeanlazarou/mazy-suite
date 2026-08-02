import React, { useState } from 'react';
import { Box, Paper, Typography, Collapse, Switch, Tooltip } from '@mui/material';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { EQPanel } from './EQPanel';
import { BassExciterPanel, TrebleExciterPanel } from './ExciterPanel';
import { CompressorPanel } from './CompressorPanel';
import { LimiterPanel } from './LimiterPanel';
import { StereoPanel } from './StereoPanel';
import { useStore } from '../../store/store';
import { TARGET_LABELS } from '../../store/constants';
import { useAudioEngine } from '../../hooks/useAudioEngine';

const EXCITER_NAMES = ['Bass Exciter', 'Treble Exciter'] as const;

type PanelFC = React.FC<{ expanded: boolean; onExpandToggle: () => void }>;

interface StageMeta {
  label: string;
  color: string;
  panel?: PanelFC; // stages without a panel render as a non-clickable chip
  tooltip?: string; // used for non-clickable chips
  enhance?: boolean; // hidden until this stage is actually enabled
}

// Metadata for every stage the engine can report by name (pkg/engine's
// NewFullChain). Keyed by the engine's processor Name() string. The strip
// itself is ordered by store.processorNames — fetched from the engine
// (wasmGetProcessorNames) — not by the order of this object, so it can
// never drift from the real chain the way the old hardcoded STAGES list
// did (wrong order, missing the Normalizer and Gain stages entirely).
const STAGE_META: Record<string, StageMeta> = {
  'Parametric EQ': { label: 'EQ', color: '#6C63FF', panel: EQPanel },
  'Bass Exciter': { label: 'Bass Exciter', color: '#F59E0B', panel: BassExciterPanel, enhance: true },
  'Stereo Widener': { label: 'Stereo', color: '#A78BFA', panel: StereoPanel },
  'Compressor': { label: 'Compressor', color: '#FF6584', panel: CompressorPanel },
  'Treble Exciter': { label: 'Treble Exciter', color: '#FBBF24', panel: TrebleExciterPanel, enhance: true },
  'Loudness Normalizer': { label: 'Normalizer', color: '#34D399', tooltip: 'Configured automatically from the loudness target' },
  'Gain': { label: 'Gain', color: '#9CA3AF', tooltip: 'Album loudness offset (automatic)' },
  'Limiter': { label: 'Limiter', color: '#EF4444', panel: LimiterPanel },
};

// Rendered before the engine has reported its real processor order
// (wasmGetProcessorNames resolves once WASM is ready).
const FALLBACK_ORDER = Object.keys(STAGE_META);

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
  const [active, setActive] = useState<string | null>(null);
  const processorNames = useStore((s) => s.processorNames);
  const processorEnabled = useStore((s) => s.processorEnabled);
  const { setProcessorEnabled } = useAudioEngine();

  const toggle = (id: string) => setActive(active === id ? null : id);

  // The Enhance switch is the master on/off for both exciters together —
  // no separate "visible but not actually enabled" state. An earlier
  // version tried to keep Enhance as pure visibility (turning it on
  // enabled the exciters, but turning it off only hid them without
  // disabling), reasoning that off shouldn't silently undo a target
  // recommendation. In practice that made the switch look broken: once
  // flipped on, flipping it back off had no visible effect, because the
  // exciters — and therefore their chips — stayed on regardless of the
  // switch's own state. A toggle should toggle both ways; there's no
  // other control in this app with a one-directional switch.
  const excitersOn = EXCITER_NAMES.every((name) => processorEnabled[name] ?? false);
  const handleEnhanceToggle = (v: boolean) => {
    for (const name of EXCITER_NAMES) setProcessorEnabled(name, v);
  };

  const order = processorNames.length > 0 ? processorNames : FALLBACK_ORDER;
  const visible = order.filter((name) => {
    const meta = STAGE_META[name];
    if (!meta?.enhance) return true;
    // Hidden until enabled — either via the Enhance switch above or a
    // target recommendation that turned it on directly.
    return processorEnabled[name] ?? false;
  });

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Pipeline strip */}
      <Paper sx={{ p: 1.5 }}>
        {/* Enhance toggle: its own row, always top-right, independent of
            how the chip strip below wraps (it used to live at the end of
            the same flex row as the chips, so wrapping — e.g. with both
            exciters visible — pushed it down next to whichever chip
            happened to end the last line instead of staying anchored). */}
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 0.5 }}>
          <Tooltip title="Turns the Bass and Treble Exciter stages on or off together. Each stage also has its own switch in its panel for independent control.">
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Typography variant="body2" sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>
                Enhance
              </Typography>
              <Switch size="small" checked={excitersOn} onChange={(_, v) => handleEnhanceToggle(v)} />
            </Box>
          </Tooltip>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', rowGap: 1, columnGap: 0, flexWrap: 'wrap' }}>
        {/* Input node */}
        <Box sx={{
          px: 1.5, py: 0.5, borderRadius: 1,
          bgcolor: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.1)',
        }}>
          <Typography variant="body2" sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>Input</Typography>
        </Box>

        {visible.map((name) => {
          const meta = STAGE_META[name] ?? { label: name, color: '#9CA3AF' };
          const isActive = active === name;
          const clickable = !!meta.panel;
          const chip = (
            <Box
              onClick={clickable ? () => toggle(name) : undefined}
              sx={{
                px: 1.5, py: 0.5, borderRadius: 1,
                cursor: clickable ? 'pointer' : 'default',
                userSelect: 'none',
                opacity: clickable ? 1 : 0.6,
                bgcolor: isActive ? `${meta.color}22` : 'rgba(255,255,255,0.05)',
                border: `1px solid ${isActive ? meta.color : 'rgba(255,255,255,0.1)'}`,
                transition: 'all 0.15s',
                '&:hover': clickable ? {
                  bgcolor: `${meta.color}15`,
                  borderColor: `${meta.color}80`,
                } : undefined,
              }}
            >
              <Typography variant="body2" sx={{
                fontSize: '0.7rem',
                fontWeight: isActive ? 600 : 400,
                color: isActive ? meta.color : 'text.secondary',
                transition: 'color 0.15s',
              }}>
                {meta.label}
              </Typography>
            </Box>
          );
          return (
            <React.Fragment key={name}>
              <ArrowForwardIcon sx={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.2)', mx: 0.5 }} />
              {meta.tooltip ? <Tooltip title={meta.tooltip}><span>{chip}</span></Tooltip> : chip}
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
      {visible.filter((name) => STAGE_META[name]?.panel).map((name) => {
        const Panel = STAGE_META[name].panel!;
        return (
          <Collapse key={name} in={active === name}>
            <Panel expanded={active === name} onExpandToggle={() => toggle(name)} />
          </Collapse>
        );
      })}
    </Box>
  );
};
