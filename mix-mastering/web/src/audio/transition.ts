import { getAudioContext, getAnalyserNode, resumeAudioContext } from './context';

// Plays a few already-rendered parts back to back (the end of one album
// track into the start of the next), straight to the output: no A/B
// match gain or live-preview stage, which belong to the transport's
// playback of the active track. Module-level, like the transport's
// source, so there is only ever one transition playing.
let sources: AudioBufferSourceNode[] = [];

export function stopTransition(): void {
  for (const src of sources) {
    src.onended = null;
    try {
      src.stop();
    } catch {
      // Already stopped
    }
  }
  sources = [];
}

export async function playTransition(parts: AudioBuffer[], onEnd: () => void): Promise<void> {
  stopTransition();
  await resumeAudioContext();
  const ctx = getAudioContext();
  let at = ctx.currentTime + 0.05;
  sources = parts.map((buf) => {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(getAnalyserNode());
    src.start(at);
    at += buf.duration;
    return src;
  });
  const last = sources[sources.length - 1];
  if (last) {
    last.onended = () => {
      sources = [];
      onEnd();
    };
  }
}
