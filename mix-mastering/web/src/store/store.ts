import { create } from 'zustand';
import type {
  AnalysisResult, ProcessorParams, MeterData, StageSummary, Recipe, RecipeChoice, RecipeOptions, VariantSuggestion,
} from '../wasm/engine';
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

// Settings a processed buffer was rendered with (what the engine run
// actually applied), so live playback can bridge later edits.
export interface RenderedSettings {
  params: ProcessorParams;
  enabled: Record<string, boolean>;
}

/** Identity of what a render sounds like: its settings (keys sorted, so
 *  equal settings built in different workers match) and the track. */
export function renderKey(settings: RenderedSettings, trackId: string | null): string {
  const sorted = (o: Record<string, unknown>) => Object.keys(o).sort().map((k) => [k, o[k]]);
  return JSON.stringify({
    t: trackId,
    p: Object.keys(settings.params).sort().map((proc) => [proc, sorted(settings.params[proc])]),
    e: sorted(settings.enabled),
  });
}

// A finished render of the active track: everything a preview run
// produces, so showing it again needs no engine work. Playable as soon as
// the audio is there; its analysis (and the match gain from it) can
// follow (completeRender).
export interface CachedRender {
  key: string; // renderKey
  buffer: AudioBuffer;
  rendered: RenderedSettings;
  meters: MeterData;
  analysis: AnalysisResult | null;
  matchGainDB: number | null;
}

// One of the four versions being prepared (variantPool.ts): the
// renderKey of its settings once its recipe is built.
export interface VariantState {
  key: string | null;
  rendering: boolean;
  failed: boolean;
}

/** The render made with exactly these settings, if any. */
export function findRender(s: Pick<AppState, 'renders'>, key: string): CachedRender | undefined {
  return s.renders.find((r) => r.key === key);
}

// What the user is working on: one track, or an album. Chosen explicitly
// (start screen, "Make an album with this track") — never inferred from
// how many files happen to be loaded.
export type Workspace = 'track' | 'album';

// The album workflow: choose the release, get each track right, then
// balance the album as a whole.
export type AlbumStep = 'release' | 'tracks' | 'balance';

// One track's settings. The active track's live copy is in the global
// fields (params, processorEnabled, recipe, recipeKey, customPreset,
// paramsEdited) so every panel works on "the current track" unchanged;
// read any track's through trackSettingsOf, never t.settings directly.
export interface TrackSettings {
  params: ProcessorParams;
  enabled: Record<string, boolean>;
  recipe: Recipe | null;
  recipeKey: string | null;
  customPreset: string | null;
  paramsEdited: boolean;
  // Album only:
  style: string | null; // this track's style; null = the album's
  nudgeDB: number; // level nudge on top of the album loudness offset
  reviewed: boolean; // previewed in the Tracks step
}

export const emptyTrackSettings = (): TrackSettings => ({
  params: {}, enabled: {}, recipe: null, recipeKey: null, customPreset: null,
  paramsEdited: false, style: null, nudgeDB: 0, reviewed: false,
});

export interface AlbumTrack {
  id: string;
  name: string;
  buffer: AudioBuffer;
  info: AudioFileInfo;
  // Filled in by the background album analysis
  analysis: AnalysisResult | null;
  blocks: number[] | null; // BS.1770 gating blocks for album integration
  settings: TrackSettings;
}

// A track measured through its own chain (limiter off, no loudness
// offset): the basis of the album offset, and of the balance view. Cached
// under the track's settings key so editing one track re-measures only it.
export interface TrackCalibration {
  key: string;
  blocks: number[];
  lufs: number;
  analysis: AnalysisResult;
}

export interface AppState {
  workspace: Workspace | null; // null = start screen
  albumStep: AlbumStep;
  // Loaded tracks (one in the track workspace). The single-track fields
  // below always mirror the active track, so the whole single-file UI
  // works unchanged.
  tracks: AlbumTrack[];
  activeTrackId: string | null;
  // Album: on = one shared loudness offset from the album's integrated
  // loudness, keeping the level differences between tracks; off = each
  // track brought to the target on its own.
  albumMode: boolean;
  // Album loudness of the source tracks (informational).
  albumLufs: number | null;
  // Per-track calibration and the album loudness integrated from it.
  albumCal: Record<string, TrackCalibration>;
  albumPostLufs: number | null;
  albumCalibrating: string | null; // progress message while calibrating
  // Bumped whenever any track's settings change outside the active
  // track's live fields (other tracks' recipes, nudges): those change the
  // album offset, so the active preview must re-render too.
  albumRev: number;
  // Index of the track whose transition into the next is playing.
  transitionPlaying: number | null;

