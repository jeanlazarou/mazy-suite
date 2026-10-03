import { useCallback, useEffect } from 'react';
import { engine } from '../wasm/engine';
import { audioBufferToFloat32Array, float32ArrayToAudioBuffer, encodeWav } from '../audio/context';
import { createZip } from '../audio/zip';
import type { ZipEntry } from '../audio/zip';
import { useStore } from '../store/store';
import { stopPlayback } from './usePlayback';
import type { CustomPreset } from '../audio/customPresets';

// Chain X-Ray resolutions: envelope buckets (high, for horizontal zoom)
// and spectrogram time columns.
const XRAY_BUCKETS = 4096;
const XRAY_SPEC_COLS = 800;

// Guards against overlapping computeXrayStages runs (e.g. one triggered
// while params were still loading, another right after they arrived):
// only the result of the most recently *started* run is ever committed,
// so a slow stale run can't clobber a frester one that finishes first.
let xrayRunSeq = 0;

// Engine start-up runs once per app, not once per component using this
// hook: its final setParams(engine.getParams()) would otherwise, from a
// component mounted later (the master panel appears once an album is
// analyzed), overwrite settings applied in the meantime with whatever the
// engine held at that moment.
let engineInitStarted = false;

// Same idea for recipe builds: a choice clicked while a previous build is
// still in flight must win, and the older build must stop applying.
let recipeSeq = 0;

// Identity of what the recipe depends on: the choice, and the analysis
// the fixes come from (the whole album's, or the active track's).
function recipeKeyFor(s: ReturnType<typeof useStore.getState>): string {
  const scope = s.tracks.length > 1
    ? `album:${s.tracks.map((t) => t.id).join(',')}`
    : `track:${s.activeTrackId}`;
  return JSON.stringify({ c: s.choice, scope });
}

