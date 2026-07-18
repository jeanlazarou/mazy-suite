import { engine } from '../audio/engine';

export const seek = (t) => {
  engine.seek(t);
};
