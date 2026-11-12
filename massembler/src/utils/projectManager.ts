import JSZip from 'jszip';
import { AudioFile, AudioFileOptimization, Track, AudioClip } from '../types';
import { getEffectTailSeconds } from './clipEffects';
import { getTrackClipEnd } from './clipTiming';
import { scheduleArrangement } from './scheduler';
import { isTrackAudible } from './trackAudibility';

/**
 * Version of the .mass container format.
 *
 * Bump this whenever the archive layout or project.json shape changes in a
 * way older readers could not handle. Loading upgrades older versions (see
 * upgradeProjectData) and refuses newer ones rather than guessing.
 *
 * 1 - audio always stored as `<id>.wav` (decoded PCM); version written as '1.0.0'
 * 2 - audio stored in its source encoding, named by `storedFile`
 * 3 - audio may be trimmed to used regions, described by `optimization`
 */
export const PROJECT_FORMAT_VERSION = 3;

export interface ProjectData {
  version: number;
  name: string;
  tracks: Track[];
  clips: AudioClip[];
  audioFiles: Array<{
    id: string;
    name: string;
    duration: number;
    /** Name of this file inside the archive's audio/ folder. */
    storedFile: string;
    /** Present when the audio was trimmed to the regions clips reference. */
    optimization?: AudioFileOptimization;
  }>;
  pixelsPerSecond: number;
  /** Volume of the whole mix; absent (full) in projects saved before it existed. */
  masterVolume?: number;
}

/** project.json as any version of the format wrote it. */
type StoredProjectData = Omit<ProjectData, 'version' | 'audioFiles'> & {
  version?: number | string;
  audioFiles?: Array<
    Omit<ProjectData['audioFiles'][number], 'storedFile'> & { storedFile?: string }
  >;
};

/** Bring a project.json from any earlier format version up to the current one. */
export function upgradeProjectData(stored: StoredProjectData): ProjectData {
  const version = stored.version === '1.0.0' ? 1 : stored.version;

  if (typeof version !== 'number' || version < 1) {
    throw new Error(`Unsupported project format (found version ${stored.version ?? 'none'})`);
  }
  if (version > PROJECT_FORMAT_VERSION) {
    throw new Error(
      `This project was saved by a newer Massembler (format version ${version}); ` +
        `this build reads up to version ${PROJECT_FORMAT_VERSION}`
    );
  }

  return {
    ...stored,
    version: PROJECT_FORMAT_VERSION,
    audioFiles: (stored.audioFiles ?? []).map((meta) => ({
      ...meta,
      storedFile: meta.storedFile ?? `${meta.id}.wav`,
    })),
  };
}

/** Extension to store an audio file under, derived from its original name. */
function storedFileName(audioFile: AudioFile): string {
  const original = audioFile.sourceFileName ?? '';
  const dot = original.lastIndexOf('.');
  const extension = dot > 0 ? original.slice(dot).toLowerCase() : '.wav';
  return `${audioFile.id}${extension}`;
}

/** The loudest an exported mix may peak: just under full scale. */
const EXPORT_PEAK = 0.98;

/**
 * Turn a rendered mix down as a whole if it would clip. Tracks are summed at
 * their own volumes, so a mix can peak past full scale, and the WAV writer
 * would flatten every sample beyond it. A mix that fits is left untouched.
 * Returns the gain applied: 1 when none was needed.
 */
export function preventClipping(buffer: AudioBuffer, peak = EXPORT_PEAK): number {
  let loudest = 0;
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    for (const sample of buffer.getChannelData(channel)) {
      const level = Math.abs(sample);
      if (level > loudest) loudest = level;
    }
  }
  if (loudest <= 1) return 1;

  const gain = peak / loudest;
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < data.length; i++) data[i] *= gain;
  }
  return gain;
}

/**
 * Export the mix to a WAV file using OfflineAudioContext. `gain` is what was
 * applied to keep it from clipping, 1 when nothing was.
 */
