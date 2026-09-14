import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { useTwinStore } from '../state/store.js';
import { mapTime } from '../model/bands.js';
import {
  makeView,
  scrollFor,
  scrollForNewDriver,
  contentHeight,
  followPlayback,
} from '../model/view.js';
import { drawTwin, columns, GUTTER } from '../render/draw_twin.js';
import { seekOnSide } from '../actions/seek.js';
import { selectBand } from '../actions/select_band.js';
import { takeRange, takeToBoundary } from '../actions/pair_range.js';
import { resizeEdge } from '../actions/edit_segment.js';
import { snap } from '../actions/snap_edge.js';
import { isSliver } from '../model/edits.js';
import { LyricsLayer } from './LyricsLayer.jsx';
import { clock as formatClock } from '../format.js';

const CLICK_SLOP = 4; // px — below this a drag is a click, and seeks
const EDGE_GRAB = 6; // px — how close to a band edge counts as grabbing it

// The two strips, one scrollbar. The view (model/view.js) decides where each
// moment of each song is on screen; this component only turns that into a
// canvas, some labels and pointer gestures.
export function TwinView() {
  const layout = useTwinStore((s) => s.layout);
  const peaks = useTwinStore((s) => s.peaks);
  const waveScale = useTwinStore((s) => s.waveScale);
  const durations = useTwinStore((s) => s.durations);
  const pxPerSec = useTwinStore((s) => s.pxPerSec);
  const mode = useTwinStore((s) => s.layoutMode);
  const position = useTwinStore((s) => s.position);
  const clock = useTwinStore((s) => s.clock);
  const selected = useTwinStore((s) => s.selected);
  const follow = useTwinStore((s) => s.follow);
  const playing = useTwinStore((s) => s.playing);
  const pending = useTwinStore((s) => s.pending);
  const reveal = useTwinStore((s) => s.reveal);

  const driver = useTwinStore((s) => s.scrollDriver);

  const canvasRef = useRef(null);
  const scrollRef = useRef(null);
  const spacerRef = useRef(null);
  const gesture = useRef(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [scrollTop, setScrollTop] = useState(0);
  const [drag, setDrag] = useState(null); // { side, from, to } in seconds
  // While playback is followed, the songs line up on the playhead's line; it
  // stays so after pausing, until you scroll yourself.
  const [followFocusY, setFollowFocusY] = useState(null);
  const programmaticScroll = useRef(null);

  const viewParams = { mode, layout, durations, pxPerSec, viewHeight: box.height, driver };
  const view = makeView({ ...viewParams, scrollTop, focusY: followFocusY });

  // Hand the scroll to `side` (true scale only) without moving that side on
  // screen: resize the scroll range to its song and set the scroll that keeps
  // it in place, before anything else scrolls. Returns the view params the
  // caller should compute with from here on.
  const latest = useRef(null);
  latest.current = { view, viewParams };
  const handTo = (side) => {
    const { view: current, viewParams: currentParams } = latest.current;
    if (currentParams.mode !== 'true' || currentParams.driver === side || !scrollRef.current) {
      return currentParams;
    }
    const next = { ...currentParams, driver: side };
    const target = scrollForNewDriver(current, currentParams, side);
    if (spacerRef.current) spacerRef.current.style.height = `${contentHeight(next)}px`;
    scrollRef.current.scrollTop = target;
    latest.current = { view: makeView({ ...next, scrollTop: target }), viewParams: next };
    setScrollTop(target);
    useTwinStore.setState({ scrollDriver: side });
    return next;
  };

  // The side under the wheel drives: scrolling on a song always moves that
  // song. A native listener, so the hand-over happens before the browser
  // applies the wheel to the scroll.
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return undefined;
    const onWheel = (event) => {
      // scrolling by hand: back to the sync point, from the line the songs
      // are lined up on right now
      setFollowFocusY(null);
      const rect = element.getBoundingClientRect();
      const cols = columns(element.clientWidth);
      const x = event.clientX - rect.left;
      if (x > cols.gutter.left && x < cols.gutter.right) return;
      handTo(x <= cols.gutter.left ? 'a' : 'b');
    };
    // not passive: the browser must run it before scrolling, or the first
    // wheel step lands on the old side's scroll range
    element.addEventListener('wheel', onWheel, { passive: false, capture: true });
    return () => element.removeEventListener('wheel', onWheel, { capture: true });
    // handTo reads everything it needs from `latest`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const other = clock === 'a' ? 'b' : 'a';
  const times = { [clock]: position, [other]: mapTime(layout, clock, other, position) };
  const playheads = { a: view.y('a', times.a), b: view.y('b', times.b) };

  const rangeOverlay = (side, from, to, isPending) => {
    const top = view.y(side, Math.min(from, to));
    return {
      side,
      top,
      height: Math.max(2, view.y(side, Math.max(from, to)) - top),
      pending: isPending,
    };
  };
  const overlays = [];
  if (pending) overlays.push(rangeOverlay(pending.side, pending.range[0], pending.range[1], true));
  if (drag) overlays.push(rangeOverlay(drag.side, drag.from, drag.to, false));

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) return undefined;
    const measure = () => setBox({ width: element.clientWidth, height: element.clientHeight });
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    if (!canvasRef.current || !box.width) return;
    drawTwin(canvasRef.current, {
      view,
      layout,
      peaks,
      viewHeight: box.height,
      width: box.width,
      selected,
      playheads,
      clock,
      scale: waveScale,
      overlays,
    });
  });

  // Follow the audible playhead while it moves: the page stays still until the
  // playhead reaches the middle, scrolls under it there, and stops once the
  // end is in view. The side you hear drives, so it never stands still under
  // the playhead, and the songs line up on the playhead's own line.
  const lastFollowFrame = useRef(null);
  useEffect(() => {
    if (!follow || !playing || !scrollRef.current || !box.height) {
      lastFollowFrame.current = null;
      return;
    }
    const params = handTo(clock);
    // frame by frame, from where the page is now: a click on the waveform
    // then never moves the page under the pointer (see followPlayback)
    const now = performance.now();
    const dt = lastFollowFrame.current === null ? 0 : (now - lastFollowFrame.current) / 1000;
    lastFollowFrame.current = now;
    const { scrollTop: target, focusY } = followPlayback(params, clock, position, {
      scrollTop: scrollRef.current.scrollTop,
      // the line drawn last frame; null after a scroll by hand, so following
      // picks up from wherever the playhead is
      focusY: lastFollowFrame.current === null ? null : followFocusY,
      dt: Math.min(dt, 0.25), // a stalled tab must not glide in one leap
    });
    if (Math.abs(target - scrollRef.current.scrollTop) > 0.5) {
      programmaticScroll.current = target;
      scrollRef.current.scrollTop = target;
    }
    setFollowFocusY(focusY);
    // viewParams is rebuilt every render; its parts are the real dependencies
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [follow, playing, position, clock, mode, layout, durations, pxPerSec, box.height]);

  // Bring a moment into view when something asks for it (the band list),
  // handing the scroll to the side it is on so it lands on the sync point.
  useEffect(() => {
    if (!reveal || !scrollRef.current || !box.height) return;
    setFollowFocusY(null);
    const params = handTo(reveal.side);
    const target = scrollFor(params, reveal.side, reveal.t);
    programmaticScroll.current = target;
    scrollRef.current.scrollTop = target;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reveal]);

  // Each side's stretch of a band, on screen.
  const extentOf = (band, side) => (view.mode === 'aligned' ? view.extent(band) : view.extent(band, side));

  // Where a pointer event is: which side, which band, which moment.
  const locate = (event) => {
    const element = scrollRef.current;
    if (!element || !layout.length) return null;
    const rect = element.getBoundingClientRect();
    const y = event.clientY - rect.top;
    const x = event.clientX - rect.left;
    const cols = columns(element.clientWidth);
    if (x > cols.gutter.left && x < cols.gutter.right) return null;
    const side = x <= cols.gutter.left ? 'a' : 'b';
    const index = layout.findIndex((band) => {
      const [top, bottom] = extentOf(band, side);
      return bottom > top && y >= top && y < bottom;
    });
    return { side, y, index, band: layout[index] ?? null, time: view.time(side, y) };
  };

  const onPointerDown = (event) => {
    if (event.button !== 0) return;
    const at = locate(event);
    if (!at) return;
    event.currentTarget.setPointerCapture(event.pointerId);

    // Shift+click takes a whole stretch in one gesture: back to the region
    // above, or — with Alt — forward to the one below.
    if (event.shiftKey) {
      gesture.current = null;
      takeToBoundary(at.side, at.time, event.altKey ? 'forward' : 'back');
      return;
    }

    // Close to the edge of a classified band, on a side it names: a resize.
    const band = at.band;
    if (band && band.segment !== null && (at.side === 'a' ? band.hasA : band.hasB)) {
      const [top, bottom] = extentOf(band, at.side);
      if (at.y - top <= EDGE_GRAB || bottom - at.y <= EDGE_GRAB) {
        gesture.current = {
          kind: 'resize',
          side: at.side,
          index: at.index,
          edge: at.y - top <= EDGE_GRAB ? 'start' : 'end',
          first: true,
        };
        return;
      }
    }

    gesture.current = { kind: 'range', side: at.side, from: at.time, startY: event.clientY };
    setDrag({ side: at.side, from: at.time, to: at.time });
  };

  const onPointerMove = (event) => {
    const current = gesture.current;
    if (!current) return;
    const at = locate(event);
    if (!at || at.side !== current.side) return;

    if (current.kind === 'resize') {
      resizeEdge(current.index, current.side, current.edge, at.time, { history: current.first });
      current.first = false;
      return;
    }
    // Show where the edge would actually land, magnet included.
    const { time } = snap(current.side, at.time);
    current.to = at.time;
    setDrag({ side: current.side, from: current.from, to: time });
  };

  const onPointerUp = (event) => {
    const current = gesture.current;
    gesture.current = null;
    if (!current || current.kind === 'resize') return;

    const at = locate(event);
    const moved = Math.abs(event.clientY - current.startY);
    setDrag(null);

    if (moved < CLICK_SLOP) {
      if (!at) return;
      if (at.index >= 0) selectBand(at.index, { go: false });
      seekOnSide(at.side, at.time);
      return;
    }
    // A drag belongs to the side it started on. Let go over the gutter or the
    // other song and it still ends where the pointer last was on its own side
    // — rather than being dropped, or measured on the other song's clock.
    const end = at && at.side === current.side ? at.time : current.to;
    if (end === undefined) return;
    takeRange(current.side, [current.from, end]);
  };

  return (
    <div className="twin-view">
      <canvas ref={canvasRef} className="twin-canvas" style={{ width: box.width, height: box.height }} />
      <LyricsLayer view={view} width={box.width} viewHeight={box.height} />
      <div className="band-label-layer">
        {box.height
          ? layout.map((band, index) => (
              <BandLabels
                key={index}
                band={band}
                a={extentOf(band, 'a')}
                b={extentOf(band, 'b')}
                viewHeight={box.height}
                selected={index === selected}
              />
            ))
          : null}
      </div>
      <div
        ref={scrollRef}
        className="twin-scroll"
        onScroll={(event) => {
          const top = event.currentTarget.scrollTop;
          // a scroll the app did not ask for — the scrollbar dragged by hand —
          // hands the alignment back to the sync point
          if (programmaticScroll.current === null || Math.abs(top - programmaticScroll.current) > 2) {
            setFollowFocusY(null);
          }
          programmaticScroll.current = null;
          setScrollTop(top);
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          gesture.current = null;
          setDrag(null);
        }}
      >
        <div ref={spacerRef} className="twin-spacer" style={{ height: view.contentHeight }} />
      </div>
    </div>
  );
}

