import { create } from 'zustand';
import type { AnalysisResult, ProcessorParams, MeterData, StageSummary, Recipe, RecipeChoice, RecipeOptions } from '../wasm/engine';
import { type CustomPreset, loadCustomPresets } from '../audio/customPresets';

export interface AudioFileInfo {
  name: string;
  duration: number;
  sampleRate: number;
  channels: number;
}

export interface XraySetup {
  id: string;
  name: string;
  // Track the stages snapshot was captured on.
  trackId: string | null;
  params: ProcessorParams;
  enabled: Record<string, boolean>;
  stages: StageSummary[] | null;
  // Gain-reduction meters captured alongside stages — the lane labels
  // read from live `meters` state, so restoring stages without these
  // would leave GR readouts showing the previous setup's values.
  meters: MeterData | null;
  // Settings key the capture was made under; applying the setup restores
  // the lanes instantly when the key matches the post-apply settings.
  stagesKey: string | null;
}

export interface AlbumTrack {
  id: string;
  name: string;
  buffer: AudioBuffer;
  info: AudioFileInfo;
  // Filled in by the background album analysis
  analysis: AnalysisResult | null;
  blocks: number[] | null; // BS.1770 gating blocks for album integration
}

interface AppState {
  // Album: all loaded tracks. The single-track fields below always mirror
  // the active track, so the whole single-file UI works unchanged.
  tracks: AlbumTrack[];
  activeTrackId: string | null;
  // When on (and >1 track), loudness is normalized with one shared offset
  // from the album's integrated loudness instead of per-track.
  albumMode: boolean;
  // Album loudness of the source tracks (informational, for the table).
  albumLufs: number | null;
  // Album loudness measured through the current chain (limiter off) — the
  // basis of the shared offset. Cached per settings key; recomputed by the
  // calibration pass when settings change.
  albumCalKey: string | null;
  albumPostLufs: number | null;
  albumCalibrating: string | null; // progress message while calibrating

  // Audio
  originalBuffer: AudioBuffer | null;
  processedBuffer: AudioBuffer | null;
  fileInfo: AudioFileInfo | null;
  isProcessing: boolean;
  isPlaying: boolean;
  playbackPosition: number;
  listenMode: 'original' | 'processed'; // A/B toggle

  // Engine
  wasmReady: boolean;
  params: ProcessorParams;
  meters: MeterData;
  // Bypass state per processor name; survives engine re-initialization.
  // Reconciled from params by setParams for processors that expose an
  // "enabled" param (currently the exciters) — see setParams below.
  processorEnabled: Record<string, boolean>;
  // Chain processor names in real signal-flow order, from the engine
  // (wasmGetProcessorNames) — drives the studio pipeline strip so it
  // can't drift from the actual chain the way a hand-maintained list did.
  processorNames: string[];

  // Loudness-matched A/B: gain (dB) applied to processed playback so both
  // buffers compare at equal loudness.
  loudnessMatch: boolean;
  matchGainDB: number | null;

  // Analysis of the original audio (runs automatically on file load);
  // the recipe's fixes derive from this.
  analysis: AnalysisResult | null;
  // Analysis of the last processed result, for display only.
  processedAnalysis: AnalysisResult | null;
  isAnalyzing: boolean;

  // Master settings: what the material is (style), where it will be heard
  // (destination) and whether to fix problems found by the analysis. The
  // Go side turns a choice into complete chain settings (a recipe); the
  // recipe-sync effect in App rebuilds and applies it whenever the
  // choice or the analysis it depends on changes.
  recipeOptions: RecipeOptions | null;
  choice: RecipeChoice;
  // Recipe currently applied, and the choice+analysis identity it was
  // built for (null forces a rebuild). Null recipe while a custom preset
  // is loaded.
  recipe: Recipe | null;
  recipeKey: string | null;
  // Name of the loaded custom preset; while set, choices aren't applied.
  customPreset: string | null;
  // True when params were manually tweaked after the last recipe or
  // custom preset was applied.
  paramsEdited: boolean;