export async function exportMix(
  tracks: Track[],
  clips: AudioClip[],
  audioFiles: AudioFile[],
  masterVolume: number,
  onProgress?: (progress: number) => void
): Promise<{ blob: Blob; gain: number }> {
  // Calculate the total duration of the project
  let maxDuration = 0;
  tracks.forEach((track) => {
    track.clips.forEach((trackClip) => {
      const clip = clips.find((c) => c.id === trackClip.clipId);
      if (clip) {
        // Reverb-style effects keep ringing after their source stops, so the
        // render has to be long enough to hold the tail.
        maxDuration = Math.max(
          maxDuration,
          getTrackClipEnd(trackClip, clip) + getEffectTailSeconds(trackClip.effect)
        );
      }
    });
  });

  if (maxDuration === 0) {
    throw new Error('No audio to export');
  }

  onProgress?.(0.1);

  // Create an offline audio context for rendering
  const sampleRate = audioFiles[0]?.buffer.sampleRate || 44100;
  const offlineContext = new OfflineAudioContext(2, Math.ceil(maxDuration * sampleRate), sampleRate);

  // The same mix as playback: each track's volume and pan, then the master.
  // Solo affects the export too: what you hear is what gets rendered.
  const master = offlineContext.createGain();
  master.gain.value = masterVolume;
  master.connect(offlineContext.destination);

  const trackGains = new Map<string, GainNode>();
  for (const track of tracks) {
    if (!isTrackAudible(track, tracks)) continue;
    const gain = offlineContext.createGain();
    gain.gain.value = track.volume;
    const panner = offlineContext.createStereoPanner();
    panner.pan.value = track.pan ?? 0;
    gain.connect(panner);
    panner.connect(master);
    trackGains.set(track.id, gain);
  }

  // The same scheduling as realtime playback, from the top.
  scheduleArrangement(
    offlineContext,
    tracks,
    clips,
    audioFiles,
    (track) => trackGains.get(track.id) ?? null,
    0,
    0
  );

  onProgress?.(0.5);

  // Render the audio
  const renderedBuffer = await offlineContext.startRendering();

  onProgress?.(0.8);

  const gain = preventClipping(renderedBuffer);
  const blob = audioBufferToWav(renderedBuffer);

  onProgress?.(1.0);

  return { blob, gain };
}

/**
 * Convert AudioBuffer to WAV blob
 */
