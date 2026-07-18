import { describe, it, expect, beforeEach } from 'vitest';
import { useMixStore, MASTER_ID } from '../src/state/store';
import { recordHistory, cancelGesture } from '../src/state/history';
import { addEnvPoint } from '../src/actions/add_env_point';
import { deleteEnvPoint } from '../src/actions/delete_env_point';
import { moveEnvPoint } from '../src/actions/move_env_point';
import { undo } from '../src/actions/undo';
import { redo } from '../src/actions/redo';
import { createGroup } from '../src/actions/create_group';
import { cycleTrackGroup } from '../src/actions/cycle_track_group';
import { deleteGroup } from '../src/actions/delete_group';
import { nudgeSelection } from '../src/actions/nudge_selection';
import { cycleRegionType } from '../src/actions/cycle_region_type';
import { removeTrack } from '../src/actions/remove_track';
import { toggleRegionEnabled } from '../src/actions/toggle_region_enabled';
import { deleteSelection } from '../src/actions/delete_selection';
import { addMuteRegion } from '../src/actions/add_mute_region';

const masterEnv = () => useMixStore.getState().master.env;

beforeEach(() => {
  useMixStore.setState({
    tracks: [],
    groups: [],
    master: { id: MASTER_ID, name: 'MASTER', color: '#ffd75e', isMaster: true, env: [], regions: [] },
    durations: {},
    collapsedGroups: {},
    selection: null,
    past: [],
    future: [],
  });
});

const seedTrack = (id) => {
  useMixStore.setState((s) => ({
    tracks: [...s.tracks, {
      id, name: id, color: '#fff', fileName: null,
      env: [], regions: [], pan: [], solo: false, mute: false,
      eq: { low: 0, mid: 0, high: 0 }, group: null,
    }],
    durations: { ...s.durations, [id]: 30 },
  }));
};

