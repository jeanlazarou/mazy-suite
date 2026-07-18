import { useMixStore } from '../state/store';

// Transient status line in the transport ("Saved to suite", …).
// The Transport component clears it after a few seconds.
export const showToast = (message) => {
  useMixStore.setState({ toast: message });
};
