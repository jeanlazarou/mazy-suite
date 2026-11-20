// RIFF/WAVE reader and writer working on the samples themselves, so that a
// file read and written back at the same bit depth is bit-identical wherever
// the gate left the audio alone (the browser decoder would resample it to the
// sound card rate).

const WAVE_FORMAT_PCM = 1;
const WAVE_FORMAT_IEEE_FLOAT = 3;
const WAVE_FORMAT_EXTENSIBLE = 0xfffe;

const fourCC = (bytes, offset) =>
  String.fromCharCode(
    bytes[offset],
    bytes[offset + 1],
    bytes[offset + 2],
    bytes[offset + 3]
  );

export function isWav(arrayBuffer) {
  if (arrayBuffer.byteLength < 12) return false;

  const bytes = new Uint8Array(arrayBuffer, 0, 12);

  return fourCC(bytes, 0) === "RIFF" && fourCC(bytes, 8) === "WAVE";
}

function readChunks(arrayBuffer) {
  const view = new DataView(arrayBuffer);
  const bytes = new Uint8Array(arrayBuffer);

  let fmt;
  let data;
  let offset = 12;

  while (offset + 8 <= view.byteLength) {
    const id = fourCC(bytes, offset);
    const body = offset + 8;
    // recorders that stream to disk may leave the size unset (0 or ~0)
    let size = Math.min(view.getUint32(offset + 4, true), view.byteLength - body);

    if (id === "fmt ") {
      fmt = {
        format: view.getUint16(body, true),
        channels: view.getUint16(body + 2, true),
        sampleRate: view.getUint32(body + 4, true),
        blockAlign: view.getUint16(body + 12, true),
        bitDepth: view.getUint16(body + 14, true),
      };

      if (fmt.format === WAVE_FORMAT_EXTENSIBLE && size >= 40) {
        fmt.format = view.getUint16(body + 24, true);
      }
    } else if (id === "data") {
      if (size === 0) size = view.byteLength - body;

      data = { offset: body, size };
    }

    offset = body + size + (size % 2);
  }

  if (!fmt) throw new Error("This WAV file has no format chunk");
  if (!data) throw new Error("This WAV file has no audio data");

  return { fmt, data };
}

function sampleReader(format, bitDepth, bytes, view) {
  if (format === WAVE_FORMAT_IEEE_FLOAT) {
    if (bitDepth === 32) return (p) => view.getFloat32(p, true);
    if (bitDepth === 64) return (p) => view.getFloat64(p, true);
  } else if (format === WAVE_FORMAT_PCM) {
    if (bitDepth === 8) return (p) => (bytes[p] - 128) / 128;
    if (bitDepth === 16) return (p) => view.getInt16(p, true) / 32768;
    if (bitDepth === 24)
      return (p) =>
        (((bytes[p] | (bytes[p + 1] << 8) | (bytes[p + 2] << 16)) << 8) >> 8) /
        8388608;
    if (bitDepth === 32) return (p) => view.getInt32(p, true) / 2147483648;
  }

  return null;
}

// -> { sampleRate, channels: Float32Array[], bitDepth, float }
export function decodeWav(arrayBuffer) {
  if (!isWav(arrayBuffer)) throw new Error("Not a WAV file");

  const { fmt, data } = readChunks(arrayBuffer);
  const view = new DataView(arrayBuffer);
  const bytes = new Uint8Array(arrayBuffer);

  const read = sampleReader(fmt.format, fmt.bitDepth, bytes, view);

  if (!read || fmt.channels < 1) {
    throw new Error(
      `Unsupported WAV encoding (format ${fmt.format}, ${fmt.bitDepth} bits)`
    );
  }

  const step = fmt.bitDepth / 8;
  const frames = Math.floor(data.size / fmt.blockAlign);
  const channels = [];

  for (let c = 0; c < fmt.channels; c++) {
    const samples = new Float32Array(frames);
    let p = data.offset + c * step;

    for (let i = 0; i < frames; i++, p += fmt.blockAlign) {
      samples[i] = read(p);
    }

    channels.push(samples);
  }

  return {
    sampleRate: fmt.sampleRate,
    channels,
    bitDepth: fmt.bitDepth,
    float: fmt.format === WAVE_FORMAT_IEEE_FLOAT,
  };
}

const writeText = (bytes, offset, text) => {
  for (let i = 0; i < text.length; i++) bytes[offset + i] = text.charCodeAt(i);
};

// format: { bitDepth: 16 | 24 | 32, float: boolean } (32 bits is float only)
export function encodeWav(channels, sampleRate, { bitDepth = 24, float = false } = {}) {
  const isFloat = float || bitDepth === 32;
  const depth = isFloat ? 32 : bitDepth;

  if (!isFloat && depth !== 16 && depth !== 24) {
    throw new Error(`Cannot write ${depth}-bit integer WAV files`);
  }

  const count = channels.length;
  const frames = count ? channels[0].length : 0;
  const step = depth / 8;
  const blockAlign = count * step;
  const dataSize = frames * blockAlign;

  // float files carry the 18-byte fmt chunk and the fact chunk the spec asks for
  const fmtSize = isFloat ? 18 : 16;
  const factSize = isFloat ? 12 : 0;
  const headerSize = 12 + 8 + fmtSize + factSize + 8;
  const pad = dataSize % 2;

  const buffer = new ArrayBuffer(headerSize + dataSize + pad);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  writeText(bytes, 0, "RIFF");
  view.setUint32(4, buffer.byteLength - 8, true);
  writeText(bytes, 8, "WAVE");

  writeText(bytes, 12, "fmt ");
  view.setUint32(16, fmtSize, true);
  view.setUint16(20, isFloat ? WAVE_FORMAT_IEEE_FLOAT : WAVE_FORMAT_PCM, true);
  view.setUint16(22, count, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, depth, true);

  let offset = 20 + fmtSize;

  if (isFloat) {
    view.setUint16(36, 0, true);

    writeText(bytes, offset, "fact");
    view.setUint32(offset + 4, 4, true);
    view.setUint32(offset + 8, frames, true);
    offset += 12;
  }

  writeText(bytes, offset, "data");
  view.setUint32(offset + 4, dataSize, true);
  offset += 8;

  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < count; c++, offset += step) {
      const x = channels[c][i];

      if (isFloat) {
        view.setFloat32(offset, x, true);
      } else if (depth === 16) {
        view.setInt16(offset, Math.max(-32768, Math.min(32767, Math.round(x * 32768))), true);
      } else {
        const v = Math.max(-8388608, Math.min(8388607, Math.round(x * 8388608)));

        bytes[offset] = v & 0xff;
        bytes[offset + 1] = (v >> 8) & 0xff;
        bytes[offset + 2] = (v >> 16) & 0xff;
      }
    }
  }

  return buffer;
}
