// The view: where a moment of either song sits on screen. Everything that
// draws, clicks or follows asks the view, so the two layout modes differ in
// exactly one place.
//
//   'true'    — the Meld way. Each side is one continuous waveform at the same
//               seconds-per-pixel, so a longer passage is taller and a longer
//               song is a longer strip. The two strips scroll in step: a
//               focus line sweeps from the top of the viewport to the bottom
//               as you scroll, and at that line the two sides show
//               corresponding music, level. Away from it they drift apart by
//               as much as the renditions differ, and the ribbons across the
//               gutter skew to show it.
//   'aligned' — the band layout: both sides stretched to fill each band, one
//               shared scroll. Reads bar by bar; hides the stretch.
//
// In 'true' mode the scroll is driven by one side: the one you scroll on, or
// the one you hear while following playback. The driving side always moves
// one pixel for one pixel of scroll, through everything it has; the other side
// follows through the correspondences — standing still through what only the
// driving side has, jumping past what only it has itself. How this came to be:
//
//   1. Scrolling along the longer song hid anything the other song has before
//      the first correspondence above the screen: the recording's first 31 s,
//      unreachable, and the playhead off-screen while it played them.
//   2. Scrolling along the bands (the diff) made every second reachable, but
//      froze whichever side you were reading while a stretch only the other
//      side has went by — on the first real pair, over a minute of a frozen
//      recording.
//   3. So the side you are on drives. Each song's own music is reached by
//      scrolling on that song; the side under your hand never freezes.
//
// Pure — no DOM.

import { timeToY, yToTime, mapTime, layoutHeight } from './bands.js';

const FOLLOW_AT = 0.4; // aligned mode keeps the playhead a little above centre

const clamp = (value, low, high) => Math.min(Math.max(value, low), high);
const other = (side) => (side === 'a' ? 'b' : 'a');

export function contentHeight({ mode, layout, durations, pxPerSec, driver = 'a' }) {
  return mode === 'aligned' ? layoutHeight(layout) : durations[driver] * pxPerSec;
}

// Where the two songs line up on screen when you scroll by hand: Meld's sync
// point. The middle of the viewport — sliding to the top over the first half
// screen of scroll, and to the bottom over the last — so both songs start
// together at the top and end together at the bottom, and in between the
// alignment stays where the eye rests. (The first design swept the line across
// the whole screen over the whole song: level music near the top early on,
// near the bottom late — a line that never stays put.)
export function syncPoint(scroll, maxScroll, viewHeight) {
  if (maxScroll <= 0) return 0;
  // too little to scroll for two half screens: slide straight across
  if (maxScroll < viewHeight) return (clamp(scroll, 0, maxScroll) / maxScroll) * viewHeight;
  const half = viewHeight / 2;
  const fromTop = 0.5 * Math.min(1, scroll / half);
  const towardBottom = 0.5 * Math.max(0, (scroll - (maxScroll - half)) / half);
  return (fromTop + towardBottom) * viewHeight;
}

// How long a playhead below the middle takes to glide back up to it, seconds
// (the time constant of the ease: about 95 % of the way after three of these).
export const FOLLOW_GLIDE = 0.35;

// Following playback, one frame at a time. The playhead's place is the middle
// of the screen, and the page scrolls under it there — but a jump of the
// playhead that stays on screen (a click on the waveform) never moves the page
// under the pointer:
//
//   above the middle  the page waits; the playhead travels down from where you
//                     clicked, and the page starts scrolling when it arrives
//   below the middle  the playhead glides back up to the middle, the page
//                     scrolling a little faster than playback to catch up
//   off the screen    (Home, a band from the list) the view comes to it, with
//                     the playhead in the middle
//
// The page never scrolls before the start of the song nor past its end, so
// the playhead starts at the top and finishes at the bottom. The songs line up
// on the playhead's own line. `previous` is { scrollTop, focusY, dt } — where
// the page is now, the playhead's line drawn last frame (null when there was
// none), and the seconds since; without it the playhead is simply placed in
// the middle. Returns { scrollTop, focusY }.
export function followPlayback(params, side, t, previous = null) {
  const { pxPerSec, viewHeight } = params;
  if (params.mode === 'aligned') {
    return { scrollTop: Math.max(0, timeToY(params.layout, side, t) - viewHeight * FOLLOW_AT), focusY: null };
  }

  const maxScroll = Math.max(0, contentHeight({ ...params, driver: side }) - viewHeight);
  const at = t * pxPerSec;
  const middle = viewHeight / 2;
  const place = (scroll) => {
    const scrollTop = clamp(scroll, 0, maxScroll);
    return { scrollTop, focusY: at - scrollTop };
  };
  if (!previous) return place(at - middle);

  const dt = Math.max(previous.dt ?? 0, 0);
  const line = at - previous.scrollTop; // where the playhead would be if the page stayed
  if (line < 0 || line > viewHeight) return place(at - middle);
  if (line <= middle) return place(previous.scrollTop);

  // Where the playhead was last frame. Taken from the line actually drawn —
  // reconstructing it from dt and the zoom drifts, because the playback
  // advance between two frames never matches the frame time exactly, and the
  // ease then settles a few pixels off the middle instead of on it. Only a
  // real jump (a click) starts the glide from the new line.
  const drawn = previous.focusY;
  const jumped = !Number.isFinite(drawn) || Math.abs(line - drawn) > Math.max(8, 3 * pxPerSec * dt);
  const was = jumped ? line : drawn;

  if (was <= middle + 1) return place(at - middle); // at the middle: hold it there
  const glided = middle + (was - middle) * Math.exp(-dt / FOLLOW_GLIDE);
  return place(at - (glided - middle < 1 ? middle : glided));
}

