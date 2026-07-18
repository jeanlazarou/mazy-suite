import { useMixStore } from '../state/store';
import { engine } from '../audio/engine';
import { recordHistory } from '../state/history';
import { uid } from './ids';

export const GROUP_COLORS = ['#e0b05a', '#5ad6c8', '#e08a5a', '#9a8ae0', '#d6cf5a', '#5ab8e0'];

// A group lane is VCA-style: no audio, only a level line whose curve
// multiplies its member tracks. Assign members via the header color dot.
export const createGroup = (name) => {
  recordHistory();
  const id = uid('grp');
  useMixStore.setState((s) => ({
    groups: [...s.groups, {
      id,
      name: name ?? `Group ${s.groups.length + 1}`,
      color: GROUP_COLORS[s.groups.length % GROUP_COLORS.length],
      isGroup: true,
      env: [],
      regions: [],
    }],
  }));
  engine.modelChanged();
  return id;
};
