/**
 * AudioSegmentLoader
 *
 * Loads audio files, extracts first/last segments of the longest preview
 * length, and plays them using HTML5 Audio elements for reliable playback
 * control. Caches decoded AudioBuffers for fast repeated access; a segment is
 * trimmed to the current preview length only when played, so changing the
 * length needs no reloading.
 */

import { AudioSegments } from './types';
import { MAX_PREVIEW } from './PreviewDial';

class AudioSegmentLoader {
  private audioContext: AudioContext;
  private cache: Map<string, AudioSegments>;
  private currentAudio: HTMLAudioElement | null;
  private currentBlobUrl: string | null;

  /**
   * Called with the track URL, playback progress (0..1) and which segment
   * ('start' or 'end') is currently playing, or (null, 0, null) when
   * playback stops.
   */
  onProgress: ((trackUrl: string | null, progress: number, segment: 'start' | 'end' | null) => void) | null;

  /** How much of a segment is played, in seconds (at most MAX_PREVIEW) */
  previewSeconds: number;

  constructor() {
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.cache = new Map();
    this.previewSeconds = 10;
    this.currentAudio = null;
    this.currentBlobUrl = null;
    this.onProgress = null;
  }

  /**
   * Load first and last segments of an audio file
   * @param url - Audio file URL
   * @returns Promise resolving to start and end segments
   */
  async loadSegments(url: string): Promise<AudioSegments> {
    // Check cache first
    if (this.cache.has(url)) {
      return this.cache.get(url)!;
    }

    try {
      // Fetch the entire file (simplified approach for reliable decoding)
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

      // Extract the first MAX_PREVIEW seconds
      const startDuration = Math.min(MAX_PREVIEW, audioBuffer.duration);
      const startBuffer = this.extractSegment(audioBuffer, 0, startDuration);

      // Extract the last MAX_PREVIEW seconds
      const endStart = Math.max(0, audioBuffer.duration - MAX_PREVIEW);
      const endBuffer = this.extractSegment(audioBuffer, endStart, audioBuffer.duration);

      const segments: AudioSegments = { start: startBuffer, end: endBuffer };
      this.cache.set(url, segments);

      return segments;
    } catch (error) {
      console.error(`Error loading segments for ${url}:`, error);
      throw error;
    }
  }

  /**
   * Extract a time segment from an AudioBuffer
   * @param source - Source audio buffer
   * @param startTime - Start time in seconds
   * @param endTime - End time in seconds
   * @returns New buffer containing only the segment
   */
  private extractSegment(source: AudioBuffer, startTime: number, endTime: number): AudioBuffer {
    const sampleRate = source.sampleRate;
    const startSample = Math.floor(startTime * sampleRate);
    const endSample = Math.min(source.length, Math.ceil(endTime * sampleRate));
    const segmentLength = endSample - startSample;

    const segment = this.audioContext.createBuffer(
      source.numberOfChannels,
      segmentLength,
      sampleRate
    );

    // Copy each channel
    for (let channel = 0; channel < source.numberOfChannels; channel++) {
      const sourceData = source.getChannelData(channel);
      const segmentData = segment.getChannelData(channel);

      for (let i = 0; i < segmentLength; i++) {
        segmentData[i] = sourceData[startSample + i];
      }
    }

    return segment;
  }

  /**
   * The part of a cached segment to play: the first previewSeconds of a
   * beginning, the last previewSeconds of an ending
   */
  private preview(buffer: AudioBuffer, segment?: 'start' | 'end'): AudioBuffer {
    const length = this.previewSeconds;
    if (!segment || buffer.duration <= length) return buffer;
    return segment === 'start'
      ? this.extractSegment(buffer, 0, length)
      : this.extractSegment(buffer, buffer.duration - length, buffer.duration);
  }

  /**
   * Convert AudioBuffer to WAV Blob
   * @param buffer - AudioBuffer to convert
   * @returns Blob containing WAV data
   */
  private audioBufferToWavBlob(buffer: AudioBuffer): Blob {
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
    setUint32(length - 8); // file length - 8
    setUint32(0x45564157); // "WAVE"

    // "fmt " sub-chunk
    setUint32(0x20746d66); // "fmt "
    setUint32(16); // chunk length
    setUint16(1); // PCM
    setUint16(buffer.numberOfChannels);
    setUint32(buffer.sampleRate);
    setUint32(buffer.sampleRate * 2 * buffer.numberOfChannels); // byte rate
    setUint16(buffer.numberOfChannels * 2); // block align
    setUint16(16); // bits per sample

    // "data" sub-chunk
    setUint32(0x61746164); // "data"
    setUint32(length - pos - 4);

    // Write interleaved data
    for (let i = 0; i < buffer.numberOfChannels; i++) {
      channels.push(buffer.getChannelData(i));
    }

    offset = pos;
    for (let i = 0; i < buffer.length; i++) {
      for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
        const sample = Math.max(-1, Math.min(1, channels[channel][i]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
        offset += 2;
      }
    }

    return new Blob([arrayBuffer], { type: 'audio/wav' });
  }

  /**
   * Play an AudioBuffer
   * @param buffer - Buffer to play
   * @param trackUrl - URL of the track this segment belongs to (for progress reporting)
   * @param segment - Which segment of the track this buffer is ('start' or 'end')
   * @returns Promise resolving when playback finishes
   */
  play(buffer: AudioBuffer, trackUrl?: string, segment?: 'start' | 'end'): Promise<void> {
    return new Promise((resolve) => {
      // Stop any currently playing audio
      this.stopCurrentSource();

      // Convert the part to hear to a WAV Blob
      const blob = this.audioBufferToWavBlob(this.preview(buffer, segment));
      const blobUrl = URL.createObjectURL(blob);

      // Create Audio element
      const audio = new Audio(blobUrl);

      const cleanup = () => {
        if (this.currentAudio === audio) {
          this.currentAudio = null;
          this.onProgress?.(null, 0, null);
        }
        if (this.currentBlobUrl === blobUrl) {
          URL.revokeObjectURL(blobUrl);
          this.currentBlobUrl = null;
        }
      };

      if (trackUrl && segment) {
        audio.ontimeupdate = () => {
          if (this.currentAudio === audio && audio.duration > 0) {
            this.onProgress?.(trackUrl, audio.currentTime / audio.duration, segment);
          }
        };
      }

      audio.onended = () => {
        cleanup();
        resolve();
      };

      audio.onerror = () => {
        cleanup();
        resolve();
      };

      this.currentAudio = audio;
      this.currentBlobUrl = blobUrl;

      if (trackUrl && segment) {
        this.onProgress?.(trackUrl, 0, segment);
      }

      audio.play().catch(() => {
        cleanup();
        resolve();
      });
    });
  }

  /**
   * Stop the currently playing audio source
   */
  stopCurrentSource(): void {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
      this.currentAudio = null;
      this.onProgress?.(null, 0, null);
    }

    if (this.currentBlobUrl) {
      URL.revokeObjectURL(this.currentBlobUrl);
      this.currentBlobUrl = null;
    }
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get total duration of an audio file
   * @param url - Audio file URL
   * @returns Duration in seconds (approximate from segments)
   */
  async getDuration(url: string): Promise<number> {
    const segments = await this.loadSegments(url);
    // This is approximate since we only have segments
    // For accurate duration, we'd need to parse the file header
    return segments.start.duration + segments.end.duration;
  }
}

export default AudioSegmentLoader;
