import { AudioClip, AudioFile, Track, UsedSegment } from '../types';

/**
 * Project optimization: trim each audio file down to the regions clips
 * actually reference, so saved projects stop carrying material nothing uses.
 *
 * This is lossy in an editing sense rather than an audio sense - the samples
 * that survive are untouched, but everything outside the kept segments is
 * gone, so clips can no longer be extended into it. The segment map is
 * recorded in the project so the original recording can be relinked later.
 */

/**
 * Head and tail kept around every used region.
 *
 * Clip edges are resizable on the timeline and clamp to the audio file's
 * bounds, not the clip's, so trimming flush to the used region would quietly
 * remove the room those handles need. Two seconds costs little and keeps the
 * interaction alive.
 */
export const SEGMENT_PADDING_SECONDS = 2;

/**
 * Default "worth doing" floor, in bytes.
 *
 * Ranking is by absolute saving rather than percentage on purpose: 90% off a
 * 400 KB file is noise, while 10% off a 130 MB file is not.
 */
export const DEFAULT_SAVING_FLOOR_BYTES = 5 * 1024 * 1024;

/**
 * A saving this large counts even without clearing the main floor, provided
 * it also removes most of the file - which catches the "small file, but
 * almost all of it is dead weight" case that a flat byte floor misses.
 */
const MINOR_SAVING_FLOOR_BYTES = 2 * 1024 * 1024;
const MINOR_SAVING_RATIO = 0.5;

/** Whether optimizing this file is worth recommending by default. */
function isWorthwhile(savedBytes: number, currentBytes: number): boolean {
  if (savedBytes <= 0) return false;
  if (savedBytes >= DEFAULT_SAVING_FLOOR_BYTES) return true;
  return (
    savedBytes >= MINOR_SAVING_FLOOR_BYTES &&
    savedBytes / Math.max(currentBytes, 1) >= MINOR_SAVING_RATIO
  );
}

/** Bytes a buffer costs when stored as the 16-bit PCM WAV the archive uses. */
export function pcmByteSize(frames: number, channels: number): number {
  return frames * channels * 2 + 44;
}

/** What this audio file currently costs inside a saved .mass. */
export function currentByteSize(audioFile: AudioFile): number {
  return (
    audioFile.sourceBlob?.size ??
    pcmByteSize(audioFile.buffer.length, audioFile.buffer.numberOfChannels)
  );
}

/**
 * Every region of an audio file that must survive: each library clip's own
 * definition, plus any track clip whose trim overrides widen it.
 *
 * Library clips count even when not placed on a track - they are still
 * draggable from the library, so dropping their audio would break them.
 */
