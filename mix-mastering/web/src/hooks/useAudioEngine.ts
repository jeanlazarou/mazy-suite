import { useCallback, useEffect } from 'react';
import { engine } from '../wasm/engine';
import { audioBufferToFloat32Array, float32ArrayToAudioBuffer, encodeWav } from '../audio/context';
import { createZip } from '../audio/zip';
import type { ZipEntry } from '../audio/zip';
import { useStore } from '../store/store';
import { stopPlayback } from './usePlayback';

// Chain X-Ray resolutions: envelope buckets (high, for horizontal zoom)
// and spectrogram time columns.
const XRAY_BUCKETS = 4096;
const XRAY_SPEC_COLS = 800;

// Guards against overlapping computeXrayStages runs (e.g. one triggered
// while params were still loading, another right after they arrived):
// only the result of the most recently *started* run is ever committed,
// so a slow stale run can't clobber a frester one that finishes first.
let xrayRunSeq = 0;

export function useAudioEngine() {
  // Individual selectors only — this hook is instantiated by most panels,
  // so a whole-store subscription here would re-render the entire app on
  // every store change (including playback-position ticks). Zustand action
  // references are stable, so selecting them never triggers re-renders.
  const wasmReady = useStore((s) => s.wasmReady);
  const originalBuffer = useStore((s) => s.originalBuffer);
  const selectedTarget = useStore((s) => s.selectedTarget);
  const setWasmReady = useStore((s) => s.setWasmReady);
  const setLoading = useStore((s) => s.setLoading);
  const setError = useStore((s) => s.setError);
  const setPresets = useStore((s) => s.setPresets);
  const setParams = useStore((s) => s.setParams);
  const setMeters = useStore((s) => s.setMeters);
  const setMatchGainDB = useStore((s) => s.setMatchGainDB);
  const setProcessedBuffer = useStore((s) => s.setProcessedBuffer);
  const setIsProcessing = useStore((s) => s.setIsProcessing);
  const setAnalysis = useStore((s) => s.setAnalysis);
  const setProcessedAnalysis = useStore((s) => s.setProcessedAnalysis);
  const setIsAnalyzing = useStore((s) => s.setIsAnalyzing);
  const setRecommendation = useStore((s) => s.setRecommendation);
  const setAppliedTarget = useStore((s) => s.setAppliedTarget);
  const setParamsEdited = useStore((s) => s.setParamsEdited);
  const setProcessorEnabledState = useStore((s) => s.setProcessorEnabledState);

  useEffect(() => {
    engine.init().then(async () => {
      setWasmReady(true);
      setLoading(false);
      setPresets(await engine.listPresets());
      setParams(await engine.getParams());
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

    setIsProcessing(true);
    try {
      const channels = originalBuffer.numberOfChannels;
      const sampleRate = originalBuffer.sampleRate;
      await prepareEngineRun(channels, sampleRate);

      // Float32Array args are transferred to the worker, so interleave a
      // fresh copy per call.
      const processed = await engine.processBuffer(
        audioBufferToFloat32Array(originalBuffer), channels, sampleRate);
      const processedAudioBuffer = float32ArrayToAudioBuffer(processed, channels, sampleRate);

      setProcessedBuffer(processedAudioBuffer);
      setMeters(await engine.getMeters());

      // Analyze the result for display (does not affect recommendations,
      // which stay pinned to the original's analysis).
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

  const fetchRecommendation = useCallback(async (target: string) => {
    const { analysis, tracks } = useStore.getState();
    const trackAnalyses = tracks.map((t) => t.analysis);
    if (tracks.length > 1 && trackAnalyses.every((a) => a !== null)) {
      // Album: recommend for the aggregate of all tracks.
      const rec = await engine.getAlbumRecommendations(trackAnalyses as any, target);
      if (!('error' in rec)) {
        setRecommendation(rec);
        useStore.getState().setRecommendationScope('album');
      }
      return;
    }
    // Single track: recommendations come from the reference analysis
    // cached in the bridge.
    if (!analysis) return;
    const rec = await engine.getRecommendations(target);
    if (!('error' in rec)) {
      setRecommendation(rec);
      useStore.getState().setRecommendationScope('track');
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

      // Read the target at completion time — the user may have changed it
      // while the analysis was running.
      const target = useStore.getState().selectedTarget;
      if (target) {
        await fetchRecommendation(target);
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
    // Settings no longer exactly match the applied preset/recommendation.
    setParamsEdited(true);
  }, []);

  const setProcessorEnabled = useCallback(async (name: string, enabled: boolean) => {
    setProcessorEnabledState(name, enabled);
    await engine.setProcessorEnabled(name, enabled);
    // Bypass changes affect the output; flag for reprocessing.
    setParams(await engine.getParams());
    setParamsEdited(true);
  }, []);

  const applyPreset = useCallback(async (name: string) => {
    await engine.applyPreset(name);
    setParams(await engine.getParams());
    // A preset is a fresh starting point: it replaces the previous base and
    // any target adjustments layered on top of it.
    setAppliedTarget(null);
    setParamsEdited(false);
    useStore.getState().setActivePreset(name);
  }, []);

  const applyRecommendations = useCallback(async (target: string) => {
    // Apply the recommendation currently on screen (track- or album-scoped)
    // by writing its params into the shared engine settings.
    const rec = useStore.getState().recommendation;
    if (!rec || rec.target !== target) return;
    for (const [proc, procParams] of Object.entries(rec.processors)) {
      for (const [param, value] of Object.entries(procParams)) {
        await engine.setParam(proc, param, value);
      }
    }
    setParams(await engine.getParams());
    // Recommendations layer on top of the current settings (the active
    // preset stays the base).
    setAppliedTarget(target);
    setParamsEdited(false);
  }, []);

  return {
    processAudio,
    openChainXray,
    computeXrayStages,
    xraySettingsKey,
    applyXraySetup,
    saveXraySetup,
    analyzeAudio,
    fetchRecommendation,
    exportAlbum,
    setParam,
    setProcessorEnabled,
    applyPreset,
    applyRecommendations,
    isReady: wasmReady,
  };
}
