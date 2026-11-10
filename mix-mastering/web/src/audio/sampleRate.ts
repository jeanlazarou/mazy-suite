// The sample rate an audio file was made at, read from its header, so it
// can be decoded at that rate (decodeAudioData converts to the rate of the
// context it is called on). Null when the format isn't recognized (m4a
// among them: its header rate can be half the decoded one).
export function sniffSampleRate(b: Uint8Array): number | null {
  const tag = (o: number, s: string) => {
    if (o + s.length > b.length) return false;
    for (let i = 0; i < s.length; i++) if (b[o + i] !== s.charCodeAt(i)) return false;
    return true;
  };
  const u32le = (o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
  const u32be = (o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
  const valid = (r: number) => (Number.isFinite(r) && r >= 8000 && r <= 384000 ? Math.round(r) : null);

  // A leading ID3v2 tag (MP3, sometimes FLAC).
  let start = 0;
  if (tag(0, 'ID3') && b.length > 10) {
    start = 10 + ((b[6] & 0x7f) << 21 | (b[7] & 0x7f) << 14 | (b[8] & 0x7f) << 7 | (b[9] & 0x7f));
  }

  if ((tag(0, 'RIFF') || tag(0, 'RF64')) && tag(8, 'WAVE')) {
    for (let o = 12; o + 16 <= b.length;) {
      if (tag(o, 'fmt ')) return valid(u32le(o + 12));
      o += 8 + u32le(o + 4) + (u32le(o + 4) & 1);
    }
    return null;
  }

  if (tag(0, 'FORM') && (tag(8, 'AIFF') || tag(8, 'AIFC'))) {
    for (let o = 12; o + 26 <= b.length;) {
      if (tag(o, 'COMM')) {
        // 80-bit extended float: sign+exponent (16 bits), mantissa (64).
        const exp = ((b[o + 16] & 0x7f) << 8) | b[o + 17];
        const mant = u32be(o + 18) * 2 ** 32 + u32be(o + 22);
        return valid(mant * 2 ** (exp - 16383 - 63));
      }
      o += 8 + u32be(o + 4) + (u32be(o + 4) & 1);
    }
    return null;
  }

  if (tag(start, 'fLaC') && start + 22 <= b.length) {
    return valid((b[start + 18] << 12) | (b[start + 19] << 4) | (b[start + 20] >> 4));
  }

  if (tag(0, 'OggS') && b.length > 27) {
    const p = 27 + b[26]; // first packet, after the segment table
    if (tag(p + 1, 'vorbis') && b[p] === 1 && p + 16 <= b.length) return valid(u32le(p + 12));
    if (tag(p, 'OpusHead')) return 48000; // Opus always decodes to 48 kHz
    return null;
  }

  // MP3 (Layer III): the first frame header that is followed by another
  // one where its length says the next frame starts.
  const V1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
  const V2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
  const frame = (o: number): { rate: number; length: number } | null => {
    if (o + 4 > b.length || b[o] !== 0xff || (b[o + 1] & 0xe0) !== 0xe0) return null;
    const version = (b[o + 1] >> 3) & 3; // 3 = MPEG1, 2 = MPEG2, 0 = MPEG2.5
    const layer = (b[o + 1] >> 1) & 3; // 1 = Layer III
    const bitrateIdx = b[o + 2] >> 4;
    const rateIdx = (b[o + 2] >> 2) & 3;
    if (version === 1 || layer !== 1 || bitrateIdx === 0 || bitrateIdx === 15 || rateIdx === 3) return null;
    const rate = [44100, 48000, 32000][rateIdx] / (version === 3 ? 1 : version === 2 ? 2 : 4);
    const kbps = (version === 3 ? V1 : V2)[bitrateIdx];
    const padding = (b[o + 2] >> 1) & 1;
    return { rate, length: Math.floor((version === 3 ? 144000 : 72000) * kbps / rate) + padding };
  };
  const end = Math.min(b.length - 4, start + 256 * 1024);
  for (let o = start; o < end; o++) {
    const f = frame(o);
    if (f && frame(o + f.length)?.rate === f.rate) return f.rate;
  }
  return null;
}
