import { AudioEngine, type AnalysisResult, type RecipeChoice } from './engine';
import { useStore, renderKey, findRender, type AlbumTrack } from '../store/store';
import { audioBufferToFloat32Array, float32ArrayToAudioBuffer } from '../audio/context';

// The four versions of the current choice (track workspace only), each
// rendered in full by its own engine — a separate worker and Go runtime —
// so they run in parallel: all four are ready about when one preview
// would be, and picking a version while listening swaps buffers instead
// of re-rendering (runProcess and App's auto-preview take a finished
// render from the store). Meant for desktops: an engine peaks near 1 GB
// on a 4-minute song, so the workers are stopped as soon as their
// versions are done.

// Engines running at once; the other versions wait for a free one.
const PARALLEL = Math.max(1, Math.min(4, Math.floor((navigator.hardwareConcurrency || 4) / 2)));

// Bumped by every (re)start and stop: a batch that is no longer current
// stops at its next step and commits nothing.
let batch = 0;
const running = new Set<AudioEngine>();

function stopEngines() {
  for (const e of running) e.terminate();
  running.clear();
}

/** Stop rendering versions and drop the renders. */
export function stopVariants(): void {
  batch++;
  stopEngines();
  useStore.getState().clearVariants();
}

/** (Re)start rendering the four versions of the current choice for the
 *  active track, abandoning a batch in progress. The selected version
 *  goes first. */
export function renderVariants(): void {
  const my = ++batch;
  stopEngines();
  const s = useStore.getState();
  const track = s.tracks.find((t) => t.id === s.activeTrackId);
  const ids = s.recipeOptions?.variants.map((v) => v.id) ?? [];
  if (s.workspace !== 'track' || !track || !s.analysis || ids.length === 0) {
    s.clearVariants();
    return;
  }
  const analysis = s.analysis;
  const base = { style: s.choice.style, destination: s.choice.destination, fix: s.choice.fix };
  const queue = ids.includes(s.choice.variant)
    ? [s.choice.variant, ...ids.filter((id) => id !== s.choice.variant)]
    : ids;
  s.startVariants(ids);

  // Each lane keeps its engine for the versions it takes from the queue.
  const lane = async () => {
    const eng = new AudioEngine();
    running.add(eng);
    try {
      for (let id = queue.shift(); id !== undefined && my === batch; id = queue.shift()) {
        await renderOne(my, eng, id, { ...base, variant: id }, track, analysis);
      }
    } finally {
      eng.terminate();
      running.delete(eng);
    }
  };
  // Count first: each lane takes its first version from the queue as it
  // starts.
  const lanes = Math.min(PARALLEL, queue.length);
  for (let i = 0; i < lanes; i++) lane();
}

// Build one version's recipe and render the track with it — the same
// steps as a preview run (useAudioEngine's runProcess), so the result is
// what the preview would have made.
async function renderOne(
  my: number, eng: AudioEngine, id: string, choice: RecipeChoice, track: AlbumTrack, analysis: AnalysisResult,
) {
  try {
    if (!eng.isReady()) await eng.init();
    const r = await eng.buildRecipe(choice, [analysis]);
    if (my !== batch) return;
    if ('error' in r) throw new Error(r.error);
    const rendered = { params: r.processors, enabled: r.enabled };
    const key = renderKey(rendered, track.id);
    useStore.getState().setVariant(id, { key });
    if (!useStore.getState().variantSuggestion) useStore.getState().setVariantSuggestion(r.suggested);

    if (!findRender(useStore.getState(), key)) {
      const ch = track.buffer.numberOfChannels;
      const sr = track.buffer.sampleRate;
      await eng.initEngine(sr, ch);
      for (const [proc, procParams] of Object.entries(r.processors)) {
        for (const [param, value] of Object.entries(procParams)) {
          await eng.setParam(proc, param, value);
        }
      }
      for (const [name, enabled] of Object.entries(r.enabled)) {
        await eng.setProcessorEnabled(name, enabled);
      }
      const out = await eng.processBuffer(audioBufferToFloat32Array(track.buffer), ch, sr);
      const meters = await eng.getMeters();
      if (my !== batch) return;
      // Playable now; its analysis (result chips, match gain) follows.
      useStore.getState().addRender({
        key, rendered, meters, analysis: null, matchGainDB: null,
        buffer: float32ArrayToAudioBuffer(out, ch, sr),
      });
      useStore.getState().setVariant(id, { rendering: false });
      const result = await eng.inspectBuffer(out, ch, sr);
      if (my !== batch) return;
      const before = analysis.loudness.integrated_lufs;
      const after = result.loudness.integrated_lufs;
      useStore.getState().completeRender(key, result, before > -100 && after > -100 ? before - after : null);
      return;
    }
    useStore.getState().setVariant(id, { rendering: false });
  } catch (err: any) {
    if (my !== batch) return;
    useStore.getState().setVariant(id, { rendering: false, failed: true });
    useStore.getState().setError(`Preparing the ${id} version failed: ${err.message}`);
  }
}