describe('undo/redo', () => {
  it('undoes and redoes an added envelope point', () => {
    addEnvPoint(MASTER_ID, 5, 0.5);
    expect(masterEnv()).toHaveLength(1);
    undo();
    expect(masterEnv()).toHaveLength(0);
    redo();
    expect(masterEnv()).toHaveLength(1);
    expect(masterEnv()[0]).toMatchObject({ t: 5, v: 0.5 });
  });

  it('treats a whole drag as one undo step', () => {
    const id = addEnvPoint(MASTER_ID, 5, 0.5); // records once
    moveEnvPoint(MASTER_ID, id, 6, 0.4); // drag moves record nothing
    moveEnvPoint(MASTER_ID, id, 7, 0.3);
    expect(masterEnv()[0]).toMatchObject({ t: 7, v: 0.3 });
    undo();
    expect(masterEnv()).toHaveLength(0); // back before the click+drag
  });

  it('a new edit clears the redo stack', () => {
    addEnvPoint(MASTER_ID, 1, 1);
    undo();
    addEnvPoint(MASTER_ID, 2, 0.5);
    redo(); // nothing to redo
    expect(masterEnv()).toHaveLength(1);
    expect(masterEnv()[0].t).toBe(2);
  });

  it('deleting a point is undoable', () => {
    const id = addEnvPoint(MASTER_ID, 3, 0.8);
    deleteEnvPoint(MASTER_ID, id);
    expect(masterEnv()).toHaveLength(0);
    undo();
    expect(masterEnv()).toHaveLength(1);
  });

  it('cancelGesture rolls back without leaving an undo or redo step', () => {
    addEnvPoint(MASTER_ID, 1, 1);
    recordHistory(); // gesture starts…
    useMixStore.setState((s) => ({ master: { ...s.master, env: [] } })); // …mutates…
    cancelGesture(); // …turns out accidental
    expect(masterEnv()).toHaveLength(1); // state rolled back
    expect(useMixStore.getState().future).toHaveLength(0); // no redo ghost
    undo(); // the only remaining step is the original add
    expect(masterEnv()).toHaveLength(0);
  });

  it('undo is a no-op on empty history', () => {
    undo();
    expect(masterEnv()).toHaveLength(0);
  });

  it('group creation and membership are undoable', () => {
    seedTrack('t1');
    const gid = createGroup('Rhythm');
    cycleTrackGroup('t1');
    expect(useMixStore.getState().tracks[0].group).toBe(gid);
    undo(); // membership
    expect(useMixStore.getState().tracks[0].group).toBeNull();
    undo(); // group creation
    expect(useMixStore.getState().groups).toHaveLength(0);
    redo();
    expect(useMixStore.getState().groups).toHaveLength(1);
  });

  it('membership cycles none → each group → none', () => {
    seedTrack('t1');
    const g1 = createGroup('A');
    const g2 = createGroup('B');
    const memberOf = () => useMixStore.getState().tracks[0].group;
    cycleTrackGroup('t1');
    expect(memberOf()).toBe(g1);
    cycleTrackGroup('t1');
    expect(memberOf()).toBe(g2);
    cycleTrackGroup('t1');
    expect(memberOf()).toBeNull();
  });

  it('nudges the selected region and point, undoably', () => {
    seedTrack('t1');
    addMuteRegion('t1', 5, 8); // selects the region
    nudgeSelection(1, false);
    let r = useMixStore.getState().tracks[0].regions[0];
    expect([r.start, r.end]).toEqual([5.01, 8.01]);
    nudgeSelection(-1, true); // Shift = coarse
    r = useMixStore.getState().tracks[0].regions[0];
    expect([+r.start.toFixed(3), +r.end.toFixed(3)]).toEqual([4.91, 7.91]);
    undo();
    r = useMixStore.getState().tracks[0].regions[0];
    expect([r.start, r.end]).toEqual([5.01, 8.01]);

    const pid = addEnvPoint('t1', 10, 0.5); // selects the point
    nudgeSelection(1, true);
    expect(useMixStore.getState().tracks[0].env[0].t).toBeCloseTo(10.1);
    expect(useMixStore.getState().selection.pointId).toBe(pid);
  });

  it('removing a track is undoable, durations included', () => {
    seedTrack('t1');
    seedTrack('t2');
    removeTrack('t1');
    let s = useMixStore.getState();
    expect(s.tracks.map((t) => t.id)).toEqual(['t2']);
    expect(s.durations.t1).toBeUndefined();
    undo();
    s = useMixStore.getState();
    expect(s.tracks.map((t) => t.id)).toEqual(['t1', 't2']);
    expect(s.durations.t1).toBe(30);
    redo();
    expect(useMixStore.getState().tracks.map((t) => t.id)).toEqual(['t2']);
  });

  it('removing the selected track clears the selection', () => {
    seedTrack('t1');
    addMuteRegion('t1', 1, 2);
    removeTrack('t1');
    expect(useMixStore.getState().selection).toBeNull();
  });

  it('region type cycles mute → fade-in → fade-out → mute, undoably', () => {
    seedTrack('t1');
    addMuteRegion('t1', 1, 5); // selected
    const mode = () => useMixStore.getState().tracks[0].regions[0].mode;
    cycleRegionType();
    expect(mode()).toBe('fade-in');
    cycleRegionType();
    expect(mode()).toBe('fade-out');
    cycleRegionType();
    expect(mode()).toBe('mute');
    undo();
    expect(mode()).toBe('fade-out');
  });

  it('region enable toggles off and back on, undoably', () => {
    seedTrack('t1');
    addMuteRegion('t1', 1, 5);
    const enabled = () => useMixStore.getState().tracks[0].regions[0].enabled;
    toggleRegionEnabled();
    expect(enabled()).toBe(false);
    toggleRegionEnabled();
    expect(enabled()).toBe(true);
    undo();
    expect(enabled()).toBe(false);
  });

  it('deleteSelection removes region or point depending on selection', () => {
    seedTrack('t1');
    addMuteRegion('t1', 1, 2);
    deleteSelection();
    expect(useMixStore.getState().tracks[0].regions).toHaveLength(0);
    addEnvPoint('t1', 3, 0.7, 'pan');
    deleteSelection();
    expect(useMixStore.getState().tracks[0].pan).toHaveLength(0);
  });

  it('deleting a group unassigns members and is undoable', () => {
    seedTrack('t1');
    const gid = createGroup('Rhythm');
    cycleTrackGroup('t1');
    deleteGroup(gid);
    expect(useMixStore.getState().groups).toHaveLength(0);
    expect(useMixStore.getState().tracks[0].group).toBeNull();
    undo();
    expect(useMixStore.getState().groups).toHaveLength(1);
    expect(useMixStore.getState().tracks[0].group).toBe(gid);
  });
});