// Labels sit where each side's stretch starts, and the gutter label where
// the ribbon's upper edge crosses — so in the true layout a label follows its
// ribbon as the two songs drift apart.
function BandLabels({ band, a, b, viewHeight, selected }) {
  if (isSliver(band)) return null;
  const gutterTop = (a[0] + b[0]) / 2;
  const lowest = Math.max(a[1], b[1]);
  const highest = Math.min(a[0], b[0]);
  if (lowest < 0 || highest > viewHeight) return null;

  const scale =
    band.hasA && band.hasB && Math.abs(band.durA - band.durB) > 0.25
      ? `${band.durA.toFixed(0)}s ↔ ${band.durB.toFixed(0)}s`
      : null;
  const className = `band-label kind-${band.kind}${selected ? ' is-selected' : ''}`;

  return (
    <>
      {band.hasA ? (
        <span className={`${className} band-time band-time-a`} style={{ top: a[0] + 2 }}>
          {formatClock(band.a[0])}
          {band.note ? <span className="band-note">{band.note}</span> : null}
        </span>
      ) : null}
      {band.hasB ? (
        <span className={`${className} band-time band-time-b`} style={{ top: b[0] + 2 }}>
          {formatClock(band.b[0])}
        </span>
      ) : null}
      <span className={`${className} band-gutter-label`} style={{ top: gutterTop + 2, width: GUTTER }}>
        <span className="band-kind">{band.kind}</span>
        {band.label ? <span className="band-name">{band.label}</span> : null}
        {scale ? <span className="band-scale">{scale}</span> : null}
      </span>
    </>
  );
}
