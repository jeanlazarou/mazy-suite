import { useCallback } from 'react';
import { useMixStore } from '../state/store';
import { toggleGroupCollapse } from '../actions/toggle_group_collapse';
import { deleteGroup } from '../actions/delete_group';
import Lane from './Lane';

// VCA-style lane: no audio, only a level line multiplying its members.
export default function GroupRow({ laneId }) {
  const group = useMixStore(useCallback((s) => s.groups.find((g) => g.id === laneId), [laneId]));
  const collapsed = useMixStore((s) => !!s.collapsedGroups[laneId]);
  const memberCount = useMixStore(
    useCallback((s) => s.tracks.filter((t) => t.group === laneId).length, [laneId])
  );
  if (!group) return null;

  return (
    <div className="row">
      <div className="head">
        <div className="top">
          <div className="name" style={{ color: group.color }}>{group.name}</div>
          <button className="ghost" title="Delete group (members stay)" onClick={() => deleteGroup(laneId)}>×</button>
        </div>
        <div className="btns">
          <button
            title={collapsed ? 'Show member lanes' : 'Hide member lanes'}
            onClick={() => toggleGroupCollapse(laneId)}
          >{collapsed ? '▸' : '▾'} {memberCount} track{memberCount === 1 ? '' : 's'}</button>
        </div>
      </div>
      <div className="lane">
        <Lane laneId={laneId} kind="group" />
      </div>
    </div>
  );
}
