import { useMixStore, withLane, getLane } from '../state/store';
import { engine } from '../audio/engine';
import { FADE_PRESETS } from '../model/envelope';
import { recordHistory } from '../state/history';

// Keys 1/2/3 apply the fast/medium/slow preset (length + shape) to the
// selected region: 50 ms linear, 0.5 s smooth S-curve, 2 s logarithmic.
export const applyFadePreset = (presetKey) => {
  const s0 = useMixStore.getState();
  const { selection } = s0;
  const preset = FADE_PRESETS[presetKey];
  if (!selection?.regionId || !preset) return;
  const region = getLane(s0, selection.laneId)?.regions.find((r) => r.id === selection.regionId);
  if (!region || (region.fade === preset.fade && region.shape === preset.shape)) return;
  recordHistory();
  useMixStore.setState((s) => withLane(s, selection.laneId, (t) => ({
    ...t,
    regions: t.regions.map((r) => (
      r.id === selection.regionId ? { ...r, fade: preset.fade, shape: preset.shape } : r
    )),
  })));
  engine.modelChanged();
};
