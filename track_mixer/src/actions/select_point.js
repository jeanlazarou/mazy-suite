import { useMixStore } from '../state/store';

// Clicking/dragging a breakpoint selects it — target of ←/→ nudge and Delete.
export const selectPoint = (laneId, pointId, curve = 'env') => {
  useMixStore.setState({ selection: { laneId, pointId, curve } });
};
