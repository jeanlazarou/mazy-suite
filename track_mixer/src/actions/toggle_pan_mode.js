import { useMixStore } from '../state/store';

// Pan view (spec "phase 2"): shows each track's pan line and routes the
// line-editing gestures to it. Pan stays audible either way — the toggle
// only changes what is drawn and edited.
export const togglePanMode = () => {
  useMixStore.setState((s) => ({ panMode: !s.panMode, selection: null }));
};
