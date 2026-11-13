import { useStore } from '../store';
import { AudioClip, AudioFile } from '../types';

/**
 * Listening to a library clip on its own, from the clip list. One at a time:
 * starting another stops the one playing.
 */

let current: AudioBufferSourceNode | null = null;

/**
 * Play the clip's region once. `onEnd` runs when it stops, however it stops:
 * at its end, stopped, or replaced by another preview.
 */
export function previewClip(clip: AudioClip, audioFile: AudioFile, onEnd: () => void) {
  stopClipPreview();

  const ctx = useStore.getState().ensureAudioContext();
  if (ctx.state === 'suspended') void ctx.resume();

  const source = ctx.createBufferSource();
  source.buffer = audioFile.buffer;
  source.connect(ctx.destination);
  source.onended = () => {
    if (current === source) current = null;
    onEnd();
  };
  source.start(0, clip.startTime, clip.duration);
  current = source;
}

export function stopClipPreview() {
  const playing = current;
  current = null;
  try {
    playing?.stop();
  } catch {
    // already stopped
  }
}