export function makeView(params) {
  const { mode, layout, durations, pxPerSec, scrollTop, viewHeight, driver = 'a' } = params;
  const height = contentHeight(params);

  if (mode === 'aligned') {
    return {
      mode,
      contentHeight: height,
      y: (side, t) => timeToY(layout, side, t) - scrollTop,
      time: (side, y) => yToTime(layout, side, y + scrollTop),
      // A band fills its whole slot on both sides, including the side with
      // nothing in it — that is where the hatching goes.
      extent: (band) => [band.top - scrollTop, band.top + band.height - scrollTop],
    };
  }

  const maxScroll = Math.max(0, height - viewHeight);
  const scroll = clamp(scrollTop, 0, maxScroll);
  // the playhead's line while following playback, Meld's sync point otherwise
  const focusY = Number.isFinite(params.focusY)
    ? clamp(params.focusY, 0, viewHeight)
    : syncPoint(scroll, maxScroll, viewHeight);

  // The driving side's moment at the focus line, and the other side's through
  // the correspondence. For the driving side the offset is the scroll itself:
  // it moves pixel for pixel.
  const driverTime = clamp((scroll + focusY) / pxPerSec, 0, durations[driver]);
  const followerTime = mapTime(layout, driver, other(driver), driverTime);
  const offsets = {
    [driver]: driverTime * pxPerSec - focusY,
    [other(driver)]: followerTime * pxPerSec - focusY,
  };

  const y = (side, t) => t * pxPerSec - offsets[side];
  const range = (band, side) => (side === 'a' ? band.a : band.b);

  return {
    mode,
    driver,
    contentHeight: height,
    focusY,
    offsets,
    maxScroll,
    y,
    time: (side, py) => clamp((py + offsets[side]) / pxPerSec, 0, durations[side]),
    // Each side's own stretch. A side with no counterpart has none: its
    // range is zero-length, and the ribbon closes to a point there.
    extent: (band, side) => [y(side, range(band, side)[0]), y(side, range(band, side)[1])],
  };
}

// The scroll position that brings moment `t` of one side to where the eye
// is: the focus line in 'true' mode, a little above centre in 'aligned' mode.
export function scrollFor(params, side, t) {
  const { mode, layout, viewHeight, pxPerSec, driver = 'a' } = params;
  if (mode === 'aligned') {
    return Math.max(0, timeToY(layout, side, t) - viewHeight * FOLLOW_AT);
  }
  const maxScroll = Math.max(0, contentHeight(params) - viewHeight);
  if (maxScroll === 0) return 0;
  const target = (side === driver ? t : mapTime(layout, side, driver, t)) * pxPerSec;
  // scroll + syncPoint(scroll) only ever grows with scroll, so the scroll that
  // puts `target` on the sync point is found by halving the interval
  let low = 0;
  let high = maxScroll;
  for (let step = 0; step < 50; step += 1) {
    const middle = (low + high) / 2;
    if (middle + syncPoint(middle, maxScroll, viewHeight) < target) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}

// Handing the scroll to the other side without anything moving under the
// pointer: for the side taking over, the scroll that keeps it exactly where it
// is on screen is its current offset (a driving side's offset is its scroll).
export function scrollForNewDriver(view, params, newDriver) {
  const maxScroll = Math.max(0, contentHeight({ ...params, driver: newDriver }) - params.viewHeight);
  return clamp(view.offsets?.[newDriver] ?? 0, 0, maxScroll);
}
