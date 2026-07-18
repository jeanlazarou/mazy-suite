import { useMixStore, selectView } from '../state/store';
import { setView } from './set_view';

export const zoomOut = () => {
  const view = selectView(useMixStore.getState());
  const duration = view.duration * 1.5;
  setView(view.start - (duration - view.duration) / 2, duration);
};