export function useAudioEngine() {
  // Individual selectors only — this hook is instantiated by most panels,
  // so a whole-store subscription here would re-render the entire app on
  // every store change (including playback-position ticks). Zustand action
  // references are stable, so selecting them never triggers re-renders.
  const wasmReady = useStore((s) => s.wasmReady);
  const originalBuffer = useStore((s) => s.originalBuffer);
  const setWasmReady = useStore((s) => s.setWasmReady);
  const setLoading = useStore((s) => s.setLoading);
  const setError = useStore((s) => s.setError);
  const setParams = useStore((s) => s.setParams);
  const setMeters = useStore((s) => s.setMeters);
  const setMatchGainDB = useStore((s) => s.setMatchGainDB);
  const setProcessedBuffer = useStore((s) => s.setProcessedBuffer);
  const setIsProcessing = useStore((s) => s.setIsProcessing);
  const setAnalysis = useStore((s) => s.setAnalysis);
  const setProcessedAnalysis = useStore((s) => s.setProcessedAnalysis);
  const setIsAnalyzing = useStore((s) => s.setIsAnalyzing);
  const setParamsEdited = useStore((s) => s.setParamsEdited);
  const setProcessorEnabledState = useStore((s) => s.setProcessorEnabledState);
  const setProcessorNames = useStore((s) => s.setProcessorNames);

  useEffect(() => {
    if (engineInitStarted) return;
    engineInitStarted = true;
    engine.init().then(async () => {
      setWasmReady(true);
      setLoading(false);
      useStore.getState().setRecipeOptions(await engine.getRecipeOptions());
      setParams(await engine.getParams());
      setProcessorNames(await engine.getProcessorNames());
    }).catch((err) => {
      setError(`Failed to load WASM: ${err.message}`);
      setLoading(false);
    });
  }, []);

  // Re-apply store params and bypass state to a freshly initialized engine.
  const applyEngineState = async () => {
    const { params, processorEnabled } = useStore.getState();
    for (const [proc, procParams] of Object.entries(params)) {
      for (const [param, value] of Object.entries(procParams)) {
        await engine.setParam(proc, param, value);
      }
    }
    for (const [name, enabled] of Object.entries(processorEnabled)) {
      await engine.setProcessorEnabled(name, enabled);
    }
  };

  // Album loudness must be measured through the current chain (the chain
  // changes loudness), so run every track once with the limiter and
  // normalizer off and integrate the gating blocks as one program. Cached
  // per settings key; re-runs only when settings or the track set change.
  const ensureAlbumCalibration = async (): Promise<number | null> => {
    const s = useStore.getState();
    const key = JSON.stringify({
      p: s.params,
      e: Object.entries(s.processorEnabled).sort(),
      t: s.tracks.map((t) => t.id),
    });
    if (s.albumCalKey === key && s.albumPostLufs !== null) return s.albumPostLufs;

    const allBlocks: number[] = [];
    for (let i = 0; i < s.tracks.length; i++) {
      useStore.getState().setAlbumCalibrating(
        `Measuring album loudness with current settings (${i + 1}/${s.tracks.length})…`);
      const t = s.tracks[i];
      const ch = t.buffer.numberOfChannels;
      const sr = t.buffer.sampleRate;
      await engine.initEngine(sr, ch);
      await applyEngineState();
      await engine.setProcessorEnabled('Loudness Normalizer', false);
      await engine.setProcessorEnabled('Limiter', false);
      await engine.setParam('Gain', 'gain_db', 0);
      const processed = await engine.processBuffer(
        audioBufferToFloat32Array(t.buffer), ch, sr);
      const blocks = await engine.measureBlocks(processed, ch, sr);
      allBlocks.push(...blocks);
    }
    useStore.getState().setAlbumCalibrating(null);
    if (allBlocks.length === 0) return null;
    const postLufs = await engine.gatedLoudness(allBlocks);
    useStore.getState().setAlbumCalibration(key, postLufs);
    return postLufs;
  };

  // Prepare the engine for a full-chain run under the current settings:
  // init at the audio's rate, apply params/bypass, and configure album
  // loudness (one shared Gain offset instead of per-track normalization).
  const prepareEngineRun = async (channels: number, sampleRate: number) => {
    const { albumMode, tracks } = useStore.getState();
    let albumOffsetDB: number | null = null;
    if (albumMode && tracks.length > 1) {
      const postLufs = await ensureAlbumCalibration();
      if (postLufs !== null && postLufs > -100) {
        const target = useStore.getState().params['Loudness Normalizer']?.target_lufs ?? -14;
        albumOffsetDB = target - postLufs;
      }
    }

    await engine.initEngine(sampleRate, channels);
    await applyEngineState();

    if (albumOffsetDB !== null) {
      await engine.setProcessorEnabled('Loudness Normalizer', false);
      await engine.setParam('Gain', 'gain_db', albumOffsetDB);
    } else {
      await engine.setParam('Gain', 'gain_db', 0);
    }
  };

  // Full processing pass: chain + meters + result analysis + match gain.
  const runProcess = async () => {
    const originalBuffer = useStore.getState().originalBuffer;
    if (!wasmReady || !originalBuffer) return;

    // Settings this run is made with. The preview updates automatically,
    // so settings (or the track) can change while a run is in flight; the
    // result must then not be marked current (or, for another track, not
    // be shown at all).
    const start = useStore.getState();
    const stillCurrent = () => {
      const now = useStore.getState();
      return now.params === start.params
        && now.processorEnabled === start.processorEnabled
        && now.albumMode === start.albumMode;
    };

    setIsProcessing(true);
    try {
      const channels = originalBuffer.numberOfChannels;
      const sampleRate = originalBuffer.sampleRate;
      await prepareEngineRun(channels, sampleRate);

      // Float32Array args are transferred to the worker, so interleave a
      // fresh copy per call.
      const processed = await engine.processBuffer(
        audioBufferToFloat32Array(originalBuffer), channels, sampleRate);
      if (useStore.getState().originalBuffer !== originalBuffer) return; // track switched
      const processedAudioBuffer = float32ArrayToAudioBuffer(processed, channels, sampleRate);

      setProcessedBuffer(processedAudioBuffer);
      if (!stillCurrent()) useStore.getState().setParamsDirty(true);
      setMeters(await engine.getMeters());

      // Analyze the result for display (the recipe's fixes stay pinned to
      // the original's analysis).
      const processedAnalysis = await engine.inspectBuffer(
        audioBufferToFloat32Array(processedAudioBuffer), channels, sampleRate);
      setProcessedAnalysis(processedAnalysis);

      // Match gain for loudness-matched A/B playback, from the two analyses.
      const originalLufs = useStore.getState().analysis?.loudness.integrated_lufs
        ?? await engine.measureLoudness(
          audioBufferToFloat32Array(originalBuffer), channels, sampleRate);
      const processedLufs = processedAnalysis.loudness.integrated_lufs;
      if (originalLufs > -100 && processedLufs > -100) {
        setMatchGainDB(originalLufs - processedLufs);
      } else {
        setMatchGainDB(null);
      }
    } catch (err: any) {
      setError(`Processing failed: ${err.message}`);
    } finally {
      useStore.getState().setAlbumCalibrating(null);
      setIsProcessing(false);
    }
  };

  const processAudio = useCallback(() => runProcess(), [wasmReady]);

  // Settings identity for the X-ray stage capture: the stages are valid
  // only for the params/bypass/track they were computed under.
  const xraySettingsKey = () => {
    const s = useStore.getState();
    return JSON.stringify({
      p: s.params,
      e: Object.entries(s.processorEnabled).sort(),
      t: s.activeTrackId,
      a: s.albumMode,
    });
  };

  // Lean stage-capture pass for the Chain X-Ray view: chain + envelope
  // and spectrogram summaries only — no processed buffer, no result
  // analysis, no match gain. Refreshes the active setup's snapshot when
  // the capture corresponds to a just-applied setup.
  const computeXrayStages = useCallback(async () => {
    const originalBuffer = useStore.getState().originalBuffer;
    if (!wasmReady || !originalBuffer) return;
    const mySeq = ++xrayRunSeq;
    const { setXrayBusy, setXrayStages } = useStore.getState();

    setXrayBusy(true);
    try {
      const channels = originalBuffer.numberOfChannels;
      const sampleRate = originalBuffer.sampleRate;
      // prepareEngineRun may be the very first call to touch the WASM
      // engine (loading a file only runs analysis, not the chain), in
      // which case it initializes fresh engine-side defaults rather than
      // applying anything from (still-empty) store params.
      await prepareEngineRun(channels, sampleRate);
      const res = await engine.processBufferStages(
        audioBufferToFloat32Array(originalBuffer), channels, sampleRate,
        XRAY_BUCKETS, XRAY_SPEC_COLS);
      if (mySeq !== xrayRunSeq) return; // superseded by a newer run
      // Sync the store from the engine's actual post-run state *before*
      // computing the settings key, so the key (and any setup saved from
      // it) always matches what was really processed — never a stale or
      // still-empty params snapshot from before the engine existed.
      setParams(await engine.getParams());
      setXrayStages(res.stages, xraySettingsKey());
      setMeters(await engine.getMeters());
    } catch (err: any) {
      if (mySeq === xrayRunSeq) setError(`Chain X-Ray failed: ${err.message}`);
    } finally {
      useStore.getState().setAlbumCalibrating(null);
      if (mySeq === xrayRunSeq) useStore.getState().setXrayBusy(false);
    }
  }, [wasmReady]);

  // Open the Chain X-Ray view, for the given album track (made active) or
  // the current one. The view itself triggers stage computation whenever
  // the settings key changes, so nothing is computed here.
  const openChainXray = useCallback((trackId?: string) => {
    stopPlayback();
    const st = useStore.getState();
    if (trackId && trackId !== st.activeTrackId) {
      st.setActiveTrack(trackId);
    }
    useStore.getState().setXrayOpen(true);
  }, []);

  // Apply a saved setup's params and bypass state. When the setup carries
  // a stage capture for the current track, the lanes are restored from it
  // instantly (the capture was made under exactly these settings), so
  // flipping between setups is an immediate visual A/B — no reprocessing.
  const applyXraySetup = useCallback(async (setupId: string) => {
    const setup = useStore.getState().xraySetups.find((x) => x.id === setupId);
    if (!setup) return;
    for (const [proc, procParams] of Object.entries(setup.params)) {
      for (const [param, value] of Object.entries(procParams)) {
        await engine.setParam(proc, param, value);
      }
    }
    for (const [name, enabled] of Object.entries(setup.enabled)) {
      useStore.getState().setProcessorEnabledState(name, enabled);
      await engine.setProcessorEnabled(name, enabled);
    }
    setParams(await engine.getParams());
    // setParams cleared the marker; this is an exact setup application.
    useStore.getState().setXrayActiveSetup(setupId);
    if (setup.stages && setup.stagesKey === xraySettingsKey()) {
      useStore.getState().setXrayStages(setup.stages, setup.stagesKey);
      if (setup.meters) setMeters(setup.meters);
    }
  }, []);

  // Snapshot the current settings (and stage capture, for diffing) as a
  // named setup.
  const saveXraySetup = useCallback((name: string) => {
    const s = useStore.getState();
    const fresh = s.xrayStagesKey === xraySettingsKey();
    s.addXraySetup({
      id: `setup-${Date.now()}`,
      name,
      trackId: s.activeTrackId,
      params: s.params,
      enabled: { ...s.processorEnabled },
      stages: fresh ? s.xrayStages : null,
      meters: fresh ? s.meters : null,
      stagesKey: fresh ? s.xrayStagesKey : null,
    });
  }, []);

  // Build the settings for the current choice and apply them — all params
  // and bypass states, so nothing is left over from earlier choices.
  // No-op while a custom preset is loaded, before the analysis the fixes
  // depend on is available, or when the applied recipe is already current.
  const syncRecipe = useCallback(async () => {
    const s = useStore.getState();
    if (s.customPreset !== null) return;
    let analyses;
    if (s.tracks.length > 1) {
      if (!s.tracks.every((t) => t.analysis)) return;
      analyses = s.tracks.map((t) => t.analysis!);
    } else {
      if (!s.analysis) return;
      analyses = [s.analysis];
    }
    const key = recipeKeyFor(s);
    if (key === s.recipeKey) return;

    const mySeq = ++recipeSeq;
    const r = await engine.buildRecipe(s.choice, analyses);
    if (mySeq !== recipeSeq) return;
    if ('error' in r) {
      setError(`Settings: ${r.error}`);
      return;
    }
    // The store is the source of truth (every run re-initializes the
    // engine from it); the engine is updated too so getParams-based paths
    // agree.
    useStore.getState().applySettings(r.processors, r.enabled);
    useStore.getState().setAppliedRecipe(r, key);
    setParamsEdited(false);
    for (const [proc, procParams] of Object.entries(r.processors)) {
      for (const [param, value] of Object.entries(procParams)) {
        if (mySeq !== recipeSeq) return;
        await engine.setParam(proc, param, value);
      }
    }
    for (const [name, enabled] of Object.entries(r.enabled)) {
      if (mySeq !== recipeSeq) return;
      await engine.setProcessorEnabled(name, enabled);
    }
  }, []);

  const analyzeAudio = useCallback(async () => {
    if (!wasmReady || !originalBuffer) return;

    const channels = originalBuffer.numberOfChannels;
    const sampleRate = originalBuffer.sampleRate;

    setIsAnalyzing(true);
    try {
      const result = await engine.analyzeBuffer(
        audioBufferToFloat32Array(originalBuffer), channels, sampleRate);
      setAnalysis(result);

      // Share the result with the album track cache so the background
      // album pipeline doesn't analyze the active track a second time.
      const { activeTrackId, updateTrack } = useStore.getState();
      if (activeTrackId) {
        updateTrack(activeTrackId, { analysis: result });
      }

    } catch (err: any) {
      setError(`Analysis failed: ${err.message}`);
    } finally {
      setIsAnalyzing(false);
    }
  }, [wasmReady, originalBuffer]);

  // Master every track with the current settings (album offset included)
  // and download the whole set as one zip — no per-track clicking, and no
  // risk of stale files exported under older settings.
  const exportAlbum = useCallback(async () => {
    const { tracks, albumMode } = useStore.getState();
    if (!wasmReady || tracks.length === 0) return;

    setIsProcessing(true);
    try {
      let albumOffsetDB: number | null = null;
      if (albumMode && tracks.length > 1) {
        const postLufs = await ensureAlbumCalibration();
        if (postLufs !== null && postLufs > -100) {
          const target = useStore.getState().params['Loudness Normalizer']?.target_lufs ?? -14;
          albumOffsetDB = target - postLufs;
        }
      }

      const entries: ZipEntry[] = [];
      for (let i = 0; i < tracks.length; i++) {
        const t = tracks[i];
        useStore.getState().setAlbumCalibrating(`Exporting ${i + 1}/${tracks.length}: ${t.name}…`);
        const ch = t.buffer.numberOfChannels;
        const sr = t.buffer.sampleRate;
        await engine.initEngine(sr, ch);
        await applyEngineState();
        if (albumOffsetDB !== null) {
          await engine.setProcessorEnabled('Loudness Normalizer', false);
          await engine.setParam('Gain', 'gain_db', albumOffsetDB);
        } else {
          await engine.setParam('Gain', 'gain_db', 0);
        }
        const processed = await engine.processBuffer(
          audioBufferToFloat32Array(t.buffer), ch, sr);
        entries.push({
          name: t.name.replace(/\.[^.]+$/, '') + '_mastered.wav',
          data: encodeWav(processed, ch, sr),
        });
      }

      const url = URL.createObjectURL(createZip(entries));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'album_mastered.zip';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(`Album export failed: ${err.message}`);
    } finally {
      useStore.getState().setAlbumCalibrating(null);
      setIsProcessing(false);
    }
  }, [wasmReady]);

  const setParam = useCallback(async (processor: string, param: string, value: number) => {
    await engine.setParam(processor, param, value);
    setParams(await engine.getParams());
    // Settings no longer exactly match the applied recipe/preset.
    setParamsEdited(true);
  }, []);

  const setProcessorEnabled = useCallback(async (name: string, enabled: boolean) => {
    setProcessorEnabledState(name, enabled);
    await engine.setProcessorEnabled(name, enabled);
    // Bypass changes affect the output; flag for reprocessing.
    setParams(await engine.getParams());
    setParamsEdited(true);
  }, []);

  // Custom presets are saved locally (see audio/customPresets.ts) — the
  // Go engine has no way to look one up by name the way it does built-in
  // presets, so this replays its param map directly. While one is loaded
  // the style/destination choice isn't applied; picking a choice again
  // leaves it (store.setChoice).
  const applyCustomPreset = useCallback(async (preset: CustomPreset) => {
    recipeSeq++; // cancel any recipe still being applied
    useStore.getState().setCustomPreset(preset.name);
    useStore.getState().setAppliedRecipe(null, null);
    for (const [proc, procParams] of Object.entries(preset.processors)) {
      for (const [param, value] of Object.entries(procParams)) {
        await engine.setParam(proc, param, value);
      }
    }
    setParams(await engine.getParams());
    setParamsEdited(false);
  }, []);

  // Drop manual edits: rebuild the recipe for the current choice.
  const resetToRecipe = useCallback(() => {
    useStore.getState().setAppliedRecipe(useStore.getState().recipe, null);
  }, []);

  return {
    processAudio,
    openChainXray,
    computeXrayStages,
    xraySettingsKey,
    applyXraySetup,
    saveXraySetup,
    analyzeAudio,
    syncRecipe,
    resetToRecipe,
    exportAlbum,
    setParam,
    setProcessorEnabled,
    applyCustomPreset,
    isReady: wasmReady,
  };
}
