import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Paper, Typography, Collapse, ToggleButton, Tooltip, Switch } from '@mui/material';
import HeadphonesIcon from '@mui/icons-material/Headphones';
import { ProcessorHeader } from '../controls/ParamSlider';
import { Knob } from '../controls/Knob';
import { usePanelView, ViewToggle } from '../controls/PanelView';
import { useAudioEngine } from '../../hooks/useAudioEngine';
import { useStore } from '../../store/store';
import { EMPTY_PARAMS } from '../../store/constants';
import { EQ_NAME, readBands, type EQBand } from '../../audio/eqMath';
import { setBandSolo } from '../../audio/livePreview';
import { EQGraph, BAND_COLORS, BAND_LABELS, GAIN_RANGE, type BandEdit } from './EQGraph';

interface EQPanelProps {
  expanded: boolean;
  onExpandToggle: () => void;
}

export const EQPanel: React.FC<EQPanelProps> = ({ expanded, onExpandToggle }) => {
  const { setParam, setProcessorEnabled } = useAudioEngine();
  const params = useStore((s) => s.params[EQ_NAME] ?? EMPTY_PARAMS);
  const enabled = useStore((s) => s.processorEnabled[EQ_NAME] ?? true);
  const isPlaying = useStore((s) => s.isPlaying);

  const [view, setView] = usePanelView('eq');
  const [selected, setSelected] = useState<number | null>(2);
  const [solo, setSolo] = useState(false);
  const [grabbed, setGrabbed] = useState<number | null>(null);

  // Drag edits show immediately from this local overlay; the engine round
  // trip (setParam -> getParams -> store) is throttled to one per frame,
  // and the overlay is dropped once the store has caught up.
  const [local, setLocal] = useState<Record<number, BandEdit>>({});
  const pending = useRef(new Map<string, number>());
  const inFlight = useRef(0);
  const frame = useRef(0);
  const grabbedRef = useRef<number | null>(null);

  const bands = useMemo<EQBand[]>(() => readBands(params).map((b, i) => ({ ...b, ...local[i] })), [params, local]);

  const settle = useCallback(() => {
    if (inFlight.current === 0 && pending.current.size === 0 && grabbedRef.current === null) setLocal({});
  }, []);

  const flush = useCallback(() => {
    frame.current = 0;
    const batch = [...pending.current];
    pending.current.clear();
    for (const [param, value] of batch) {
      inFlight.current++;
      setParam(EQ_NAME, param, value).finally(() => {
        inFlight.current--;
        settle();
      });
    }
  }, [setParam, settle]);

  const editBand = useCallback((i: number, edit: BandEdit) => {
    setLocal((prev) => ({ ...prev, [i]: { ...prev[i], ...edit } }));
    for (const [k, v] of Object.entries(edit)) {
      pending.current.set(`band.${i}.${k}`, typeof v === 'boolean' ? (v ? 1 : 0) : v);
    }
    if (!frame.current) frame.current = requestAnimationFrame(flush);
  }, [flush]);

  useEffect(() => () => {
    if (frame.current) cancelAnimationFrame(frame.current);
    setBandSolo(null);
  }, []);

  const onGrab = useCallback((i: number | null) => {
    grabbedRef.current = i;
    setGrabbed(i);
    if (i === null) settle();
  }, [settle]);

  // Band solo follows the grabbed band while it's dragged.
  const soloBand = solo && grabbed !== null ? bands[grabbed] : null;
  useEffect(() => {
    setBandSolo(soloBand);
  }, [soloBand?.type, soloBand?.freq, soloBand?.q]);

  const handleToggle = useCallback((v: boolean) => {
    setProcessorEnabled(EQ_NAME, v);
  }, [setProcessorEnabled]);

  const bandKnobs = (i: number, size: number) => {
    const band = bands[i];
    const pass = band.type === 'highpass' || band.type === 'lowpass';
    return (
      <>
        <Knob label="Freq" value={band.freq} min={20} max={20000} step={1} unit="Hz"
          color={BAND_COLORS[i]} size={size} onChange={(v) => setParam(EQ_NAME, `band.${i}.freq`, v)} />
        {!(view === 'visual' && pass) && (
          <Knob label="Gain" value={band.gain} min={-GAIN_RANGE} max={GAIN_RANGE} step={0.1} unit="dB"
            color={BAND_COLORS[i]} size={size} onChange={(v) => setParam(EQ_NAME, `band.${i}.gain`, v)} />
        )}
        <Knob label="Q" value={band.q} min={0.1} max={10} step={0.1}
          color={BAND_COLORS[i]} size={size} onChange={(v) => setParam(EQ_NAME, `band.${i}.q`, v)} />
      </>
    );
  };

  return (
    <Paper sx={{ p: 2 }}>
      <ProcessorHeader title="Parametric EQ" enabled={enabled} onToggle={handleToggle} expanded={expanded} onExpandToggle={onExpandToggle} />
      <Collapse in={expanded}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <ViewToggle view={view} onChange={setView} visualLabel="Curve" />
          {view === 'visual' && (
            <Tooltip title="Solo: while you hold a point, hear only the range that band works on">
              <ToggleButton value="solo" size="small" selected={solo} onChange={() => setSolo(!solo)}
                sx={{ py: 0.25, px: 1, fontSize: '0.7rem', gap: 0.5 }}>
                <HeadphonesIcon sx={{ fontSize: 14 }} /> Solo
              </ToggleButton>
            </Tooltip>
          )}
          <Box sx={{ flex: 1 }} />
          {view === 'visual' && (
            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem' }}>
              {isPlaying ? 'Changes play right away' : 'Drag points · wheel: width · double-click: on/off'}
            </Typography>
          )}
        </Box>

        {view === 'visual' ? (
          <>
            <EQGraph
              bands={bands} eqEnabled={enabled} height={220} interactive showZones showSpectra
              selected={selected} onSelect={(i) => i !== null && setSelected(i)}
              onEdit={editBand} onGrab={onGrab}
            />
            <Box sx={{ display: 'flex', gap: 2, mt: 0.75, fontSize: '0.65rem', color: 'text.secondary', flexWrap: 'wrap' }}>
              <span><span style={{ color: 'rgba(148,163,184,0.8)' }}>▬</span> original</span>
              <span><span style={{ color: 'rgba(244,114,182,0.8)' }}>▬</span> result</span>
              <span><span style={{ color: 'rgba(255,255,255,0.8)' }}>▬</span> playing now</span>
              <span>(tonal shape, level-aligned)</span>
            </Box>
            <Box sx={{ display: 'flex', gap: 0.5, mt: 1.5, mb: 1, flexWrap: 'wrap' }}>
              {bands.map((b, i) => (
                <ToggleButton key={i} value={i} size="small" selected={selected === i} onChange={() => setSelected(i)}
                  sx={{ py: 0.1, px: 1, fontSize: '0.65rem', color: BAND_COLORS[i], opacity: b.enabled ? 1 : 0.5 }}>
                  {BAND_LABELS[i]}
                </ToggleButton>
              ))}
            </Box>
            {selected !== null && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <Typography variant="body2" sx={{ fontSize: '0.7rem', color: BAND_COLORS[selected], fontWeight: 600 }}>
                    {BAND_LABELS[selected]}
                  </Typography>
                  <Switch size="small" checked={bands[selected].enabled}
                    onChange={(e) => editBand(selected, { enabled: e.target.checked })} />
                </Box>
                {bandKnobs(selected, 52)}
              </Box>
            )}
          </>
        ) : (
          <>
            <Box sx={{ mb: 2 }}>
              <EQGraph bands={bands} eqEnabled={enabled} height={150} />
            </Box>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', justifyContent: 'center' }}>
              {bands.map((_, i) => (
                <Box key={i} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
                  <Typography variant="body2" sx={{ fontSize: '0.65rem', color: BAND_COLORS[i], fontWeight: 600 }}>
                    {BAND_LABELS[i]}
                  </Typography>
                  {bandKnobs(i, 48)}
                </Box>
              ))}
            </Box>
          </>
        )}
      </Collapse>
    </Paper>
  );
};
