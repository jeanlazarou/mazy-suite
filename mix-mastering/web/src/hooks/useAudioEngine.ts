import { useCallback, useEffect } from 'react';
import { engine } from '../wasm/engine';
import { audioBufferToFloat32Array, float32ArrayToAudioBuffer, encodeWav } from '../audio/context';
import { createZip } from '../audio/zip';
import type { ZipEntry } from '../audio/zip';
import {
  useStore, trackSettingsOf, type AppState, type AlbumTrack, type RenderedSettings, type TrackSettings,
} from '../store/store';
import { playTransition } from '../audio/transition';
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

// The style a track is built with: in an album, its own if set, else the
// album's.
function styleFor(s: AppState, st: TrackSettings): string {
  return s.workspace === 'album' && st.style !== null ? st.style : s.choice.style;
}

// Identity of what a track's recipe depends on: the choice (with the
// track's style) and the track, whose own analysis the fixes come from.
function recipeKeyFor(s: AppState, t: AlbumTrack, st: TrackSettings): string {
  return JSON.stringify({
    s: styleFor(s, st), d: s.choice.destination, f: s.choice.fix, t: t.id,
  });
}

// What album levels are computed from.
export type AlbumLevels = Pick<AppState, 'albumCal' | 'albumMode' | 'albumPostLufs' | 'recipeOptions' | 'choice'>;

// Album loudness target: the release destination's.
export function albumTargetLUFS(s: AlbumLevels): number {
  return s.recipeOptions?.destinations.find((d) => d.id === s.choice.destination)?.target_lufs ?? -14;
}

// Calibration identity of a track: what its chain renders.
function calKeyFor(t: AlbumTrack, st: TrackSettings): string {
  return JSON.stringify({ t: t.id, p: st.params, e: Object.entries(st.enabled).sort() });
}

/** Gain (dB) a track gets in the album, from its calibration: the shared
 *  offset (album loudness mode) or its own (off), plus its nudge. Null
 *  until the album is calibrated. */
export function albumTrackGainDB(s: AlbumLevels, t: AlbumTrack): number | null {
  const cal = s.albumCal[t.id];
  const target = albumTargetLUFS(s);
  const nudge = t.settings.nudgeDB;
  if (s.albumMode) {
    if (s.albumPostLufs === null || s.albumPostLufs < -100) return null;
    return target - s.albumPostLufs + nudge;
  }
  if (!cal || cal.lufs < -100) return null;
  return target - cal.lufs + nudge;
}

