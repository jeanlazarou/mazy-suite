import { describe, expect, it } from "vitest";

import { decodeWav, encodeWav, isWav } from "./wav";

const ramp = (length, scale = 1) =>
  Float32Array.from({ length }, (_, i) => scale * Math.sin(i / 7) * (i % 13) / 13);

// integer samples, as an int recorder would have stored them
const quantized = (length, bits) => {
  const full = 2 ** (bits - 1);

  return Float32Array.from({ length }, (_, i) => {
    const v = Math.round(Math.sin(i / 5) * (full - 1) * ((i % 11) / 11));

    return v / full || 0; // an integer file has no -0
  });
};

describe("encodeWav / decodeWav", () => {
  it("round-trips 16-bit samples exactly", () => {
    const left = quantized(1000, 16);
    const right = quantized(1000, 16).map((v) => -v || 0);

    left[3] = -1; // the most negative value must survive too

    const decoded = decodeWav(encodeWav([left, right], 44100, { bitDepth: 16 }));

    expect(decoded.sampleRate).toBe(44100);
    expect(decoded.bitDepth).toBe(16);
    expect(decoded.float).toBe(false);
    expect(decoded.channels).toHaveLength(2);
    expect(Array.from(decoded.channels[0])).toEqual(Array.from(left));
    expect(Array.from(decoded.channels[1])).toEqual(Array.from(right));
  });

  it("round-trips 24-bit samples exactly", () => {
    const mono = quantized(5000, 24);

    const decoded = decodeWav(encodeWav([mono], 48000, { bitDepth: 24 }));

    expect(decoded.bitDepth).toBe(24);
    expect(Array.from(decoded.channels[0])).toEqual(Array.from(mono));
  });

  it("round-trips 32-bit float samples exactly", () => {
    const mono = ramp(777, 1.5); // float files may go over full scale

    const decoded = decodeWav(encodeWav([mono], 96000, { bitDepth: 32, float: true }));

    expect(decoded.float).toBe(true);
    expect(decoded.sampleRate).toBe(96000);
    expect(Array.from(decoded.channels[0])).toEqual(Array.from(mono));
  });

  it("clips integer samples over full scale", () => {
    const decoded = decodeWav(encodeWav([Float32Array.of(1.5, -1.5)], 8000, { bitDepth: 16 }));

    expect(decoded.channels[0][0]).toBeCloseTo(32767 / 32768, 6);
    expect(decoded.channels[0][1]).toBe(-1);
  });

  it("writes an odd-sized data chunk with its pad byte", () => {
    const buffer = encodeWav([Float32Array.of(0)], 8000, { bitDepth: 24 });

    expect(buffer.byteLength % 2).toBe(0);
    expect(decodeWav(buffer).channels[0]).toHaveLength(1);
  });
});

describe("decodeWav", () => {
  it("skips the chunks it does not know", () => {
    const plain = new Uint8Array(encodeWav([Float32Array.of(0.5, -0.5)], 8000, { bitDepth: 16 }));

    // a LIST chunk between fmt and data, as many recorders write one
    const list = new Uint8Array([0x4c, 0x49, 0x53, 0x54, 3, 0, 0, 0, 1, 2, 3, 0]);
    const file = new Uint8Array(plain.length + list.length);

    file.set(plain.subarray(0, 36));
    file.set(list, 36);
    file.set(plain.subarray(36), 36 + list.length);

    const decoded = decodeWav(file.buffer);

    expect(Array.from(decoded.channels[0])).toEqual([0.5, -0.5]);
  });

  it("reads WAVE_FORMAT_EXTENSIBLE files", () => {
    const plain = new Uint8Array(encodeWav([Float32Array.of(0.25)], 8000, { bitDepth: 16 }));
    const view = new DataView(plain.buffer);

    // turn the 16-byte fmt into a 40-byte extensible one
    const file = new Uint8Array(plain.length + 24);
    file.set(plain.subarray(0, 36));
    file.set(plain.subarray(36), 60);

    const out = new DataView(file.buffer);
    out.setUint32(4, file.length - 8, true);
    out.setUint32(16, 40, true);
    out.setUint16(20, 0xfffe, true);
    out.setUint16(36, 22, true);
    out.setUint16(38, 16, true);
    out.setUint32(40, 4, true);
    out.setUint16(44, 1, true); // sub-format: PCM

    expect(view.getUint16(20, true)).toBe(1);
    expect(Array.from(decodeWav(file.buffer).channels[0])).toEqual([0.25]);
  });

  it("refuses what is not a WAV file", () => {
    const mp3 = new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 0, 0, 0]);

    expect(isWav(mp3.buffer)).toBe(false);
    expect(() => decodeWav(mp3.buffer)).toThrow("Not a WAV file");
  });
});
