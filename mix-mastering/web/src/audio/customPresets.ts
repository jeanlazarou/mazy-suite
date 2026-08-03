import type { ProcessorParams } from '../wasm/engine';

// User-saved presets. Unlike built-in presets (embedded in the Go binary,
// looked up by name via wasmApplyPreset), these live only in the browser —
// the WASM engine has no way to know about them, so applying one means
// replaying its param map directly through setParam (see
// useAudioEngine.applyCustomPreset), not asking the engine to look it up.
export interface CustomPreset {
  name: string;
  category: 'custom';
  description: string;
  tags: string[];
  processors: ProcessorParams;
}

const STORAGE_KEY = 'mixMastering.customPresets';

export function loadCustomPresets(): CustomPreset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persist(list: CustomPreset[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

/** Upserts by name (saving over an existing name replaces it). */
export function saveCustomPreset(preset: CustomPreset): CustomPreset[] {
  const updated = [...loadCustomPresets().filter((p) => p.name !== preset.name), preset];
  persist(updated);
  return updated;
}

export function deleteCustomPreset(name: string): CustomPreset[] {
  const updated = loadCustomPresets().filter((p) => p.name !== name);
  persist(updated);
  return updated;
}
