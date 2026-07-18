// Synthesized demo stems (drums / bass / pad) so the app works with zero setup,
// exactly like the sketch. Real stems replace these via per-track Load.

const DUR = 24; // demo stem length (s)
const CHORDS = [[220, 277.18, 329.63], [185, 220, 277.18]]; // A / F#m
const ROOTS = [110, 92.5];
const SEG = 2.4; // chord length (s)

function synthDrums(ctx) {
  const sr = ctx.sampleRate;
  const buf = ctx.createBuffer(1, sr * DUR, sr);
  const d = buf.getChannelData(0);
  const beat = 0.6; // 100 bpm
  const kick = (i0) => {
    let ph = 0;
    for (let n = 0; n < 0.18 * sr && i0 + n < d.length; n++) {
      const t = n / sr;
      ph += (2 * Math.PI * (110 * Math.exp(-t * 18) + 40)) / sr;
      d[i0 + n] += Math.sin(ph) * Math.exp(-t * 9) * 0.9;
    }
  };
  const snare = (i0) => {
    for (let n = 0; n < 0.2 * sr && i0 + n < d.length; n++) {
      const t = n / sr;
      d[i0 + n] += (Math.random() * 2 - 1) * Math.exp(-t * 22) * 0.45
        + Math.sin(2 * Math.PI * 190 * t) * Math.exp(-t * 30) * 0.3;
    }
  };
  const hat = (i0) => {
    for (let n = 0; n < 0.05 * sr && i0 + n < d.length; n++) {
      d[i0 + n] += (Math.random() * 2 - 1) * Math.exp(-(n / sr) * 70) * 0.22;
    }
  };
  for (let b = 0; b * beat < DUR; b++) {
    const i0 = Math.floor(b * beat * sr);
    kick(i0);
    if (b % 2 === 1) snare(i0);
    hat(i0);
    hat(Math.floor((b * beat + 0.3) * sr));
  }
  return buf;
}

function synthBass(ctx) {
  const sr = ctx.sampleRate;
  const buf = ctx.createBuffer(1, sr * DUR, sr);
  const d = buf.getChannelData(0);
  for (let t0 = 0; t0 < DUR; t0 += 0.3) { // eighth notes
    const f = ROOTS[Math.floor(t0 / SEG) % 2];
    const i0 = Math.floor(t0 * sr);
    for (let n = 0; n < 0.28 * sr && i0 + n < d.length; n++) {
      const t = n / sr;
      const env = Math.min(t / 0.01, 1) * Math.exp(-t * 6);
      d[i0 + n] += (Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(4 * Math.PI * f * t)) * env * 0.5;
    }
  }
  return buf;
}

function synthPad(ctx) {
  const sr = ctx.sampleRate;
  const buf = ctx.createBuffer(1, sr * DUR, sr);
  const d = buf.getChannelData(0);
  for (let s = 0; s * SEG < DUR; s++) {
    const freqs = CHORDS[s % 2];
    const i0 = Math.floor(s * SEG * sr);
    const len = Math.min(SEG * sr, d.length - i0);
    for (const f of freqs) {
      for (let n = 0; n < len; n++) {
        const t = n / sr;
        const tt = (i0 + n) / sr;
        const env = Math.min(t / 0.3, 1, (SEG - t) / 0.3); // segment fades
        d[i0 + n] += Math.sin(2 * Math.PI * f * tt + 0.3 * Math.sin(2 * Math.PI * 0.7 * tt)) * env * 0.11;
      }
    }
  }
  return buf;
}

export function makeDemoStems(ctx) {
  return [
    { name: 'Drums', color: '#6fd66f', buffer: synthDrums(ctx) },
    { name: 'Bass', color: '#5aa2e0', buffer: synthBass(ctx) },
    { name: 'Pad', color: '#c98bd6', buffer: synthPad(ctx) },
  ];
}
