import { useEffect, useRef } from 'react';
import { engine } from '../audio/engine';
import { useMixStore, selectView, selectTotalDuration } from '../state/store';
import { setView } from '../actions/set_view';
import { HEAD_WIDTH } from './layout';

// One playback cursor spanning ruler and all lanes, positioned via rAF —
// lane canvases never repaint just because time advances. When zoomed in,
// the view follows the cursor during playback.
export default function Cursor() {
  const ref = useRef(null);

  useEffect(() => {
    let raf;
    const tick = () => {
      const el = ref.current;
      if (el && el.parentElement) {
        const s = useMixStore.getState();
        const view = selectView(s);
        const total = selectTotalDuration(s);
        const pos = engine.getPosition();
        if (engine.playing && view.duration < total && pos > view.start + view.duration * 0.95) {
          setView(pos - view.duration * 0.05, view.duration); // follow while playing
        }
        const frac = view.duration ? (pos - view.start) / view.duration : 0;
        // align to the ruler's lane: the one time axis all rows share
        const laneEl = el.parentElement.querySelector('.ruler-row .lane');
        const left = laneEl ? laneEl.offsetLeft : HEAD_WIDTH;
        const laneWidth = laneEl ? laneEl.clientWidth : el.parentElement.clientWidth - HEAD_WIDTH;
        const visible = frac >= 0 && frac <= 1;
        el.style.display = visible ? '' : 'none';
        if (visible) el.style.transform = `translateX(${left + frac * laneWidth}px)`;
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, []);

  return <div className="cursor" ref={ref} />;
}
