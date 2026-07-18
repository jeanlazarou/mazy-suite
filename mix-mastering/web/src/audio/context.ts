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

export function decodeAudioFile(file: File): Promise<AudioBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const ctx = getAudioContext();
        const buffer = await ctx.decodeAudioData(reader.result as ArrayBuffer);
        resolve(buffer);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

export function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const wav = encodeWav(audioBufferToFloat32Array(buffer), buffer.numberOfChannels, buffer.sampleRate);
  return new Blob([wav.buffer as ArrayBuffer], { type: 'audio/wav' });
}

// Encode interleaved float32 samples as a 16-bit PCM WAV with TPDF dither.
export function encodeWav(interleaved: Float32Array, numChannels: number, sampleRate: number): Uint8Array {
  const length = interleaved.length / numChannels;
  const bytesPerSample = 2; // 16-bit
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

  // Interleaved 16-bit samples with 1-LSB TPDF dither
  let offset = headerSize;
  for (let i = 0; i < interleaved.length; i++) {
    const sample = Math.max(-1, Math.min(1, interleaved[i]));
    const dither = Math.random() - Math.random();
    const scaled = Math.round(sample * 0x7FFF + dither);
    view.setInt16(offset, Math.max(-0x8000, Math.min(0x7FFF, scaled)), true);
    offset += 2;
  }

  return new Uint8Array(arrayBuffer);
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
