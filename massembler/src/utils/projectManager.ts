import JSZip from 'jszip';
import { AudioFile, AudioFileOptimization, Track, AudioClip } from '../types';
import {
  createEffectChain,
  getEffectTailSeconds,
  resolveClipBuffer,
  resolveClipOffset,
  resolveClipPlaybackRate,
} from './clipEffects';

/**
 * Version of the .mass container format.
 *
 * Bump this whenever the archive layout or project.json shape changes in a
 * way older readers could not handle. Loading refuses anything it does not
 * recognise rather than guessing.
 *
 * 1 - audio always stored as `<id>.wav` (decoded PCM)
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
}

/** Extension to store an audio file under, derived from its original name. */
function storedFileName(audioFile: AudioFile): string {
  const original = audioFile.sourceFileName ?? '';
  const dot = original.lastIndexOf('.');
  const extension = dot > 0 ? original.slice(dot).toLowerCase() : '.wav';
  return `${audioFile.id}${extension}`;
}

/**
 * Export the mix to a WAV file using OfflineAudioContext
 */
export async function exportMix(
  tracks: Track[],
  clips: AudioClip[],
  audioFiles: AudioFile[],
  onProgress?: (progress: number) => void
): Promise<Blob> {
  // Calculate the total duration of the project
  let maxDuration = 0;
  tracks.forEach((track) => {
    track.clips.forEach((trackClip) => {
      const clip = clips.find((c) => c.id === trackClip.clipId);
      if (clip) {
        const effectiveStartTime = trackClip.trimStart ?? clip.startTime;
        const effectiveEndTime = trackClip.trimEnd ?? clip.endTime;
        const clipDuration = effectiveEndTime - effectiveStartTime;
        const endTime = trackClip.position + clipDuration * (trackClip.repeatCount || 1);
        // Reverb-style effects keep ringing after their source stops, so the
        // render has to be long enough to hold the tail.
        maxDuration = Math.max(maxDuration, endTime + getEffectTailSeconds(trackClip.effect));
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

  // Render each track
  tracks.forEach((track, trackIndex) => {
    if (track.muted) return;

    const trackGain = offlineContext.createGain();
    trackGain.gain.value = track.volume;
    trackGain.connect(offlineContext.destination);

    track.clips.forEach((trackClip) => {
      const clip = clips.find((c) => c.id === trackClip.clipId);
      if (!clip) return;

      const audioFile = audioFiles.find((f) => f.id === clip.audioFileId);
      if (!audioFile) return;

      const effectiveStartTime = trackClip.trimStart ?? clip.startTime;
      const effectiveEndTime = trackClip.trimEnd ?? clip.endTime;
      const clipDuration = effectiveEndTime - effectiveStartTime;

      const playClipOnce = (offset: number = 0) => {
        const source = offlineContext.createBufferSource();
        source.buffer = resolveClipBuffer(offlineContext, audioFile.buffer, trackClip.effect);

        // Create a gain node for fade in/out
        const fadeGain = offlineContext.createGain();

        // Same effect chain as realtime playback, so the export matches
        const effectChain = createEffectChain(offlineContext, trackClip.effect);
        if (effectChain) {
          source.connect(effectChain.input);
          effectChain.output.connect(fadeGain);
        } else {
          source.connect(fadeGain);
        }
        fadeGain.connect(trackGain);

        const startPosition = trackClip.position + offset;
        const fadeIn = trackClip.fadeIn || 0;
        const fadeOut = trackClip.fadeOut || 0;

        // Apply fade in
        if (fadeIn > 0) {
          fadeGain.gain.setValueAtTime(0, startPosition);
          fadeGain.gain.linearRampToValueAtTime(1, startPosition + fadeIn);
        } else {
          fadeGain.gain.setValueAtTime(1, startPosition);
        }

        // Apply fade out
        if (fadeOut > 0 && clipDuration > fadeOut) {
          fadeGain.gain.setValueAtTime(1, startPosition + clipDuration - fadeOut);
          fadeGain.gain.linearRampToValueAtTime(0, startPosition + clipDuration);
        }

        const rate = resolveClipPlaybackRate(trackClip.effect);
        source.playbackRate.value = rate;
        source.start(
          startPosition,
          resolveClipOffset(source.buffer, trackClip.effect, effectiveStartTime, effectiveEndTime),
          clipDuration * rate
        );
      };

      if (trackClip.repeat && trackClip.repeatCount) {
        for (let i = 0; i < trackClip.repeatCount; i++) {
          playClipOnce(i * clipDuration);
        }
      } else {
        playClipOnce();
      }
    });

    onProgress?.(0.1 + (trackIndex / tracks.length) * 0.4);
  });

  onProgress?.(0.5);

  // Render the audio
  const renderedBuffer = await offlineContext.startRendering();

  onProgress?.(0.8);

  // Convert to WAV
  const wavBlob = audioBufferToWav(renderedBuffer);

  onProgress?.(1.0);

  return wavBlob;
}

/**
 * Convert AudioBuffer to WAV blob
 */
function audioBufferToWav(buffer: AudioBuffer): Blob {
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
 * Load a project from a .mass file
 */
export async function loadProject(
  file: File,
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
  const projectData: ProjectData = JSON.parse(projectJsonText);

  if (projectData.version !== PROJECT_FORMAT_VERSION) {
    throw new Error(
      `Unsupported project format (found version ${projectData.version ?? 'none'}, ` +
        `this build reads version ${PROJECT_FORMAT_VERSION})`
    );
  }

  onProgress?.(0.3);

  // Load audio files
  const audioFiles: AudioFile[] = [];
  const audioFolder = zipContent.folder('audio');

  if (!audioFolder) {
    throw new Error('Invalid project file: audio folder not found');
  }

  // Drive the load from the metadata rather than from whatever is in the
  // folder, so the stored encoding can be anything the browser can decode.
  const audioContext = new AudioContext();
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
