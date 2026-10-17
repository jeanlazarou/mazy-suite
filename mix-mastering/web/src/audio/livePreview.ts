// Instant feedback during playback for edits the engine hasn't rendered
// yet, plus listening aids (band solo, mono check).
//
// The engine renders the whole track offline, so an edit is only heard
// once the debounced re-render finishes. Meanwhile, the processed buffer
// plays through a stage holding the *difference* between the settings it
// was rendered with and the current ones. When the exact render arrives,
// the difference is empty and the stage passes audio through unchanged.
// Only processors whose difference can be applied after the fact are
// bridged: the EQ (linear filters, see eqDeltaFilters) and the Stereo
// Widener (a linear mid/side matrix).
//
// Playback path: source -> input -> [EQ delta filters] -> eqOut
//   -> width matrix (L/R mix gains) -> widthOut
//   -> dry ------------------------> output (playback gain node)
//   -> soloFilter -> soloGain -----> output

import { getAudioContext } from './context';
import { useStore } from '../store/store';
import { EQ_NAME, readBands, eqDeltaFilters, type Biquad, type EQBand } from './eqMath';

const WIDENER = 'Stereo Widener';
const FADE = 0.02; // s, crossfade between filter chains / solo on-off

interface Chain {
  fader: GainNode;
  nodes: AudioNode[];
  key: string;
}

let input: GainNode | null = null;
let eqOut: GainNode | null = null;
let dry: GainNode | null = null;
let soloFilter: BiquadFilterNode | null = null;
let soloGain: GainNode | null = null;
let chain: Chain | null = null;
// Width matrix: L' = a*L + b*R, R' = b*L + a*R with a = (1+k)/2, b = (1-k)/2,
// where k scales the side signal.
let direct: GainNode[] = []; // L->L, R->R (a)
let cross: GainNode[] = []; // R->L, L->R (b)
let monoCheck = false;

/** Build the live section between the sources and `output`; returns the
 *  node sources connect to. Called once by context.ts. */
export function createLiveSection(ctx: AudioContext, output: AudioNode): GainNode {
  input = ctx.createGain();
  // Two channels throughout, so a mono file is upmixed once and the width
  // matrix always has a left and a right.
  input.channelCount = 2;
  input.channelCountMode = 'explicit';
  eqOut = ctx.createGain();
  dry = ctx.createGain();
  soloFilter = ctx.createBiquadFilter();
  soloGain = ctx.createGain();
  soloGain.gain.value = 0;

  const split = ctx.createChannelSplitter(2);
  const merge = ctx.createChannelMerger(2);
  direct = [ctx.createGain(), ctx.createGain()];
  cross = [ctx.createGain(), ctx.createGain()];
  cross.forEach((g) => { g.gain.value = 0; });
  eqOut.connect(split);
  split.connect(direct[0], 0).connect(merge, 0, 0);
  split.connect(direct[1], 1).connect(merge, 0, 1);
  split.connect(cross[0], 1).connect(merge, 0, 0);
  split.connect(cross[1], 0).connect(merge, 0, 1);
  const widthOut = ctx.createGain();
  merge.connect(widthOut);

  widthOut.connect(dry).connect(output);
  widthOut.connect(soloFilter).connect(soloGain).connect(output);
  chain = { fader: ctx.createGain(), nodes: [], key: '' };
  input.connect(chain.fader).connect(eqOut);
  return input;
}

function fadeTo(param: AudioParam, value: number) {
  const t = getAudioContext().currentTime;
  param.cancelScheduledValues(t);
  param.setValueAtTime(param.value, t);
  param.linearRampToValueAtTime(value, t + FADE);
}

