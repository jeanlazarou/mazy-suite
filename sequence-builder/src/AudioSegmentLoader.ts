/**
 * AudioSegmentLoader
 *
 * Loads audio files, extracts first/last 10-second segments, and plays them
 * using HTML5 Audio elements for reliable playback control.
 * Caches decoded AudioBuffers for fast repeated access.
 */

import { AudioSegments } from './types';

class AudioSegmentLoader {
  private audioContext: AudioContext;
  private cache: Map<string, AudioSegments>;
  private segmentDuration: number;
  private currentAudio: HTMLAudioElement | null;
  private currentBlobUrl: string | null;

  constructor() {
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.cache = new Map();
    this.segmentDuration = 10; // seconds
    this.currentAudio = null;
    this.currentBlobUrl = null;
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

      // Extract first 10 seconds
      const startDuration = Math.min(this.segmentDuration, audioBuffer.duration);
      const startBuffer = this.extractSegment(audioBuffer, 0, startDuration);

      // Extract last 10 seconds
      const endStart = Math.max(0, audioBuffer.duration - this.segmentDuration);
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
    const endSample = Math.ceil(endTime * sampleRate);
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
   * @returns Promise resolving when playback finishes
   */
  play(buffer: AudioBuffer): Promise<void> {
    return new Promise((resolve) => {
      // Stop any currently playing audio
      this.stopCurrentSource();

      // Convert AudioBuffer to WAV Blob
      const blob = this.audioBufferToWavBlob(buffer);
      const blobUrl = URL.createObjectURL(blob);

      // Create Audio element
      const audio = new Audio(blobUrl);

      const cleanup = () => {
        if (this.currentAudio === audio) {
          this.currentAudio = null;
        }
        if (this.currentBlobUrl === blobUrl) {
          URL.revokeObjectURL(blobUrl);
          this.currentBlobUrl = null;
        }
      };

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
