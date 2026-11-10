import { createLiveSection } from './livePreview';
import { sniffSampleRate } from './sampleRate';

let audioContext: AudioContext | null = null;
let analyserNode: AnalyserNode | null = null;
let playbackGainNode: GainNode | null = null;

export function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  return audioContext;
}

export function getAnalyserNode(): AnalyserNode {
  if (!analyserNode) {
    const ctx = getAudioContext();
    analyserNode = ctx.createAnalyser();
    analyserNode.fftSize = 2048;
    analyserNode.connect(ctx.destination);
  }
  return analyserNode;
}

// Playback sources connect through this gain node (source -> gain ->
// analyser -> destination) so loudness-matched A/B can trim the level
// without touching the buffers.
export function getPlaybackGainNode(): GainNode {
  if (!playbackGainNode) {
    const ctx = getAudioContext();
    playbackGainNode = ctx.createGain();
    playbackGainNode.connect(getAnalyserNode());
  }
  return playbackGainNode;
}

// Playback sources connect here: the live preview section (EQ delta
// filters, width, mono check and band solo, see livePreview.ts) sits in front of the playback gain node.
let playbackInputNode: GainNode | null = null;
export function getPlaybackInputNode(): GainNode {
  if (!playbackInputNode) {
    playbackInputNode = createLiveSection(getAudioContext(), getPlaybackGainNode());
  }
  return playbackInputNode;
}

export function setPlaybackGainDB(db: number): void {
  const clamped = Math.max(-24, Math.min(24, db));
  getPlaybackGainNode().gain.value = Math.pow(10, clamped / 20);
}

// Debug/test handle: lets automated tests measure what is actually being
// played (analyser taps the live output path).
if (typeof window !== 'undefined') {
  (window as any).__masteringAudio = { getAnalyserNode, getPlaybackGainNode };
}

export async function resumeAudioContext(): Promise<void> {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') {
    await ctx.resume();
  }
}

// Decode at the file's own sample rate: decodeAudioData converts to the
// rate of its context, and the playback context runs at the output
// device's.
export async function decodeAudioFile(file: File): Promise<AudioBuffer> {
  const bytes = await file.arrayBuffer();
  const rate = sniffSampleRate(new Uint8Array(bytes));
  if (rate !== null && rate !== getAudioContext().sampleRate) {
    try {
      return await new OfflineAudioContext(2, 1, rate).decodeAudioData(bytes.slice(0));
    } catch {
      // Rate not supported by this browser: decode at the device's.
    }
  }
  return getAudioContext().decodeAudioData(bytes);
}

export function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const wav = encodeWav(audioBufferToFloat32Array(buffer), buffer.numberOfChannels, buffer.sampleRate);
  return new Blob([wav.buffer as ArrayBuffer], { type: 'audio/wav' });
}

// Encode interleaved float32 samples as a 24-bit PCM WAV with TPDF dither.
export function encodeWav(interleaved: Float32Array, numChannels: number, sampleRate: number): Uint8Array {
  const length = interleaved.length / numChannels;
  const bytesPerSample = 3; // 24-bit
  const dataSize = length * numChannels * bytesPerSample;
  const headerSize = 44;
  const arrayBuffer = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(arrayBuffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  // RIFF header
  writeString(0, 'RIFF');
  view.setUint32(4, headerSize - 8 + dataSize, true);
  writeString(8, 'WAVE');

  // fmt chunk
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);             // chunk size
  view.setUint16(20, 1, true);              // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
  view.setUint16(32, numChannels * bytesPerSample, true);
  view.setUint16(34, bytesPerSample * 8, true);

  // data chunk
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  // Interleaved 24-bit little-endian samples with 1-LSB TPDF dither
  const out = new Uint8Array(arrayBuffer);
  let offset = headerSize;
  for (let i = 0; i < interleaved.length; i++) {
    const sample = Math.max(-1, Math.min(1, interleaved[i]));
    const dither = Math.random() - Math.random();
    const v = Math.max(-0x800000, Math.min(0x7FFFFF, Math.round(sample * 0x7FFFFF + dither)));
    out[offset++] = v & 0xFF;
    out[offset++] = (v >> 8) & 0xFF;
    out[offset++] = (v >> 16) & 0xFF;
  }

  return out;
}

export function audioBufferToFloat32Array(buffer: AudioBuffer): Float32Array {
  const channels = buffer.numberOfChannels;
  const length = buffer.length;
  const interleaved = new Float32Array(length * channels);

  for (let i = 0; i < length; i++) {
    for (let ch = 0; ch < channels; ch++) {
      interleaved[i * channels + ch] = buffer.getChannelData(ch)[i];
    }
  }

  return interleaved;
}

export function float32ArrayToAudioBuffer(
  data: Float32Array,
  channels: number,
  sampleRate: number
): AudioBuffer {
  const ctx = getAudioContext();
  const length = data.length / channels;
  const buffer = ctx.createBuffer(channels, length, sampleRate);

  for (let ch = 0; ch < channels; ch++) {
    const channelData = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      channelData[i] = data[i * channels + ch];
    }
  }

  return buffer;
}