  // User-saved presets, kept in localStorage; loaded synchronously at
  // store creation, independent of WASM being ready.
  customPresets: CustomPreset[];

  // UI
  loading: boolean;
  error: string | null;
  paramsDirty: boolean;
  seekRequest: number | null;

  // Chain X-Ray view: full-screen workbench showing per-stage signal
  // envelopes and spectrograms of the active track under the current
  // settings. xrayStagesKey records the settings+track the stages were
  // computed for, so the view knows when to recompute.
  xrayOpen: boolean;
  xrayStages: StageSummary[] | null;
  xrayStagesKey: string | null;
  xrayBusy: boolean;

  // Saved setups: named parameter snapshots (plus the stage capture they
  // were saved with, so switching setups flips the lanes instantly for
  // visual A/B comparison).
  xraySetups: XraySetup[];
  xrayActiveSetupId: string | null; // setup the current params came from

  // Actions
  addTracks: (tracks: AlbumTrack[]) => void;
  setActiveTrack: (id: string) => void;
  updateTrack: (id: string, patch: Partial<Pick<AlbumTrack, 'analysis' | 'blocks'>>) => void;
  setAlbumMode: (v: boolean) => void;
  setAlbumLufs: (v: number | null) => void;
  setAlbumCalibration: (key: string, postLufs: number) => void;
  setAlbumCalibrating: (msg: string | null) => void;
  setOriginalBuffer: (buffer: AudioBuffer, info: AudioFileInfo) => void;
  setProcessedBuffer: (buffer: AudioBuffer) => void;
  setIsProcessing: (v: boolean) => void;
  setIsPlaying: (v: boolean) => void;
  setPlaybackPosition: (v: number) => void;
  setListenMode: (mode: 'original' | 'processed') => void;
  setWasmReady: (v: boolean) => void;
  setParams: (params: ProcessorParams) => void;
  setMeters: (m: MeterData) => void;
  setProcessorEnabledState: (name: string, enabled: boolean) => void;
  setProcessorNames: (names: string[]) => void;
  setLoudnessMatch: (v: boolean) => void;
  setMatchGainDB: (v: number | null) => void;
  setIsAnalyzing: (v: boolean) => void;
  setParamsEdited: (v: boolean) => void;
  setParamsDirty: (v: boolean) => void;
  setAnalysis: (a: AnalysisResult | null) => void;
  setProcessedAnalysis: (a: AnalysisResult | null) => void;
  setRecipeOptions: (o: RecipeOptions) => void;
  // Changing the choice leaves any loaded custom preset.
  setChoice: (patch: Partial<RecipeChoice>) => void;
  setAppliedRecipe: (r: Recipe | null, key: string | null) => void;
  setCustomPreset: (name: string | null) => void;
  // Replace all params and bypass state at once (recipe / custom preset).
  applySettings: (params: ProcessorParams, enabled: Record<string, boolean>) => void;
  setCustomPresets: (p: CustomPreset[]) => void;
  setLoading: (v: boolean) => void;
  setError: (e: string | null) => void;
  requestSeek: (position: number) => void;
  clearSeekRequest: () => void;
  setXrayOpen: (v: boolean) => void;
  setXrayStages: (s: StageSummary[] | null, key: string | null) => void;
  setXrayBusy: (v: boolean) => void;
  addXraySetup: (setup: XraySetup) => void;
  deleteXraySetup: (id: string) => void;
  setXrayActiveSetup: (id: string | null) => void;
  reset: () => void;
}

// View-state reset applied whenever the active audio changes (new file or
// track switch); analysis is re-established by the automatic analysis.
const freshTrackView = {
  processedBuffer: null,
  processedAnalysis: null,
  analysis: null,
  meters: {},
  matchGainDB: null,
  paramsDirty: true,
  isPlaying: false,
  playbackPosition: 0,
  xrayStages: null,
  xrayStagesKey: null,
} as const;

