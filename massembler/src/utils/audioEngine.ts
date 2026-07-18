import { Track, AudioClip, AudioFile, TrackClip } from '../types';

export class AudioEngine {
  private audioContext: AudioContext;
  private sources: AudioBufferSourceNode[] = [];
  private gainNodes: GainNode[] = [];
  private startTime: number = 0;

  constructor(audioContext: AudioContext) {
    this.audioContext = audioContext;
  }

  async play(
    tracks: Track[],
    clips: AudioClip[],
    audioFiles: AudioFile[],
    startFrom: number = 0
  ) {
    this.stop();
    this.startTime = this.audioContext.currentTime - startFrom;

    tracks.forEach((track) => {
      if (track.muted) return;

      const trackGain = this.audioContext.createGain();
      trackGain.gain.value = track.volume;
      trackGain.connect(this.audioContext.destination);

      track.clips.forEach((trackClip) => {
        const clip = clips.find((s) => s.id === trackClip.clipId);
        if (!clip) return;

        const audioFile = audioFiles.find((f) => f.id === clip.audioFileId);
        if (!audioFile) return;

        this.playClip(
          audioFile.buffer,
          clip,
          trackClip,
          trackGain,
          startFrom
        );
      });

      this.gainNodes.push(trackGain);
    });
  }

  private playClip(
    buffer: AudioBuffer,
    clip: AudioClip,
    trackClip: TrackClip,
    destination: AudioNode,
    startFrom: number
  ) {
    const playClipOnce = (offset: number = 0) => {
      const source = this.audioContext.createBufferSource();
      source.buffer = buffer;

      // Create a gain node for fade in/out
      const fadeGain = this.audioContext.createGain();
      source.connect(fadeGain);
      fadeGain.connect(destination);

      // Use trimStart/trimEnd if set, otherwise use clip's default values
      const effectiveStartTime = trackClip.trimStart ?? clip.startTime;
      const effectiveEndTime = trackClip.trimEnd ?? clip.endTime;
      const clipDuration = effectiveEndTime - effectiveStartTime;
      const startPosition = trackClip.position + offset;

      const fadeIn = trackClip.fadeIn || 0;
      const fadeOut = trackClip.fadeOut || 0;

      // Only play if this clip should be playing at the current time
      if (startFrom < startPosition + clipDuration && startFrom >= startPosition) {
        const offsetInClip = Math.max(0, startFrom - startPosition);
        const playTime = this.audioContext.currentTime;
        const remainingDuration = clipDuration - offsetInClip;

        // Apply fade in (if we're starting from the beginning)
        if (offsetInClip < fadeIn) {
          const remainingFadeIn = fadeIn - offsetInClip;
          fadeGain.gain.setValueAtTime(0, playTime);
          fadeGain.gain.linearRampToValueAtTime(1, playTime + remainingFadeIn);
        } else {
          fadeGain.gain.setValueAtTime(1, playTime);
        }

        // Apply fade out
        if (fadeOut > 0 && remainingDuration > fadeOut) {
          fadeGain.gain.setValueAtTime(1, playTime + remainingDuration - fadeOut);
          fadeGain.gain.linearRampToValueAtTime(0, playTime + remainingDuration);
        }

        source.start(
          playTime,
          effectiveStartTime + offsetInClip,
          remainingDuration
        );
      } else if (startFrom < startPosition) {
        const playTime = this.audioContext.currentTime + (startPosition - startFrom);

        // Apply fade in
        if (fadeIn > 0) {
          fadeGain.gain.setValueAtTime(0, playTime);
          fadeGain.gain.linearRampToValueAtTime(1, playTime + fadeIn);
        } else {
          fadeGain.gain.setValueAtTime(1, playTime);
        }

        // Apply fade out
        if (fadeOut > 0 && clipDuration > fadeOut) {
          fadeGain.gain.setValueAtTime(1, playTime + clipDuration - fadeOut);
          fadeGain.gain.linearRampToValueAtTime(0, playTime + clipDuration);
        }

        source.start(
          playTime,
          effectiveStartTime,
          clipDuration
        );
      }

      this.sources.push(source);

      return clipDuration;
    };

    if (trackClip.repeat && trackClip.repeatCount) {
      const clipDuration = playClipOnce();
      for (let i = 1; i < trackClip.repeatCount; i++) {
        playClipOnce(i * clipDuration);
      }
    } else {
      playClipOnce();
    }
  }

  stop() {
    this.sources.forEach((source) => {
      try {
        source.stop();
      } catch (e) {
        // Source might already be stopped
      }
    });
    this.sources = [];
    this.gainNodes = [];
  }

  pause(_currentTime: number) {
    this.stop();
  }

  updateTrackVolume(trackIndex: number, volume: number) {
    if (this.gainNodes[trackIndex]) {
      this.gainNodes[trackIndex].gain.value = volume;
    }
  }

  getCurrentTime(): number {
    if (this.startTime === 0) {
      return 0;
    }
    const currentTime = this.audioContext.currentTime - this.startTime;
    return currentTime;
  }
}

export async function loadAudioFile(
  file: File,
  audioContext: AudioContext
): Promise<AudioBuffer> {
  const arrayBuffer = await file.arrayBuffer();
  return await audioContext.decodeAudioData(arrayBuffer);
}

export function generateWaveformData(
  buffer: AudioBuffer,
  samples: number = 500,
  viewStartTime?: number,
  viewEndTime?: number
): number[] {
  const rawData = buffer.getChannelData(0);
  const sampleRate = buffer.sampleRate;
  
  // If view times are provided, only process that portion
  const startTime = viewStartTime ?? 0;
  const endTime = viewEndTime ?? buffer.duration;
  
  const startSample = Math.floor(startTime * sampleRate);
  const endSample = Math.floor(endTime * sampleRate);
  const totalSamples = endSample - startSample;
  
  const blockSize = Math.floor(totalSamples / samples);
  const waveformData: number[] = [];

  for (let i = 0; i < samples; i++) {
    const start = startSample + (blockSize * i);
    const end = Math.min(start + blockSize, endSample);
    let sum = 0;
    let count = 0;
    
    for (let j = start; j < end; j++) {
      if (j < rawData.length) {
        sum += Math.abs(rawData[j]);
        count++;
      }
    }
    
    waveformData.push(count > 0 ? sum / count : 0);
  }

  return waveformData;
}
