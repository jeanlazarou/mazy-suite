// The only module that touches Web Audio or AudioBuffers.
//
// Both files are decoded into memory, so swapping the audible side is a gain
// ramp plus a source restart — instant, and never a click.
//
//   source(A) → gain(A) ┐
//                       ├→ destination
//   source(B) → gain(B) ┘
//
// The clock: position is kept on ONE side, the one you are hearing, because
// that side's audio is the only thing playing at real speed. The other side's
// position is a mapped display value, which is exactly what a correspondence
// between two ranges of different lengths implies.

import { computePeaks } from '../model/peaks.js';

const RAMP = 0.015; // s — the micro-fade that keeps every switch silent

class Engine {
  constructor() {
    this.ctx = null;
    this.sides = { a: null, b: null }; // { buffer, peaks, gain, source }
    this.clock = 'a';
    this.audible = 'a';
    this.playing = false;
    this.offset = 0; // position on the clock side when the run started
    this.startedAt = 0; // ctx.currentTime when it started
    this.mapper = () => 0; // set by the store: (from, to, t) => t
    this.onEnded = null;
  }

  context() {
    if (!this.ctx) this.ctx = new (window.AudioContext ?? window.webkitAudioContext)();
    return this.ctx;
  }

  async decode(arrayBuffer) {
    const ctx = this.context();
    const buffer = await ctx.decodeAudioData(arrayBuffer);
    const channels = [];
    for (let c = 0; c < buffer.numberOfChannels; c += 1) channels.push(buffer.getChannelData(c));
    return { buffer, peaks: computePeaks(channels, buffer.sampleRate) };
  }

  setSide(side, decoded) {
    const ctx = this.context();
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(ctx.destination);
    this.sides[side] = { ...decoded, gain, source: null };
  }

  clear() {
    this.stopSources();
    this.sides = { a: null, b: null };
    this.playing = false;
    this.offset = 0;
  }

  duration(side) {
    return this.sides[side]?.buffer.duration ?? 0;
  }

  peaks(side) {
    return this.sides[side]?.peaks ?? null;
  }

  ready() {
    return !!(this.sides.a && this.sides.b);
  }

  // Position on the clock side, in its own seconds.
  position() {
    if (!this.playing) return this.offset;
    const elapsed = this.context().currentTime - this.startedAt;
    return Math.min(this.offset + elapsed, this.duration(this.clock));
  }

  positionOn(side) {
    const t = this.position();
    return side === this.clock ? t : this.mapper(this.clock, side, t);
  }

  gainFor(side) {
    if (this.audible === 'both') return 1;
    return this.audible === side ? 1 : 0;
  }

  applyGains(when) {
    const ctx = this.context();
    const at = when ?? ctx.currentTime;
    for (const side of ['a', 'b']) {
      const entry = this.sides[side];
      if (!entry) continue;
      const target = this.playing ? this.gainFor(side) : 0;
      entry.gain.gain.cancelScheduledValues(at);
      entry.gain.gain.setValueAtTime(entry.gain.gain.value, at);
      entry.gain.gain.linearRampToValueAtTime(target, at + RAMP);
    }
  }

  stopSources() {
    for (const side of ['a', 'b']) {
      const entry = this.sides[side];
      if (!entry?.source) continue;
      entry.source.onended = null;
      try {
        entry.source.stop();
      } catch {
        // already stopped
      }
      entry.source.disconnect();
      entry.source = null;
    }
  }

  // Start both sources: the clock side at `t`, the other at the time `t` maps
  // to. The silent side is restarted too — it costs nothing and keeps the two
  // always consistent, so a later swap has nothing to resynchronise.
  startSources(t) {
    const ctx = this.context();
    this.stopSources();
    const at = ctx.currentTime + 0.02;
    for (const side of ['a', 'b']) {
      const entry = this.sides[side];
      if (!entry) continue;
      const from = side === this.clock ? t : this.mapper(this.clock, side, t);
      const source = ctx.createBufferSource();
      source.buffer = entry.buffer;
      source.connect(entry.gain);
      source.start(at, Math.min(Math.max(from, 0), entry.buffer.duration));
      if (side === this.clock) {
        source.onended = () => {
          if (this.playing && this.position() >= this.duration(this.clock) - 0.05) this.pause();
          this.onEnded?.();
        };
      }
      entry.source = source;
    }
    this.offset = t;
    this.startedAt = at;
  }

  async play() {
    if (!this.ready() || this.playing) return;
    const ctx = this.context();
    if (ctx.state === 'suspended') await ctx.resume();
    const from = this.offset >= this.duration(this.clock) - 0.01 ? 0 : this.offset;
    this.playing = true;
    this.startSources(from);
    this.applyGains();
  }

  pause() {
    if (!this.playing) return;
    const at = this.position();
    this.applyGains();
    this.playing = false;
    this.stopSources();
    this.offset = at;
  }

  seek(t) {
    const clamped = Math.min(Math.max(t, 0), this.duration(this.clock));
    if (this.playing) {
      this.startSources(clamped);
      this.applyGains();
    } else {
      this.offset = clamped;
    }
  }

  setAudible(mode) {
    this.audible = mode;
    // `both` plays from one clock with no time-stretch: the two drift apart
    // exactly as much as the recordings disagree. Restarting puts them back
    // at the mapped position first.
    if (this.playing) this.startSources(this.position());
    this.applyGains();
  }

  // Swap which side is audible without moving: the position crosses over
  // through the mapping, and playback continues there.
  swap() {
    const other = this.clock === 'a' ? 'b' : 'a';
    const there = this.mapper(this.clock, other, this.position());
    this.clock = other;
    if (this.audible !== 'both') this.audible = other;
    if (this.playing) {
      this.startSources(there);
      this.applyGains();
    } else {
      this.offset = there;
    }
    return other;
  }

  setClock(side) {
    if (side === this.clock) return;
    this.swap();
  }
}

export const engine = new Engine();