  // Audio
  originalBuffer: AudioBuffer | null;
  processedBuffer: AudioBuffer | null;
  // Settings processedBuffer was rendered with, so live playback can
  // bridge EQ and width edits until the next render lands
  // (audio/livePreview.ts).
  processedSettings: RenderedSettings | null;
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

  // Track workspace: the four versions of the current choice (by variant
  // id), rendered in parallel by variantPool.ts, and the finished renders
  // (theirs, and the normal preview's when it made one of them) — so
  // picking a version while listening swaps buffers instead of
  // re-rendering. Plus the version the analysis suggests.
  variants: Record<string, VariantState>;
  renders: CachedRender[];
  variantSuggestion: VariantSuggestion | null;

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
  // Track workspace: work on this track instead (replaces the current
  // one). The release choice and a loaded saved preset carry over.
  openTrack: (track: AlbumTrack) => void;
  // Start an album with these tracks.
  startAlbum: (tracks: AlbumTrack[]) => void;
  // Add tracks to the album (from the track workspace: makes an album of
  // the current track plus these).
  addTracks: (tracks: AlbumTrack[]) => void;
  removeTrack: (id: string) => void;
  // Play order (album): move a track one place up (-1) or down (+1).
  moveTrack: (id: string, dir: -1 | 1) => void;
  closeSession: () => void;
  setAlbumStep: (step: AlbumStep) => void;
  setActiveTrack: (id: string) => void;
  updateTrack: (id: string, patch: Partial<Pick<AlbumTrack, 'analysis' | 'blocks'>>) => void;
  // Change any track's settings (the active one's live fields included).
  setTrackSettings: (id: string, patch: Partial<TrackSettings>) => void;
  markReviewed: (id: string) => void;
  setAlbumMode: (v: boolean) => void;
  setAlbumLufs: (v: number | null) => void;
  setTrackCalibration: (id: string, cal: TrackCalibration) => void;
  setAlbumPostLufs: (v: number | null) => void;
  setAlbumCalibrating: (msg: string | null) => void;
  setTransitionPlaying: (i: number | null) => void;
  setOriginalBuffer: (buffer: AudioBuffer, info: AudioFileInfo) => void;
  setProcessedBuffer: (buffer: AudioBuffer, rendered: RenderedSettings) => void;
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
  // Changing the choice leaves any loaded custom preset (in an album: on
  // every track, since the choice is the album's).
  setChoice: (patch: Partial<RecipeChoice>) => void;
  setAppliedRecipe: (r: Recipe | null, key: string | null) => void;
  setCustomPreset: (name: string | null) => void;
  // Replace all params and bypass state at once (recipe / custom preset).
  applySettings: (params: ProcessorParams, enabled: Record<string, boolean>) => void;
  setCustomPresets: (p: CustomPreset[]) => void;
  // A new set of versions is being rendered: drops the previous renders.
  startVariants: (ids: string[]) => void;
  setVariant: (id: string, patch: Partial<VariantState>) => void;
  addRender: (r: CachedRender) => void;
  // A render's analysis arrived (shown too if the render is).
  completeRender: (key: string, analysis: AnalysisResult, matchGainDB: number | null) => void;
  setVariantSuggestion: (v: VariantSuggestion | null) => void;
  clearVariants: () => void;
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
}

// View-state reset applied whenever the active audio changes (new file or
// track switch); analysis is re-established by the automatic analysis.
const freshTrackView = {
  processedBuffer: null,
  processedSettings: null,
  processedAnalysis: null,
  analysis: null,
  meters: {},
  listenMode: 'original',
  matchGainDB: null,
  paramsDirty: true,
  isPlaying: false,
  playbackPosition: 0,
  xrayStages: null,
  xrayStagesKey: null,
} as const;

// The live settings fields, from a track's settings.
function liveFields(st: TrackSettings) {
  return {
    params: st.params,
    processorEnabled: st.enabled,
    recipe: st.recipe,
    recipeKey: st.recipeKey,
    customPreset: st.customPreset,
    paramsEdited: st.paramsEdited,
  };
}

/** A track's settings; for the active track, its live copy. */
export function trackSettingsOf(s: AppState, t: AlbumTrack): TrackSettings {
  if (t.id !== s.activeTrackId) return t.settings;
  return {
    ...t.settings,
    params: s.params,
    enabled: s.processorEnabled,
    recipe: s.recipe,
    recipeKey: s.recipeKey,
    customPreset: s.customPreset,
    paramsEdited: s.paramsEdited,
  };
}