function setDeltaFilters(filters: Biquad[]) {
  if (!input || !eqOut || !chain) return;
  const key = JSON.stringify(filters);
  if (key === chain.key) return;
  const ctx = getAudioContext();
  const fader = ctx.createGain();
  fader.gain.value = 0;
  const nodes = filters.map((f) => ctx.createIIRFilter(f.b, f.a));
  let prev: AudioNode = input;
  for (const n of nodes) { prev.connect(n); prev = n; }
  prev.connect(fader).connect(eqOut);
  fadeTo(fader.gain, 1);

  // A fresh IIR starts with empty state, so fade the old chain out rather
  // than cutting over (no click), then drop it.
  const old = chain;
  fadeTo(old.fader.gain, 0);
  setTimeout(() => {
    try {
      input?.disconnect(old.nodes[0] ?? old.fader);
    } catch { /* already disconnected */ }
    old.fader.disconnect();
    old.nodes.forEach((n) => n.disconnect());
  }, FADE * 1000 * 3);
  chain = { fader, nodes, key };
}

let sideScale = 1;
function setSideScale(k: number) {
  if (direct.length === 0) return;
  if (k === sideScale) return;
  sideScale = k;
  direct.forEach((g) => fadeTo(g.gain, (1 + k) / 2));
  cross.forEach((g) => fadeTo(g.gain, (1 - k) / 2));
}

/** Listen to only the range a band acts on: a band-pass around a peak,
 *  the low end of a low shelf / what a high-pass removes, and so on. */
export function setBandSolo(band: EQBand | null) {
  if (!soloFilter || !soloGain || !dry) return;
  if (band) {
    const sr = getAudioContext().sampleRate;
    const type: BiquadFilterType =
      band.type === 'peak' ? 'bandpass'
        : band.type === 'lowshelf' || band.type === 'highpass' ? 'lowpass'
          : 'highpass';
    const t = getAudioContext().currentTime;
    soloFilter.type = type;
    soloFilter.frequency.setTargetAtTime(Math.min(band.freq, sr * 0.49), t, 0.01);
    soloFilter.Q.setTargetAtTime(type === 'bandpass' ? Math.max(band.q, 0.5) : 0.707, t, 0.01);
  }
  fadeTo(soloGain.gain, band ? 1 : 0);
  fadeTo(dry.gain, band ? 0 : 1);
}

/** Play everything in mono (as a phone or a single speaker would), to
 *  check that nothing disappears when left and right are summed. */
export function setMonoCheck(on: boolean) {
  monoCheck = on;
  update();
}

const effectiveWidth = (params: Record<string, number> | undefined, on: boolean | undefined) =>
  (on ?? true) ? (params?.width ?? 1) : 1;

function update() {
  const s = useStore.getState();
  const rendered = s.processedSettings;
  const playingProcessed = s.listenMode === 'processed' && s.processedBuffer !== null;
  if (!rendered || !playingProcessed) {
    setDeltaFilters([]);
    setSideScale(monoCheck ? 0 : 1);
    return;
  }
  const sr = getAudioContext().sampleRate;
  setDeltaFilters(eqDeltaFilters(
    readBands(rendered.params[EQ_NAME]), rendered.enabled[EQ_NAME] ?? true,
    readBands(s.params[EQ_NAME]), s.processorEnabled[EQ_NAME] ?? true,
    sr,
  ));
  // Width: the rendered side signal was scaled by w0; scale it by w/w0 to
  // hear w. A render made at width 0 has no side left to scale.
  const w0 = effectiveWidth(rendered.params[WIDENER], rendered.enabled[WIDENER]);
  const w = effectiveWidth(s.params[WIDENER], s.processorEnabled[WIDENER]);
  setSideScale(monoCheck ? 0 : w0 > 0.001 ? w / w0 : 1);
}

/** Keep the live stage in step with the store. Returns unsubscribe. */
export function startLivePreview(): () => void {
  update();
  return useStore.subscribe((s, prev) => {
    if (s.params === prev.params && s.processorEnabled === prev.processorEnabled
      && s.processedSettings === prev.processedSettings && s.listenMode === prev.listenMode
      && s.processedBuffer === prev.processedBuffer) return;
    update();
  });
}
