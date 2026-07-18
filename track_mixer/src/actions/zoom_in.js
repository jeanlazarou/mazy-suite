import { useMixStore, selectView } from '../state/store';
import { engine } from '../audio/engine';
import { setView } from './set_view';

// Zoom in ×1.5 around the playhead when visible, else the view center.
export const zoomIn = () => {
  const view = selectView(useMixStore.getState());
  const pos = engine.getPosition();
  const center = pos >= view.start && pos <= view.start + view.duration
    ? pos
    : view.start + view.duration / 2;
  const duration = view.duration / 1.5;
  setView(center - duration / 2, duration);
};