// Tracks with the active track's live settings written back into it.
function persistActive(s: AppState): AlbumTrack[] {
  return s.tracks.map((t) => (t.id === s.activeTrackId ? { ...t, settings: trackSettingsOf(s, t) } : t));
}

// Fields that make a track the active one.
function activate(t: AlbumTrack) {
  return {
    activeTrackId: t.id,
    originalBuffer: t.buffer,
    fileInfo: t.info,
    ...freshTrackView,
    analysis: t.analysis, // already analyzed tracks don't re-analyze
    ...liveFields(t.settings),
  };
}

// Album bookkeeping reset whenever the set of tracks changes.
const freshAlbum = {
  albumLufs: null,
  albumPostLufs: null,
  albumCalibrating: null,
  transitionPlaying: null,
} as const;

export const useStore = create<AppState>((set) => ({
  workspace: null,
  albumStep: 'release',
  tracks: [],
  activeTrackId: null,
  albumMode: true,
  albumLufs: null,
  albumCal: {},
  albumPostLufs: null,
  albumCalibrating: null,
  albumRev: 0,
  transitionPlaying: null,
  originalBuffer: null,
  processedBuffer: null,
  processedSettings: null,
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
  choice: { style: '', destination: 'streaming', fix: true, variant: 'clean' },
  recipe: null,
  recipeKey: null,
  customPreset: null,
  paramsEdited: false,
  customPresets: loadCustomPresets(),
  variants: {},
  renders: [],
  variantSuggestion: null,
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

  openTrack: (track) => set((s) => {
    // Carry over a loaded saved preset (with its edits); a recipe is
    // rebuilt for the new track's own analysis.
    const settings: TrackSettings = s.customPreset !== null
      ? { ...emptyTrackSettings(), params: s.params, enabled: s.processorEnabled, customPreset: s.customPreset }
      : { ...emptyTrackSettings(), params: s.params, enabled: s.processorEnabled };
    const t = { ...track, settings };
    return { workspace: 'track', tracks: [t], ...activate(t), ...freshAlbum, albumCal: {} };
  }),
  startAlbum: (newTracks) => set(() => {
    if (newTracks.length === 0) return {};
    const tracks = newTracks.map((t) => ({ ...t, settings: emptyTrackSettings() }));
    return {
      workspace: 'album', albumStep: 'release', albumMode: true, tracks,
      ...activate(tracks[0]), ...freshAlbum, albumCal: {},
    };
  }),
  addTracks: (newTracks) => set((s) => {
    const added = newTracks.map((t) => ({ ...t, settings: emptyTrackSettings() }));
    // A new album (from a single track) is in file name order like any
    // other; tracks added to an album go at the end, after the order the
    // user may have arranged.
    const tracks = [...persistActive(s), ...added];
    if (s.workspace === 'track') tracks.sort((a, b) => a.name.localeCompare(b.name));
    return {
      workspace: 'album',
      // From a single track the release is already chosen: go on with
      // the tracks.
      ...(s.workspace === 'track' ? { albumStep: 'tracks' as const, albumMode: true } : {}),
      tracks, ...freshAlbum, albumRev: s.albumRev + 1, paramsDirty: true,
    };
  }),
  removeTrack: (id) => set((s) => {
    const tracks = persistActive(s).filter((t) => t.id !== id);
    if (tracks.length === 0) return { tracks };
    const { [id]: _, ...albumCal } = s.albumCal;
    const base = { tracks, albumCal, ...freshAlbum, albumRev: s.albumRev + 1, paramsDirty: true };
    if (id !== s.activeTrackId) return base;
    const i = s.tracks.findIndex((t) => t.id === id);
    return { ...base, ...activate(tracks[Math.min(i, tracks.length - 1)]) };
  }),
  moveTrack: (id, dir) => set((s) => {
    const i = s.tracks.findIndex((t) => t.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= s.tracks.length) return {};
    const tracks = [...s.tracks];
    [tracks[i], tracks[j]] = [tracks[j], tracks[i]];
    return { tracks };
  }),
  closeSession: () => set({
    workspace: null, tracks: [], activeTrackId: null, originalBuffer: null, fileInfo: null,
    ...freshTrackView, ...freshAlbum, albumCal: {}, recipe: null, recipeKey: null,
    customPreset: null, paramsEdited: false, xrayOpen: false, xraySetups: [], xrayActiveSetupId: null,
  }),
  setAlbumStep: (step) => set({ albumStep: step }),
  setActiveTrack: (id) => set((s) => {
    const track = s.tracks.find((t) => t.id === id);
    if (!track || id === s.activeTrackId) return {};
    const tracks = persistActive(s);
    return { tracks, ...activate(tracks.find((t) => t.id === id)!) };
  }),
  updateTrack: (id, patch) => set((s) => ({
    tracks: s.tracks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
  })),
  setTrackSettings: (id, patch) => set((s) => {
    const tracks = s.tracks.map((t) => (t.id === id ? { ...t, settings: { ...t.settings, ...patch } } : t));
    const live: Partial<AppState> = {};
    if (id === s.activeTrackId) {
      if (patch.params) live.params = patch.params;
      if (patch.enabled) live.processorEnabled = patch.enabled;
      if ('recipe' in patch) live.recipe = patch.recipe!;
      if ('recipeKey' in patch) live.recipeKey = patch.recipeKey!;
      if ('customPreset' in patch) live.customPreset = patch.customPreset!;
      if ('paramsEdited' in patch) live.paramsEdited = patch.paramsEdited!;
    }
    // Only changes to what gets rendered make the preview stale.
    const audible = !!(patch.params || patch.enabled || 'nudgeDB' in patch);
    return {
      tracks, ...live,
      ...(audible ? { albumRev: s.albumRev + 1, paramsDirty: true, xrayActiveSetupId: null } : {}),
    };
  }),
  markReviewed: (id) => set((s) => ({
    tracks: s.tracks.map((t) => (t.id === id && !t.settings.reviewed
      ? { ...t, settings: { ...t.settings, reviewed: true } } : t)),
  })),
  setAlbumMode: (v) => set((s) => ({ albumMode: v, paramsDirty: true, albumRev: s.albumRev + 1 })),
  setAlbumLufs: (v) => set({ albumLufs: v }),
  setTrackCalibration: (id, cal) => set((s) => ({ albumCal: { ...s.albumCal, [id]: cal } })),
  setAlbumPostLufs: (v) => set({ albumPostLufs: v }),
  setAlbumCalibrating: (msg) => set({ albumCalibrating: msg }),
  setTransitionPlaying: (i) => set({ transitionPlaying: i }),
  setOriginalBuffer: (buffer, info) => set({
    originalBuffer: buffer, fileInfo: info,
    ...freshTrackView,
  }),
  setProcessedBuffer: (buffer, rendered) => set({ processedBuffer: buffer, processedSettings: rendered, paramsDirty: false }),
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
  setChoice: (patch) => set((s) => ({
    choice: { ...s.choice, ...patch },
    customPreset: null,
    tracks: s.workspace === 'album'
      ? s.tracks.map((t) => (t.settings.customPreset !== null
        ? { ...t, settings: { ...t.settings, customPreset: null } } : t))
      : s.tracks,
  })),
  setAppliedRecipe: (r, key) => set({ recipe: r, recipeKey: key }),
  setCustomPreset: (name) => set({ customPreset: name }),
  applySettings: (params, enabled) => set({
    params, processorEnabled: enabled, paramsDirty: true, xrayActiveSetupId: null,
  }),
  setCustomPresets: (p) => set({ customPresets: p }),
  startVariants: (ids) => set({
    variants: Object.fromEntries(ids.map((id) => [id, { key: null, rendering: true, failed: false }])),
    renders: [],
    variantSuggestion: null,
  }),
  setVariant: (id, patch) => set((s) => (s.variants[id]
    ? { variants: { ...s.variants, [id]: { ...s.variants[id], ...patch } } } : {})),
  addRender: (r) => set((s) => (findRender(s, r.key) ? {} : { renders: [...s.renders, r] })),
  completeRender: (key, analysis, matchGainDB) => set((s) => {
    const r = findRender(s, key);
    if (!r) return {};
    return {
      renders: s.renders.map((x) => (x === r ? { ...r, analysis, matchGainDB } : x)),
      ...(s.processedBuffer === r.buffer ? { processedAnalysis: analysis, matchGainDB } : {}),
    };
  }),
  setVariantSuggestion: (v) => set({ variantSuggestion: v }),
  clearVariants: () => set((s) => (Object.keys(s.variants).length === 0 && s.renders.length === 0
    ? {} : { variants: {}, renders: [], variantSuggestion: null })),
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
}));