export function audioBufferToWav(buffer: AudioBuffer): Blob {
  const length = buffer.length * buffer.numberOfChannels * 2 + 44;
  const arrayBuffer = new ArrayBuffer(length);
  const view = new DataView(arrayBuffer);
  const channels: Float32Array[] = [];
  let offset = 0;
  let pos = 0;

  // Write WAV header
  const setUint16 = (data: number) => {
    view.setUint16(pos, data, true);
    pos += 2;
  };
  const setUint32 = (data: number) => {
    view.setUint32(pos, data, true);
    pos += 4;
  };

  // "RIFF" chunk descriptor
  setUint32(0x46464952); // "RIFF"
  setUint32(length - 8); // File size - 8
  setUint32(0x45564157); // "WAVE"

  // "fmt " sub-chunk
  setUint32(0x20746d66); // "fmt "
  setUint32(16); // Subchunk1Size (16 for PCM)
  setUint16(1); // AudioFormat (1 for PCM)
  setUint16(buffer.numberOfChannels);
  setUint32(buffer.sampleRate);
  setUint32(buffer.sampleRate * 2 * buffer.numberOfChannels); // ByteRate
  setUint16(buffer.numberOfChannels * 2); // BlockAlign
  setUint16(16); // BitsPerSample

  // "data" sub-chunk
  setUint32(0x61746164); // "data"
  setUint32(length - pos - 4); // Subchunk2Size

  // Write interleaved data
  for (let i = 0; i < buffer.numberOfChannels; i++) {
    channels.push(buffer.getChannelData(i));
  }

  while (pos < length) {
    for (let i = 0; i < buffer.numberOfChannels; i++) {
      let sample = Math.max(-1, Math.min(1, channels[i][offset]));
      sample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(pos, sample, true);
      pos += 2;
    }
    offset++;
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

/**
 * Save the project as a .mass file (zip with audio files + JSON)
 */
export async function saveProject(
  projectName: string,
  tracks: Track[],
  clips: AudioClip[],
  audioFiles: AudioFile[],
  pixelsPerSecond: number,
  masterVolume: number,
  onProgress?: (progress: number) => void
): Promise<Blob> {
  const zip = new JSZip();

  onProgress?.(0.1);

  // Create project data (without audio buffers)
  const projectData: ProjectData = {
    version: PROJECT_FORMAT_VERSION,
    name: projectName,
    tracks: tracks.map((t) => ({
      ...t,
      clips: t.clips.map((tc) => ({ ...tc })),
    })),
    clips: clips.map((c) => ({ ...c })),
    audioFiles: audioFiles.map((af) => ({
      id: af.id,
      name: af.name,
      duration: af.duration,
      storedFile: af.sourceBlob ? storedFileName(af) : `${af.id}.wav`,
      optimization: af.optimization,
    })),
    pixelsPerSecond,
    masterVolume,
  };

  // Add project.json
  zip.file('project.json', JSON.stringify(projectData, null, 2));

  onProgress?.(0.3);

  // Add audio files
  const audioFolder = zip.folder('audio');
  if (audioFolder) {
    for (let i = 0; i < audioFiles.length; i++) {
      const audioFile = audioFiles[i];
      if (audioFile.sourceBlob) {
        // Store the upload as-is. For a compressed source this is typically
        // several times smaller than the decoded PCM, and it is lossless
        // with respect to what the user actually gave us.
        audioFolder.file(storedFileName(audioFile), audioFile.sourceBlob);
      } else {
        audioFolder.file(`${audioFile.id}.wav`, audioBufferToWav(audioFile.buffer));
      }
      onProgress?.(0.3 + (i / audioFiles.length) * 0.5);
    }
  }

  onProgress?.(0.9);

  // Generate the zip
  const blob = await zip.generateAsync({ type: 'blob' });

  onProgress?.(1.0);

  return blob;
}

/**
 * Load a project from a .mass file, decoding its audio with the app's own
 * audio context.
 */
export async function loadProject(
  file: File,
  audioContext: BaseAudioContext,
  onProgress?: (progress: number) => void
): Promise<{
  projectData: ProjectData;
  audioFiles: AudioFile[];
}> {
  const zip = new JSZip();

  onProgress?.(0.1);

  // Load the zip
  const zipContent = await zip.loadAsync(file);

  onProgress?.(0.2);

  // Read project.json
  const projectJsonFile = zipContent.file('project.json');
  if (!projectJsonFile) {
    throw new Error('Invalid project file: project.json not found');
  }

  const projectJsonText = await projectJsonFile.async('text');
  const projectData = upgradeProjectData(JSON.parse(projectJsonText));

  onProgress?.(0.3);

  // Load audio files
  const audioFiles: AudioFile[] = [];
  const audioFolder = zipContent.folder('audio');

  if (!audioFolder) {
    throw new Error('Invalid project file: audio folder not found');
  }

  // Drive the load from the metadata rather than from whatever is in the
  // folder, so the stored encoding can be anything the browser can decode.
  const metas = projectData.audioFiles ?? [];

  for (let i = 0; i < metas.length; i++) {
    const meta = metas[i];
    const entry = zipContent.file(`audio/${meta.storedFile}`);

    if (!entry) {
      throw new Error(`Invalid project file: audio for "${meta.name}" not found`);
    }

    const blob = await entry.async('blob');
    // decodeAudioData detaches the buffer it is given, so decode a copy and
    // keep the blob for the next save.
    const audioBuffer = await audioContext.decodeAudioData(await blob.arrayBuffer());

    audioFiles.push({
      id: meta.id,
      name: meta.name,
      buffer: audioBuffer,
      duration: audioBuffer.duration,
      sourceBlob: blob,
      sourceFileName: meta.storedFile,
      optimization: meta.optimization,
    });

    onProgress?.(0.3 + (i / Math.max(metas.length, 1)) * 0.6);
  }

  onProgress?.(1.0);

  return { projectData, audioFiles };
}

/**
 * Download a blob as a file
 */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