export function computeUsedSegments(
  audioFileId: string,
  clips: AudioClip[],
  tracks: Track[],
  duration: number,
  padding: number = SEGMENT_PADDING_SECONDS
): UsedSegment[] {
  const owned = clips.filter((clip) => clip.audioFileId === audioFileId);
  if (owned.length === 0) return [];

  const ranges: UsedSegment[] = [];

  for (const clip of owned) {
    ranges.push({ start: clip.startTime, end: clip.endTime });

    for (const track of tracks) {
      for (const trackClip of track.clips) {
        if (trackClip.clipId !== clip.id) continue;
        ranges.push({
          start: trackClip.trimStart ?? clip.startTime,
          end: trackClip.trimEnd ?? clip.endTime,
        });
      }
    }
  }

  // Pad, clamp, then merge anything that touches or overlaps.
  const padded = ranges
    .map((r) => ({
      start: Math.max(0, Math.min(r.start, r.end) - padding),
      end: Math.min(duration, Math.max(r.start, r.end) + padding),
    }))
    .filter((r) => r.end > r.start)
    .sort((a, b) => a.start - b.start);

  const merged: UsedSegment[] = [];
  for (const range of padded) {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end) {
      last.end = Math.max(last.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }

  return merged;
}

/** Total seconds covered by a segment list. */
export function segmentsDuration(segments: UsedSegment[]): number {
  return segments.reduce((total, s) => total + (s.end - s.start), 0);
}

/**
 * Original-file time -> optimized-file time.
 *
 * Times inside a kept segment land at that segment's new offset. Times in a
 * discarded gap collapse onto the nearest surviving boundary, which only
 * happens for values that were not in use to begin with.
 */
export function remapTime(time: number, segments: UsedSegment[]): number {
  let consumed = 0;
  for (const segment of segments) {
    if (time <= segment.end) {
      return consumed + Math.max(0, time - segment.start);
    }
    consumed += segment.end - segment.start;
  }
  return consumed;
}

/** Optimized-file time -> original-file time. Inverse of remapTime. */
export function unmapTime(time: number, segments: UsedSegment[]): number {
  let consumed = 0;
  for (const segment of segments) {
    const length = segment.end - segment.start;
    if (time <= consumed + length) {
      return segment.start + Math.max(0, time - consumed);
    }
    consumed += length;
  }
  return segments.length ? segments[segments.length - 1].end : time;
}

/** Concatenate the kept segments into a new buffer. */
export function buildOptimizedBuffer(
  buffer: AudioBuffer,
  segments: UsedSegment[]
): AudioBuffer {
  const rate = buffer.sampleRate;
  const channels = buffer.numberOfChannels;

  const frameCounts = segments.map((segment) => {
    const startFrame = Math.round(segment.start * rate);
    const wanted = Math.round((segment.end - segment.start) * rate);
    return Math.max(0, Math.min(wanted, buffer.length - startFrame));
  });

  const totalFrames = Math.max(1, frameCounts.reduce((n, c) => n + c, 0));

  // OfflineAudioContext is only used here as an AudioBuffer factory.
  const factory = new OfflineAudioContext(channels, totalFrames, rate);
  const output = factory.createBuffer(channels, totalFrames, rate);

  let writeOffset = 0;
  segments.forEach((segment, index) => {
    const frames = frameCounts[index];
    if (frames === 0) return;
    const startFrame = Math.round(segment.start * rate);

    for (let channel = 0; channel < channels; channel++) {
      const source = buffer
        .getChannelData(channel)
        .subarray(startFrame, startFrame + frames);
      output.getChannelData(channel).set(source, writeOffset);
    }
    writeOffset += frames;
  });

  return output;
}

/* -------------------------------------------------------------------------- */
/* Analysis                                                                    */
/* -------------------------------------------------------------------------- */

export interface OptimizationReport {
  audioFileId: string;
  name: string;
  /** Names of the library clips that reference this file. */
  clipNames: string[];
  totalSeconds: number;
  usedSeconds: number;
  currentBytes: number;
  optimizedBytes: number;
  /** Positive means optimizing shrinks the project; negative means it grows. */
  savedBytes: number;
  segments: UsedSegment[];
  /** No clip references this file at all - optimizing drops it entirely. */
  unused: boolean;
  /**
   * True when optimizing is a real win. Compressed sources are already small,
   * so re-encoding their trimmed audio to PCM can easily cost more than it
   * saves; those come out with a negative saving and are not recommended.
   */
  worthwhile: boolean;
}

export function analyzeProject(
  audioFiles: AudioFile[],
  clips: AudioClip[],
  tracks: Track[]
): OptimizationReport[] {
  return audioFiles
    .map((audioFile) => {
      const segments = computeUsedSegments(
        audioFile.id,
        clips,
        tracks,
        audioFile.duration
      );
      const usedSeconds = segmentsDuration(segments);
      const frames = Math.round(usedSeconds * audioFile.buffer.sampleRate);
      const currentBytes = currentByteSize(audioFile);
      const optimizedBytes = segments.length
        ? pcmByteSize(frames, audioFile.buffer.numberOfChannels)
        : 0;
      const unused = segments.length === 0;
      const savedBytes = currentBytes - optimizedBytes;

      return {
        audioFileId: audioFile.id,
        name: audioFile.name,
        clipNames: clips
          .filter((clip) => clip.audioFileId === audioFile.id)
          .map((clip) => clip.name),
        totalSeconds: audioFile.duration,
        usedSeconds,
        currentBytes,
        optimizedBytes,
        savedBytes,
        segments,
        unused,
        worthwhile: unused || isWorthwhile(savedBytes, currentBytes),
      };
    })
    .sort((a, b) => b.savedBytes - a.savedBytes);
}

/* -------------------------------------------------------------------------- */
/* Applying                                                                    */
/* -------------------------------------------------------------------------- */

export interface OptimizedProject {
  tracks: Track[];
  clips: AudioClip[];
  audioFiles: AudioFile[];
}

/**
 * Produce an optimized copy of the project state.
 *
 * Nothing here mutates its input: the caller keeps working with the full
 * quality project while only the saved copy is reduced.
 */
export function optimizeProject(
  tracks: Track[],
  clips: AudioClip[],
  audioFiles: AudioFile[],
  audioFileIds: Iterable<string>
): OptimizedProject {
  const selected = new Set(audioFileIds);
  const segmentsById = new Map<string, UsedSegment[]>();
  const droppedAudioIds = new Set<string>();

  const optimizedAudioFiles: AudioFile[] = [];

  for (const audioFile of audioFiles) {
    if (!selected.has(audioFile.id)) {
      optimizedAudioFiles.push(audioFile);
      continue;
    }

    const segments = computeUsedSegments(
      audioFile.id,
      clips,
      tracks,
      audioFile.duration
    );

    if (segments.length === 0) {
      // Nothing references it; leave it out of the copy altogether.
      droppedAudioIds.add(audioFile.id);
      continue;
    }

    segmentsById.set(audioFile.id, segments);

    const previous = audioFile.optimization;
    const buffer = buildOptimizedBuffer(audioFile.buffer, segments);

    optimizedAudioFiles.push({
      id: audioFile.id,
      name: audioFile.name,
      buffer,
      duration: buffer.duration,
      // Trimmed audio has no original encoding left to store, so the archive
      // falls back to writing PCM for it.
      sourceBlob: undefined,
      sourceFileName: undefined,
      optimization: {
        // Re-optimizing an already optimized file keeps pointing at the
        // recording the user still has on disk.
        originalName: previous?.originalName ?? audioFile.sourceFileName ?? audioFile.name,
        originalDuration: previous?.originalDuration ?? audioFile.duration,
        segments: previous
          ? segments.map((segment) => ({
              start: unmapTime(segment.start, previous.segments),
              end: unmapTime(segment.end, previous.segments),
            }))
          : segments,
      },
    });
  }

  const optimizedClips = clips
    .filter((clip) => !droppedAudioIds.has(clip.audioFileId))
    .map((clip) => {
      const segments = segmentsById.get(clip.audioFileId);
      if (!segments) return { ...clip };
      const startTime = remapTime(clip.startTime, segments);
      const endTime = remapTime(clip.endTime, segments);
      return { ...clip, startTime, endTime, duration: endTime - startTime };
    });

  const survivingClipIds = new Set(optimizedClips.map((clip) => clip.id));

  const optimizedTracks = tracks.map((track) => ({
    ...track,
    clips: track.clips
      .filter((trackClip) => survivingClipIds.has(trackClip.clipId))
      .map((trackClip) => {
        const clip = clips.find((c) => c.id === trackClip.clipId);
        const segments = clip ? segmentsById.get(clip.audioFileId) : undefined;
        if (!segments) return { ...trackClip };
        return {
          ...trackClip,
          trimStart:
            trackClip.trimStart === undefined
              ? undefined
              : remapTime(trackClip.trimStart, segments),
          trimEnd:
            trackClip.trimEnd === undefined
              ? undefined
              : remapTime(trackClip.trimEnd, segments),
        };
      }),
  }));

  return {
    tracks: optimizedTracks,
    clips: optimizedClips,
    audioFiles: optimizedAudioFiles,
  };
}

/**
 * Undo an optimization by pointing an audio file back at its original
 * recording, expanding every clip time back into original-file coordinates.
 */
export function relinkOriginal(
  audioFileId: string,
  originalBuffer: AudioBuffer,
  originalBlob: Blob,
  originalFileName: string,
  tracks: Track[],
  clips: AudioClip[],
  audioFiles: AudioFile[]
): OptimizedProject {
  const target = audioFiles.find((audioFile) => audioFile.id === audioFileId);
  const segments = target?.optimization?.segments;
  if (!target || !segments) {
    throw new Error('That audio file has not been optimized');
  }

  const restoredAudioFiles = audioFiles.map((audioFile) =>
    audioFile.id === audioFileId
      ? {
          id: audioFile.id,
          name: audioFile.name,
          buffer: originalBuffer,
          duration: originalBuffer.duration,
          sourceBlob: originalBlob,
          sourceFileName: originalFileName,
          optimization: undefined,
        }
      : audioFile
  );

  const restoredClips = clips.map((clip) => {
    if (clip.audioFileId !== audioFileId) return { ...clip };
    const startTime = unmapTime(clip.startTime, segments);
    const endTime = unmapTime(clip.endTime, segments);
    return { ...clip, startTime, endTime, duration: endTime - startTime };
  });

  const restoredTracks = tracks.map((track) => ({
    ...track,
    clips: track.clips.map((trackClip) => {
      const clip = clips.find((c) => c.id === trackClip.clipId);
      if (!clip || clip.audioFileId !== audioFileId) return { ...trackClip };
      return {
        ...trackClip,
        trimStart:
          trackClip.trimStart === undefined
            ? undefined
            : unmapTime(trackClip.trimStart, segments),
        trimEnd:
          trackClip.trimEnd === undefined
            ? undefined
            : unmapTime(trackClip.trimEnd, segments),
      };
    }),
  }));

  return { tracks: restoredTracks, clips: restoredClips, audioFiles: restoredAudioFiles };
}

/** Human-readable byte size, signed so savings and costs both read naturally. */
export function formatBytes(bytes: number): string {
  const sign = bytes < 0 ? '-' : '';
  const value = Math.abs(bytes);
  if (value < 1024) return `${sign}${value} B`;
  if (value < 1024 * 1024) return `${sign}${(value / 1024).toFixed(1)} KB`;
  return `${sign}${(value / (1024 * 1024)).toFixed(1)} MB`;
}
