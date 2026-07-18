import { useEffect, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useMixStore, selectView, selectTotalDuration } from '../state/store';
import { loadDemoStems } from '../actions/load_demo_stems';
import { setView } from '../actions/set_view';
import { useHotkeys } from '../HotkeysMapping';
import Transport from './Transport';
import Ruler from './Ruler';
import TrackRow from './TrackRow';
import GroupRow from './GroupRow';
import MasterRow from './MasterRow';
import Cursor from './Cursor';
import HelpBox from './HelpBox';

export default function App() {
  // Members of a collapsed group are hidden; the group line stays.
  const trackIds = useMixStore(useShallow((s) =>
    s.tracks.filter((t) => !t.group || !s.collapsedGroups[t.group]).map((t) => t.id)
  ));
  const groupIds = useMixStore(useShallow((s) => s.groups.map((g) => g.id)));
  const rowsRef = useRef(null);
  useHotkeys();

  useEffect(() => {
    loadDemoStems();
  }, []);

  // Ctrl+wheel zooms around the pointer; horizontal / shift+wheel pans.
  // Native listener: React's synthetic wheel handler can't preventDefault.
  useEffect(() => {
    const el = rowsRef.current;
    const onWheel = (e) => {
      const s = useMixStore.getState();
      const total = selectTotalDuration(s);
      if (!total) return;
      const view = selectView(s);
      // measure the ruler's lane: the one time axis all rows align to
      const rect = el.querySelector('.ruler-row .lane').getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const at = view.start + frac * view.duration;
        const duration = view.duration * (e.deltaY > 0 ? 1.25 : 0.8);
        setView(at - frac * duration, duration >= total ? null : duration);
      } else if (e.deltaX !== 0 || e.shiftKey) {
        e.preventDefault();
        if (view.duration >= total) return;
        const delta = ((e.deltaX || e.deltaY) / rect.width) * view.duration;
        setView(view.start + delta, view.duration);
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  return (
    <div className="app">
      <Transport />
      <div className="rows" ref={rowsRef}>
        <div className="row ruler-row">
          <div className="head" />
          <div className="lane"><Ruler /></div>
        </div>
        <div className="tracks-scroll">
          {trackIds.map((id) => <TrackRow key={id} laneId={id} />)}
          {groupIds.map((id) => <GroupRow key={id} laneId={id} />)}
        </div>
        <MasterRow />
        <Cursor />
      </div>
      <HelpBox />
    </div>
  );
}
