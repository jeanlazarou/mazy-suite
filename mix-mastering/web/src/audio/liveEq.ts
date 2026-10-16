// Instant EQ feedback during playback, and band solo.
//
// The engine renders the whole track offline, so an EQ edit is only heard
// once the debounced re-render finishes. Meanwhile, the processed buffer
// plays through Web Audio IIR filters holding the *difference* between the
// EQ it was rendered with and the current one (see eqDeltaFilters). When
// the exact render arrives, the rendered EQ matches the current one, the
// difference is empty and the filters drop out.
//
// Playback path: source -> input -> [delta filters] -> eqOut
//   -> dry ------------------------> output (playback gain node)
//   -> soloFilter -> soloGain -----> output

import { getAudioContext } from './context';
import { useStore } from '../store/store';
import { EQ_NAME, readBands, eqDeltaFilters, type Biquad, type EQBand } from './eqMath';

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

/** Build the live section between the sources and `output`; returns the
 *  node sources connect to. Called once by context.ts. */
export function createLiveSection(ctx: AudioContext, output: AudioNode): GainNode {
  input = ctx.createGain();
  eqOut = ctx.createGain();
  dry = ctx.createGain();
  soloFilter = ctx.createBiquadFilter();
  soloGain = ctx.createGain();
  soloGain.gain.value = 0;
  eqOut.connect(dry).connect(output);
  eqOut.connect(soloFilter).connect(soloGain).connect(output);
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

function update() {
  const s = useStore.getState();
  const rendered = s.processedEq;
  const playingProcessed = s.listenMode === 'processed' && s.processedBuffer !== null;
  if (!rendered || !playingProcessed) {
    setDeltaFilters([]);
    return;
  }
  const sr = getAudioContext().sampleRate;
  setDeltaFilters(eqDeltaFilters(
    readBands(rendered.params), rendered.enabled,
    readBands(s.params[EQ_NAME]), s.processorEnabled[EQ_NAME] ?? true,
    sr,
  ));
}

/** Keep the delta filters in step with the store. Returns unsubscribe. */
export function startLiveEq(): () => void {
  update();
  return useStore.subscribe((s, prev) => {
    if (s.params === prev.params && s.processorEnabled === prev.processorEnabled
      && s.processedEq === prev.processedEq && s.listenMode === prev.listenMode
      && s.processedBuffer === prev.processedBuffer) return;
    update();
  });
}
