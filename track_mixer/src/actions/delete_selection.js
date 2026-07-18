import { useMixStore } from '../state/store';
import { deleteRegion } from './delete_region';
import { deleteEnvPoint } from './delete_env_point';

// Delete/Backspace removes whatever is selected: a region or a breakpoint.
export const deleteSelection = () => {
  const { selection } = useMixStore.getState();
  if (!selection) return;
  if (selection.regionId) deleteRegion(selection.laneId, selection.regionId);
  else deleteEnvPoint(selection.laneId, selection.pointId, selection.curve);
};
