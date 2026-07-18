import { engine } from '../audio/engine';
import { makeDemoStems } from '../audio/demoStems';
import { addTrack } from './add_track';

let loaded = false;

// Synthesized drums/bass/pad so the app works with zero setup (M1).
export const loadDemoStems = () => {
  if (loaded) return;
  loaded = true;
  for (const stem of makeDemoStems(engine.context())) addTrack(stem);
};
