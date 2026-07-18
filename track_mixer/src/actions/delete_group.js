import { useMixStore } from '../state/store';
import { engine } from '../audio/engine';
import { recordHistory } from '../state/history';

// Removes the group lane; member tracks become ungrouped.
export const deleteGroup = (groupId) => {
  recordHistory();
  useMixStore.setState((s) => {
    const { [groupId]: _, ...collapsedGroups } = s.collapsedGroups;
    return {
      groups: s.groups.filter((g) => g.id !== groupId),
      tracks: s.tracks.map((t) => (t.group === groupId ? { ...t, group: null } : t)),
      collapsedGroups,
    };
  });
  engine.modelChanged();
};
