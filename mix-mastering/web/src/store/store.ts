import { create } from 'zustand';
import type { AnalysisResult, Recommendation, PresetInfo, ProcessorParams, MeterData } from '../wasm/engine';

export interface AudioFileInfo {
  name: string;
  duration: number;
  sampleRate: number;
  channels: number;
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
  processorEnabled: Record<string, boolean>;

  // Loudness-matched A/B: gain (dB) applied to processed playback so both
  // buffers compare at equal loudness.
  loudnessMatch: boolean;
  matchGainDB: number | null;

  // Analysis of the original audio (runs automatically on file load);
  // recommendations always derive from this.
  analysis: AnalysisResult | null;
  // Analysis of the last processed result, for display only.
  processedAnalysis: AnalysisResult | null;
  isAnalyzing: boolean;
  recommendation: Recommendation | null;
  // Whether the current recommendation was derived from the active track's
  // analysis or the album aggregate.
  recommendationScope: 'track' | 'album';
  selectedTarget: string;
  // Target whose recommendations are currently applied to the engine;
  // cleared when a preset is applied or a new file is loaded.
  appliedTarget: string | null;
  // True when params were manually tweaked after the last preset or
  // recommendation apply — the settings no longer exactly match either.
  paramsEdited: boolean;

  // Presets
  presets: PresetInfo[];
  activePreset: string | null;

  // UI
  loading: boolean;
  error: string | null;
  paramsDirty: boolean;
  seekRequest: number | null;

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
  setLoudnessMatch: (v: boolean) => void;
  setMatchGainDB: (v: number | null) => void;
  setIsAnalyzing: (v: boolean) => void;
  setAppliedTarget: (t: string | null) => void;
  setParamsEdited: (v: boolean) => void;
  setAnalysis: (a: AnalysisResult | null) => void;
  setProcessedAnalysis: (a: AnalysisResult | null) => void;
  setRecommendationScope: (s: 'track' | 'album') => void;
  setRecommendation: (r: Recommendation | null) => void;
  setSelectedTarget: (t: string) => void;
  setPresets: (p: PresetInfo[]) => void;
  setActivePreset: (name: string | null) => void;
  setLoading: (v: boolean) => void;
  setError: (e: string | null) => void;
  requestSeek: (position: number) => void;
  clearSeekRequest: () => void;
  reset: () => void;
}

// View-state reset applied whenever the active audio changes (new file or
// track switch); analysis is re-established by the automatic analysis.
const freshTrackView = {
  processedBuffer: null,
  processedAnalysis: null,
  analysis: null,
  recommendation: null,
  meters: {},
  matchGainDB: null,
  paramsDirty: true,
  isPlaying: false,
  playbackPosition: 0,
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
  loudnessMatch: false,
  matchGainDB: null,
  analysis: null,
  processedAnalysis: null,
  isAnalyzing: false,
  recommendation: null,
  recommendationScope: 'track',
  selectedTarget: 'neutral',
  appliedTarget: null,
  paramsEdited: false,
  presets: [],
  activePreset: null,
  loading: true,
  error: null,
  paramsDirty: true,
  seekRequest: null,

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
        appliedTarget: null,
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
    originalBuffer: buffer, fileInfo: info, appliedTarget: null,
    ...freshTrackView,
  }),
  setProcessedBuffer: (buffer) => set({ processedBuffer: buffer, paramsDirty: false }),
  setIsProcessing: (v) => set({ isProcessing: v }),
  setIsPlaying: (v) => set({ isPlaying: v }),
  setPlaybackPosition: (v) => set({ playbackPosition: v }),
  setListenMode: (mode) => set({ listenMode: mode }),
  setWasmReady: (v) => set({ wasmReady: v }),
  setParams: (params) => set({ params, paramsDirty: true }),
  setMeters: (m) => set({ meters: m }),
  setProcessorEnabledState: (name, enabled) => set((s) => ({
    processorEnabled: { ...s.processorEnabled, [name]: enabled },
  })),
  setLoudnessMatch: (v) => set({ loudnessMatch: v }),
  setMatchGainDB: (v) => set({ matchGainDB: v }),
  setIsAnalyzing: (v) => set({ isAnalyzing: v }),
  setAppliedTarget: (t) => set({ appliedTarget: t }),
  setParamsEdited: (v) => set({ paramsEdited: v }),
  setAnalysis: (a) => set({ analysis: a }),
  setProcessedAnalysis: (a) => set({ processedAnalysis: a }),
  setRecommendationScope: (s) => set({ recommendationScope: s }),
  setRecommendation: (r) => set({ recommendation: r }),
  setSelectedTarget: (t) => set({ selectedTarget: t }),
  setPresets: (p) => set({ presets: p }),
  setActivePreset: (name) => set({ activePreset: name }),
  setLoading: (v) => set({ loading: v }),
  setError: (e) => set({ error: e }),
  requestSeek: (position) => set({ seekRequest: position }),
  clearSeekRequest: () => set({ seekRequest: null }),
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
    recommendation: null,
    appliedTarget: null,
    activePreset: null,
    error: null,
    meters: {},
    matchGainDB: null,
  }),
}));
