import { useMixStore } from '../state/store';

// Hide/show a group's member lanes — keeps the lane count low for songs
// with many stems. Pure view state: not undoable, not saved.
export const toggleGroupCollapse = (groupId) => {
  useMixStore.setState((s) => ({
    collapsedGroups: { ...s.collapsedGroups, [groupId]: !s.collapsedGroups[groupId] },
  }));
};