export const useStore = create<AppState>((set) => ({
  tracks: [],
  activeTrackId: null,
  albumMode: false,
  albumLufs: null,
  albumCalKey: null,
  albumPostLufs: null,
  albumCalibrating: null,
  originalBuffer: null,
  processedBuffer: null,
  fileInfo: null,
  isProcessing: false,
  isPlaying: false,
  playbackPosition: 0,
  listenMode: 'original',
  wasmReady: false,
  params: {},
  meters: {},
  processorEnabled: {},
  processorNames: [],
  loudnessMatch: false,
  matchGainDB: null,
  analysis: null,
  processedAnalysis: null,
  isAnalyzing: false,
  recipeOptions: null,
  choice: { style: '', destination: 'streaming', fix: true },
  recipe: null,
  recipeKey: null,
  customPreset: null,
  paramsEdited: false,
  customPresets: loadCustomPresets(),
  loading: true,
  error: null,
  paramsDirty: true,
  seekRequest: null,
  xrayOpen: false,
  xrayStages: null,
  xrayStagesKey: null,
  xrayBusy: false,
  xraySetups: [],
  xrayActiveSetupId: null,

  addTracks: (newTracks) => set((s) => {
    const tracks = [...s.tracks, ...newTracks];
    const activate = s.activeTrackId === null && newTracks.length > 0 ? newTracks[0] : null;
    return {
      tracks,
      albumMode: tracks.length > 1 ? true : s.albumMode,
      albumLufs: null, // recomputed once every track has blocks
      albumCalKey: null,
      albumPostLufs: null,
      ...(activate ? {
        activeTrackId: activate.id,
        originalBuffer: activate.buffer,
        fileInfo: activate.info,
        ...freshTrackView,
      } : {}),
    };
  }),
  setActiveTrack: (id) => set((s) => {
    const track = s.tracks.find((t) => t.id === id);
    if (!track || id === s.activeTrackId) return {};
    return {
      activeTrackId: id,
      originalBuffer: track.buffer,
      fileInfo: track.info,
      ...freshTrackView,
    };
  }),
  updateTrack: (id, patch) => set((s) => ({
    tracks: s.tracks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
  })),
  setAlbumMode: (v) => set({ albumMode: v, paramsDirty: true }),
  setAlbumLufs: (v) => set({ albumLufs: v }),
  setAlbumCalibration: (key, postLufs) => set({ albumCalKey: key, albumPostLufs: postLufs }),
  setAlbumCalibrating: (msg) => set({ albumCalibrating: msg }),
  setOriginalBuffer: (buffer, info) => set({
    originalBuffer: buffer, fileInfo: info,
    ...freshTrackView,
  }),
  setProcessedBuffer: (buffer) => set({ processedBuffer: buffer, paramsDirty: false }),
  setIsProcessing: (v) => set({ isProcessing: v }),
  setIsPlaying: (v) => set({ isPlaying: v }),
  setPlaybackPosition: (v) => set({ playbackPosition: v }),
  setListenMode: (mode) => set({ listenMode: mode }),
  setWasmReady: (v) => set({ wasmReady: v }),
  // Any params change means the current settings may no longer exactly
  // match the setup they came from, so the active-setup marker clears;
  // paths that apply a setup re-set it afterwards.
  //
  // Also reconciles processorEnabled from any processor whose params
  // carry a top-level "enabled" key (currently the Bass/Treble Exciters,
  // which self-report bypass state through the params mirror the way the
  // EQ's bands report band.N.enabled). Every mutation path — setParam,
  // setProcessorEnabled, applyCustomPreset, applyXraySetup,
  // computeXrayStages, engine init — funnels through
  // setParams(await engine.getParams()), so this is the one place that
  // keeps the store's bypass state from ever diverging from the engine's:
  // a custom preset that turns an exciter on writes "enabled: 1" into
  // its params, and that alone is enough for the panel switch, the strip
  // chip, and the X-Ray lane to agree, with no separate wiring needed.
  // Preserves object identity when nothing changed, so this doesn't
  // trigger renders/key churn on every unrelated param edit.
  setParams: (params) => set((s) => {
    let enabledPatch: Record<string, boolean> | null = null;
    for (const [proc, procParams] of Object.entries(params)) {
      if (!('enabled' in procParams)) continue;
      const on = procParams.enabled > 0.5;
      if (s.processorEnabled[proc] !== on) {
        enabledPatch = { ...(enabledPatch ?? s.processorEnabled), [proc]: on };
      }
    }
    return {
      params, paramsDirty: true, xrayActiveSetupId: null,
      ...(enabledPatch ? { processorEnabled: enabledPatch } : {}),
    };
  }),
  setMeters: (m) => set({ meters: m }),
  setProcessorEnabledState: (name, enabled) => set((s) => ({
    processorEnabled: { ...s.processorEnabled, [name]: enabled },
  })),
  setProcessorNames: (names) => set({ processorNames: names }),
  setLoudnessMatch: (v) => set({ loudnessMatch: v }),
  setMatchGainDB: (v) => set({ matchGainDB: v }),
  setIsAnalyzing: (v) => set({ isAnalyzing: v }),
  setParamsEdited: (v) => set({ paramsEdited: v }),
  setParamsDirty: (v) => set({ paramsDirty: v }),
  setAnalysis: (a) => set({ analysis: a }),
  setProcessedAnalysis: (a) => set({ processedAnalysis: a }),
  setRecipeOptions: (o) => set({ recipeOptions: o }),
  setChoice: (patch) => set((s) => ({ choice: { ...s.choice, ...patch }, customPreset: null })),
  setAppliedRecipe: (r, key) => set({ recipe: r, recipeKey: key }),
  setCustomPreset: (name) => set({ customPreset: name }),
  applySettings: (params, enabled) => set({
    params, processorEnabled: enabled, paramsDirty: true, xrayActiveSetupId: null,
  }),
  setCustomPresets: (p) => set({ customPresets: p }),
  setLoading: (v) => set({ loading: v }),
  setError: (e) => set({ error: e }),
  requestSeek: (position) => set({ seekRequest: position }),
  clearSeekRequest: () => set({ seekRequest: null }),
  setXrayOpen: (v) => set({ xrayOpen: v }),
  setXrayStages: (s, key) => set({ xrayStages: s, xrayStagesKey: key }),
  setXrayBusy: (v) => set({ xrayBusy: v }),
  addXraySetup: (setup) => set((s) => ({
    xraySetups: [...s.xraySetups, setup],
    xrayActiveSetupId: setup.id,
  })),
  deleteXraySetup: (id) => set((s) => ({
    xraySetups: s.xraySetups.filter((x) => x.id !== id),
    xrayActiveSetupId: s.xrayActiveSetupId === id ? null : s.xrayActiveSetupId,
  })),
  setXrayActiveSetup: (id) => set({ xrayActiveSetupId: id }),
  reset: () => set({
    tracks: [],
    activeTrackId: null,
    albumMode: false,
    albumLufs: null,
    albumCalKey: null,
    albumPostLufs: null,
    albumCalibrating: null,
    originalBuffer: null,
    processedBuffer: null,
    fileInfo: null,
    isProcessing: false,
    isPlaying: false,
    playbackPosition: 0,
    analysis: null,
    processedAnalysis: null,
    isAnalyzing: false,
    recipe: null,
    recipeKey: null,
    error: null,
    meters: {},
    matchGainDB: null,
    xrayOpen: false,
    xrayStages: null,
    xrayStagesKey: null,
    xrayBusy: false,
  }),
}));
