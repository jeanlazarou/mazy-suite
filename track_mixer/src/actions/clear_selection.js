import { useMixStore } from '../state/store';

export const clearSelection = () => {
  useMixStore.setState({ selection: null });
};