// Every track has settings to render with (a recipe or a saved preset).
export function albumSettingsReady(s: AppState): boolean {
  return s.tracks.length > 0 && s.tracks.every((t) => {
    const st = trackSettingsOf(s, t);
    return st.recipe !== null || st.customPreset !== null;
  });
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

  // Apply params and bypass state (the active track's unless given) to a
  // freshly initialized engine. Returns what was applied (for the live
  // preview).
  const applyEngineState = async (settings?: TrackSettings): Promise<RenderedSettings> => {
    const live = useStore.getState();
    const params = settings ? settings.params : live.params;
    const processorEnabled = settings ? settings.enabled : live.processorEnabled;
    const applied = { params, enabled: processorEnabled };
    for (const [proc, procParams] of Object.entries(params)) {
      for (const [param, value] of Object.entries(procParams)) {
        await engine.setParam(proc, param, value);
      }
    }
    for (const [name, enabled] of Object.entries(processorEnabled)) {
      await engine.setProcessorEnabled(name, enabled);
    }
    return applied;
  };

  // Album loudness must be measured through the chains (they change
  // loudness): each track runs once through its own chain with the
  // limiter off and no offset; the gating blocks of all tracks are then
  // integrated as one program. Cached per track under its settings, so
  // editing one track re-measures only that one. Returns false when some
  // track has no settings yet.
  const ensureAlbumCalibration = async (): Promise<boolean> => {
    const s = useStore.getState();
    if (!albumSettingsReady(s)) return false;
    const stale = s.tracks.filter((t) => s.albumCal[t.id]?.key !== calKeyFor(t, trackSettingsOf(s, t)));
    for (let i = 0; i < stale.length; i++) {
      const t = stale[i];
      const st = trackSettingsOf(useStore.getState(), t);
      useStore.getState().setAlbumCalibrating(stale.length === 1
        ? `Measuring ${t.name}…`
        : `Measuring tracks with their settings (${i + 1}/${stale.length})…`);
      const ch = t.buffer.numberOfChannels;
      const sr = t.buffer.sampleRate;
      await engine.initEngine(sr, ch);
      await applyEngineState(st);
      await engine.setProcessorEnabled('Loudness Normalizer', false);
      await engine.setProcessorEnabled('Limiter', false);
      await engine.setParam('Gain', 'gain_db', 0);
      const processed = await engine.processBuffer(audioBufferToFloat32Array(t.buffer), ch, sr);
      const blocks = await engine.measureBlocks(processed.slice(), ch, sr);
      const analysis = await engine.inspectBuffer(processed, ch, sr);
      useStore.getState().setTrackCalibration(t.id, {
        key: calKeyFor(t, st), blocks, lufs: await engine.gatedLoudness(blocks), analysis,
      });
    }
    useStore.getState().setAlbumCalibrating(null);
    const now = useStore.getState();
    const allBlocks = now.tracks.flatMap((t) => now.albumCal[t.id]?.blocks ?? []);
    const post = allBlocks.length > 0 ? await engine.gatedLoudness(allBlocks) : null;
    if (post !== now.albumPostLufs) now.setAlbumPostLufs(post);
    return true;
  };

  // Configure the engine's loudness for a track: in an album an explicit
  // gain (the normalizer can't keep the level differences between
  // tracks), otherwise the normalizer as set.
  const applyTrackLoudness = async (t: AlbumTrack | undefined) => {
    const s = useStore.getState();
    const gain = s.workspace === 'album' && t ? albumTrackGainDB(s, t) : null;
    if (gain !== null) {
      await engine.setProcessorEnabled('Loudness Normalizer', false);
      await engine.setParam('Gain', 'gain_db', gain);
    } else {
      await engine.setParam('Gain', 'gain_db', 0);
    }
  };

  // Prepare the engine for a full-chain run of the active track under the
  // current settings: init at the audio's rate, apply params/bypass, and
  // in an album its gain from the calibration.
  const prepareEngineRun = async (channels: number, sampleRate: number) => {
    if (useStore.getState().workspace === 'album') await ensureAlbumCalibration();
    await engine.initEngine(sampleRate, channels);
    const applied = await applyEngineState();
    const s = useStore.getState();
    await applyTrackLoudness(s.tracks.find((t) => t.id === s.activeTrackId));
    return applied;
  };

  // Put the active track's settings back into the engine after work on
  // other tracks (calibration, export, transitions): knob edits read the
  // engine's params back, so it must hold the active track's.
  const restoreActiveEngine = async () => {
    const s = useStore.getState();
    const t = s.tracks.find((x) => x.id === s.activeTrackId);
    if (!t) return;
    await engine.initEngine(t.buffer.sampleRate, t.buffer.numberOfChannels);
    await applyEngineState();
    await applyTrackLoudness(t);
  };
  const syncEngineToActive = useCallback(() => restoreActiveEngine(), []);

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
        && now.albumMode === start.albumMode
        && now.albumRev === start.albumRev
        && now.choice === start.choice;
    };

    setIsProcessing(true);
    try {
      const channels = originalBuffer.numberOfChannels;
      const sampleRate = originalBuffer.sampleRate;
      const rendered = await prepareEngineRun(channels, sampleRate);

      // Float32Array args are transferred to the worker, so interleave a
      // fresh copy per call.
      const processed = await engine.processBuffer(
        audioBufferToFloat32Array(originalBuffer), channels, sampleRate);
      if (useStore.getState().originalBuffer !== originalBuffer) return; // track switched
      const processedAudioBuffer = float32ArrayToAudioBuffer(processed, channels, sampleRate);

      setProcessedBuffer(processedAudioBuffer, rendered);
      if (!stillCurrent()) useStore.getState().setParamsDirty(true);
      else if (start.workspace === 'album' && start.activeTrackId) {
        useStore.getState().markReviewed(start.activeTrackId);
      }
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
      r: s.albumRev,
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

  // Build each track's settings for the current choice and apply them —
  // all params and bypass states, so nothing is left over from earlier
  // choices. Each track's fixes come from its own analysis. Skips tracks
  // with a saved preset loaded, not yet analyzed, or already current.
  const syncRecipe = useCallback(async () => {
    const mySeq = ++recipeSeq;
    const s0 = useStore.getState();
    for (const t0 of s0.tracks) {
      const s = useStore.getState();
      const t = s.tracks.find((x) => x.id === t0.id);
      if (!t) continue;
      const st = trackSettingsOf(s, t);
      const analysis = t.id === s.activeTrackId ? (s.analysis ?? t.analysis) : t.analysis;
      if (st.customPreset !== null || !analysis) continue;
      const key = recipeKeyFor(s, t, st);
      if (key === st.recipeKey) continue;

      const r = await engine.buildRecipe(
        { style: styleFor(s, st), destination: s.choice.destination, fix: s.choice.fix }, [analysis]);
      if (mySeq !== recipeSeq) return;
      if ('error' in r) {
        setError(`Settings: ${r.error}`);
        return;
      }
      useStore.getState().setTrackSettings(t.id, {
        params: r.processors, enabled: r.enabled, recipe: r, recipeKey: key, paramsEdited: false,
      });
      if (t.id !== useStore.getState().activeTrackId) continue;
      // The store is the source of truth (every run re-initializes the
      // engine from it); the engine is updated too so getParams-based
      // paths agree.
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
    }
  }, []);

  const analyzeAudio = useCallback(async () => {
    if (!wasmReady || !originalBuffer) return;

    const channels = originalBuffer.numberOfChannels;
    const sampleRate = originalBuffer.sampleRate;

    const trackId = useStore.getState().activeTrackId;
    setIsAnalyzing(true);
    try {
      const result = await engine.analyzeBuffer(
        audioBufferToFloat32Array(originalBuffer), channels, sampleRate);
      // The user may have switched tracks meanwhile: the result belongs to
      // the track it was started for.
      if (useStore.getState().originalBuffer === originalBuffer) setAnalysis(result);

      // Share the result with the album track cache so the background
      // album pipeline doesn't analyze the track a second time.
      if (trackId) useStore.getState().updateTrack(trackId, { analysis: result });

    } catch (err: any) {
      setError(`Analysis failed: ${err.message}`);
    } finally {
      setIsAnalyzing(false);
    }
  }, [wasmReady, originalBuffer]);

  // Master every track with its settings and album gain, and download
  // the whole set as one zip — no per-track clicking, and no risk of stale
  // files exported under older settings.
  const exportAlbum = useCallback(async () => {
    if (!wasmReady || useStore.getState().tracks.length === 0) return;

    setIsProcessing(true);
    try {
      if (!await ensureAlbumCalibration()) throw new Error('some tracks are not ready yet');
      const s = useStore.getState();
      const entries: ZipEntry[] = [];
      for (let i = 0; i < s.tracks.length; i++) {
        const t = s.tracks[i];
        useStore.getState().setAlbumCalibrating(`Exporting ${i + 1}/${s.tracks.length}: ${t.name}…`);
        const ch = t.buffer.numberOfChannels;
        const sr = t.buffer.sampleRate;
        await engine.initEngine(sr, ch);
        await applyEngineState(trackSettingsOf(s, t));
        await applyTrackLoudness(t);
        const processed = await engine.processBuffer(
          audioBufferToFloat32Array(t.buffer), ch, sr);
        entries.push({
          name: `${String(i + 1).padStart(2, '0')} ${t.name.replace(/\.[^.]+$/, '')}_mastered.wav`,
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
      await restoreActiveEngine();
      setIsProcessing(false);
    }
  }, [wasmReady]);

  // Measure the album (balance view) when it isn't yet. Uses the engine,
  // so it takes the processing slot like any other run.
  const calibrateAlbum = useCallback(async () => {
    const s = useStore.getState();
    if (!wasmReady || s.isProcessing || s.workspace !== 'album') return;
    setIsProcessing(true);
    try {
      await ensureAlbumCalibration();
    } catch (err: any) {
      setError(`Measuring the album failed: ${err.message}`);
    } finally {
      await restoreActiveEngine();
      setIsProcessing(false);
    }
  }, [wasmReady]);

  // Render [start, start+dur) seconds of a track as mastered in the album
  // (its settings and gain). Starts a little earlier so the compressor
  // has settled by the part that is kept.
  const renderAlbumPart = async (t: AlbumTrack, start: number, dur: number): Promise<AudioBuffer> => {
    const PREROLL = 1.5;
    const s = useStore.getState();
    const ch = t.buffer.numberOfChannels;
    const sr = t.buffer.sampleRate;
    const total = t.buffer.length;
    const from = Math.max(0, Math.floor((start - PREROLL) * sr));
    const keepFrom = Math.max(0, Math.floor(start * sr));
    const to = Math.min(total, Math.floor((start + dur) * sr));
    const all = audioBufferToFloat32Array(t.buffer);
    await engine.initEngine(sr, ch);
    await applyEngineState(trackSettingsOf(s, t));
    await applyTrackLoudness(t);
    const out = await engine.processBuffer(all.slice(from * ch, to * ch), ch, sr);
    return float32ArrayToAudioBuffer(out.slice((keepFrom - from) * ch), ch, sr);
  };

  // Play the end of track i straight into the start of track i+1, both as
  // mastered in the album: the transition is where level and tone
  // differences between tracks show.
  const previewTransition = useCallback(async (i: number) => {
    const s = useStore.getState();
    const a = s.tracks[i];
    const b = s.tracks[i + 1];
    if (!wasmReady || !a || !b) return;
    stopPlayback();
    setIsProcessing(true);
    try {
      if (!await ensureAlbumCalibration()) throw new Error('some tracks are not ready yet');
      const TAIL = 8;
      const head = await renderAlbumPart(b, 0, 8);
      const tail = await renderAlbumPart(a, Math.max(0, a.info.duration - TAIL), TAIL);
      useStore.getState().setTransitionPlaying(i);
      playTransition([tail, head], () => {
        if (useStore.getState().transitionPlaying === i) useStore.getState().setTransitionPlaying(null);
      });
    } catch (err: any) {
      setError(`Transition preview failed: ${err.message}`);
    } finally {
      await restoreActiveEngine();
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
    syncEngineToActive,
    resetToRecipe,
    exportAlbum,
    calibrateAlbum,
    previewTransition,
    setParam,
    setProcessorEnabled,
    applyCustomPreset,
    isReady: wasmReady,
  };
}
