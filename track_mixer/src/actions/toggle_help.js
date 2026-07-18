import { useMixStore } from '../state/store';

// ? opens/closes the hotkeys & gestures reference.
export const toggleHelp = () => {
  useMixStore.setState((s) => ({ helpOpen: !s.helpOpen }));
};
