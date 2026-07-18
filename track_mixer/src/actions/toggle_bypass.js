import { useMixStore } from '../state/store';
import { engine } from '../audio/engine';

// A/B bypass: play the raw stems flat to judge whether the mix is helping.
// Solo/mute stay respected (the engine only flattens the gain curves).
export const toggleBypass = () => {
  useMixStore.setState((s) => ({ bypass: !s.bypass }));
  engine.modelChanged();
};
