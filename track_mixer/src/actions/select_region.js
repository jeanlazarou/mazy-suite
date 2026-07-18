import { useMixStore } from '../state/store';

export const selectRegion = (laneId, regionId) => {
  useMixStore.setState({ selection: { laneId, regionId } });
};
