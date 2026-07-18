import { buildCurve, buildPanCurve } from '../model/envelope';
import { encodeWav } from './wav';

// Owns the Web Audio graph and the AudioBuffers (non-serializable, so they
// live here, not in the store). The store binds getModel/onPlayingChanged.
//
// Graph, per the spec:
//   source(stem) → GainNode(track curve) → 3×BiquadFilter(EQ) →
//     GainNode(group curve) → GainNode(master curve) → AnalyserNode → destination

const START_DELAY = 0.05; // s between scheduling and hearing, avoids glitches

const EQ_BANDS = [
  { band: 'low', type: 'lowshelf', frequency: 200 },
  { band: 'mid', type: 'peaking', frequency: 1000, Q: 1 },
  { band: 'high', type: 'highshelf', frequency: 4000 },
];

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.buffers = new Map(); // trackId -> AudioBuffer
    this.peakCache = new Map(); // trackId -> { width, data }
    this.sources = [];
    this.playing = false;
    this.offset = 0;
    this.startedAt = 0;
    this.endTimer = null;
    this.analyser = null; // present only while playing
    this.eqNodes = new Map(); // trackId -> { low, mid, high } of the live graph
    this.clipped = false; // latched until resetClip()
    this.lastPeak = 0;
    this.getModel = () => ({ tracks: [], groups: [], master: { env: [], regions: [] }, bypass: false });
    this.onPlayingChanged = () => {};
  }

  context() {
    if (!this.ctx) this.ctx = new AudioContext();
    return this.ctx;
  }

  setBuffer(trackId, buffer) {
    this.buffers.set(trackId, buffer);
    this.peakCache.delete(trackId);
  }

  clearBuffers() {
    this.buffers.clear();
    this.peakCache.clear();
  }

  duration() {
    let d = 0;
    for (const b of this.buffers.values()) d = Math.max(d, b.duration);
    return d;
  }

  getPosition() {
    if (!this.playing) return this.offset;
    return Math.min(this.offset + Math.max(0, this.ctx.currentTime - this.startedAt), this.duration());
  }

  isAudible(track, tracks) {
    const anySolo = tracks.some((t) => t.solo);
    return !track.mute && (!anySolo || track.solo);
  }

  // Build the full mixing graph into ctx. Used identically by live playback
  // and offline export; `live` additionally wires the meter analyser and
  // registers EQ nodes for zipper-free slider updates.
  buildGraph(ctx, from, dur, startAt, live) {
    const { tracks, groups, master, bypass } = this.getModel();
    const sources = [];

    const masterGain = ctx.createGain();
    masterGain.gain.setValueCurveAtTime(buildCurve(master, from, dur, { flat: bypass }), startAt, dur);
    if (live) {
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      masterGain.connect(this.analyser);
      this.analyser.connect(ctx.destination);
    } else {
      masterGain.connect(ctx.destination);
    }

    const groupGains = new Map();
    for (const group of groups) {
      const gain = ctx.createGain();
      gain.gain.setValueCurveAtTime(buildCurve(group, from, dur, { flat: bypass }), startAt, dur);
      gain.connect(masterGain);
      groupGains.set(group.id, gain);
    }

    if (live) this.eqNodes = new Map();
    for (const track of tracks) {
      const buffer = this.buffers.get(track.id);
      if (!buffer || from >= buffer.duration) continue;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const gain = ctx.createGain();
      const silent = !this.isAudible(track, tracks);
      gain.gain.setValueCurveAtTime(buildCurve(track, from, dur, { flat: bypass, silent }), startAt, dur);
      src.connect(gain);
      let tail = gain;
      const filters = {};
      for (const { band, type, frequency, Q } of EQ_BANDS) {
        const f = ctx.createBiquadFilter();
        f.type = type;
        f.frequency.value = frequency;
        if (Q) f.Q.value = Q;
        f.gain.value = bypass ? 0 : (track.eq?.[band] ?? 0);
        tail.connect(f);
        tail = f;
        filters[band] = f;
      }
      const panner = ctx.createStereoPanner();
      panner.pan.setValueCurveAtTime(buildPanCurve(track, from, dur, { flat: bypass }), startAt, dur);
      tail.connect(panner);
      tail = panner;
      tail.connect(groupGains.get(track.group) ?? masterGain);
      if (live) this.eqNodes.set(track.id, filters);
      src.start(startAt, from);
      sources.push(src);
    }
    return sources;
  }

  stopSources() {
    for (const s of this.sources) {
      try { s.stop(); } catch (e) { /* already stopped */ }
    }
    this.sources = [];
    this.analyser = null;
    this.eqNodes = new Map();
    if (this.endTimer) {
      clearTimeout(this.endTimer);
      this.endTimer = null;
    }
  }

  startSources(from) {
    this.stopSources();
    const ctx = this.context();
    const total = this.duration();
    if (total - from <= 0.01) from = 0;
    const dur = total - from;
    if (dur <= 0.01) return;
    const when = ctx.currentTime + START_DELAY;
    this.sources = this.buildGraph(ctx, from, dur, when, true);
    this.playing = true;
    this.offset = from;
    this.startedAt = when;
    this.endTimer = setTimeout(() => this.onEnded(), (START_DELAY + dur) * 1000 + 50);
    this.onPlayingChanged(true);
  }

  onEnded() {
    this.stopSources();
    this.playing = false;
    this.offset = 0;
    this.onPlayingChanged(false);
  }

  async togglePlay() {
    await this.context().resume();
    if (this.playing) {
      this.offset = this.getPosition();
      this.stopSources();
      this.playing = false;
      this.onPlayingChanged(false);
    } else {
      this.startSources(this.offset >= this.duration() ? 0 : this.offset);
    }
  }

  stop() {
    this.stopSources();
    this.playing = false;
    this.offset = 0;
    this.onPlayingChanged(false);
  }

  seek(t) {
    this.offset = Math.max(0, Math.min(t, this.duration()));
    if (this.playing) this.startSources(this.offset);
  }

  // Any model edit while playing: rebuild curves, restart at current position.
  modelChanged() {
    if (this.playing) this.startSources(this.getPosition());
  }

  // EQ slider moves adjust the running filters directly — no source restart.
  updateEq(trackId) {
    const filters = this.eqNodes.get(trackId);
    if (!filters) return;
    const { tracks, bypass } = this.getModel();
    const track = tracks.find((t) => t.id === trackId);
    if (!track) return;
    const now = this.ctx.currentTime;
    for (const { band } of EQ_BANDS) {
      filters[band].gain.setTargetAtTime(bypass ? 0 : (track.eq?.[band] ?? 0), now, 0.01);
    }
  }

  // Peak of the signal after the master curve — what the export will contain.
  getMeterLevel() {
    if (!this.analyser) {
      this.lastPeak = 0;
      return 0;
    }
    const buf = (this._meterBuf ||= new Float32Array(2048));
    this.analyser.getFloatTimeDomainData(buf);
    let peak = 0;
    for (let i = 0; i < buf.length; i++) {
      const a = Math.abs(buf[i]);
      if (a > peak) peak = a;
    }
    if (peak >= 1) this.clipped = true;
    this.lastPeak = peak;
    return peak;
  }

  resetClip() {
    this.clipped = false;
  }

  async decode(arrayBuffer) {
    return this.context().decodeAudioData(arrayBuffer);
  }

  // Min/max peaks for the visible time range (zoom-aware), cached per track.
  // Columns outside the buffer are null (stem shorter than the song / view).
  getPeaks(trackId, width, fromT, toT) {
    const buffer = this.buffers.get(trackId);
    if (!buffer) return null;
    const key = `${width}:${fromT.toFixed(3)}:${toT.toFixed(3)}`;
    const cached = this.peakCache.get(trackId);
    if (cached && cached.key === key) return cached.data;
    const d = buffer.getChannelData(0);
    const sr = buffer.sampleRate;
    const perCol = (toT - fromT) / width;
    const data = [];
    for (let x = 0; x < width; x++) {
      const a = Math.floor((fromT + x * perCol) * sr);
      const b = Math.min(d.length, Math.floor((fromT + (x + 1) * perCol) * sr));
      if (a >= d.length || b <= 0) {
        data.push(null);
        continue;
      }
      let mn = 0;
      let mx = 0;
      const step = Math.max(1, Math.floor((b - a) / 400)); // cap work per column
      for (let i = Math.max(0, a); i < b; i += step) {
        const s = d[i];
        if (s < mn) mn = s;
        if (s > mx) mx = s;
      }
      data.push([mn, mx]);
    }
    this.peakCache.set(trackId, { key, data });
    return data;
  }

  async exportWav() {
    const dur = this.duration();
    if (dur <= 0) return null;
    const rate = this.context().sampleRate;
    const off = new OfflineAudioContext(2, Math.ceil(dur * rate), rate);
    this.buildGraph(off, 0, dur, 0, false);
    const rendered = await off.startRendering();
    return new Blob([encodeWav(rendered)], { type: 'audio/wav' });
  }
}

export const engine = new AudioEngine();
