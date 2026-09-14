import { engine } from '../audio/engine.js';
import { useTwinStore } from '../state/store.js';

export async function togglePlay() {
  if (!engine.ready()) return;
  if (engine.playing) {
    engine.pause();
  } else {
    await engine.play();
  }
  useTwinStore.setState({ playing: engine.playing, position: engine.position() });
}
