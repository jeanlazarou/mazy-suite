import { engine } from '../audio/engine';

// Click the clip indicator to un-latch it.
export const resetClip = () => {
  engine.resetClip();
};
