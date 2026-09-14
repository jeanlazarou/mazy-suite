import { describe, it, expect } from 'vitest';
import { buildBands, layoutBands, mapTime } from '../src/model/bands.js';
import {
  makeView,
  scrollFor,
  scrollForNewDriver,
  contentHeight,
  syncPoint,
  followPlayback,
} from '../src/model/view.js';

// A rework's shape: A 212 s, B 248 s, with a changed stretch where B runs
// long and a bridge only B has.
const durations = { a: 212, b: 248 };
const segments = [
  { kind: 'same', a: [0, 18], b: [0, 14] },
  { kind: 'changed', a: [18, 70], b: [14, 88] },
  { kind: 'added', a: null, b: [88, 104] },
  { kind: 'same', a: [70, 212], b: [104, 248] },
];
const pxPerSec = 10;
const viewHeight = 800;
const layout = layoutBands(buildBands(segments, durations.a, durations.b), pxPerSec);
const params = (scrollTop, driver = 'a', mode = 'true') => ({
  mode,
  layout,
  durations,
  pxPerSec,
  scrollTop,
  viewHeight,
  driver,
});

describe("makeView — 'true' mode", () => {
  it('lets the driving song set the scroll height', () => {
    expect(contentHeight(params(0, 'a'))).toBe(2120);
    expect(contentHeight(params(0, 'b'))).toBe(2480);
  });

  it('starts both songs together at the top', () => {
    for (const driver of ['a', 'b']) {
      const view = makeView(params(0, driver));
      expect(view.y('a', 0)).toBe(0);
      expect(view.y('b', 0)).toBe(0);
    }
  });

  it('ends both songs together at the bottom', () => {
    for (const driver of ['a', 'b']) {
      const view = makeView(params(10_000, driver)); // clamped to the end
      expect(view.y('a', 212)).toBeCloseTo(viewHeight, 6);
      expect(view.y('b', 248)).toBeCloseTo(viewHeight, 6);
    }
  });

  it('never blocks the side you scroll on — it moves pixel for pixel, even through what only the other side has', () => {
    // scrolling on A across the stretch where only B has music (B's bridge)
    for (let scroll = 500; scroll < 1100; scroll += 50) {
      const before = makeView(params(scroll, 'a'));
      const after = makeView(params(scroll + 10, 'a'));
      expect(before.offsets.a - after.offsets.a).toBeCloseTo(-10, 6);
    }
  });

  it('lets the other side do the waiting through what only the driving side has', () => {
    // driving on B through its bridge (B 88–104), A stands still at 70 s
    const inBridge = [scrollFor(params(0, 'b'), 'b', 90), scrollFor(params(0, 'b'), 'b', 102)];
    const [early, late] = inBridge.map((scroll) => makeView(params(scroll, 'b')));
    expect(early.time('a', early.focusY)).toBeCloseTo(70, 3);
    expect(late.time('a', late.focusY)).toBeCloseTo(70, 3);
  });

  it('draws each side at one scale, so a longer passage is taller', () => {
    const view = makeView(params(300));
    const [a0, a1] = view.extent(layout[1], 'a'); // the changed band
    const [b0, b1] = view.extent(layout[1], 'b');
    expect(a1 - a0).toBeCloseTo(52 * pxPerSec, 6);
    expect(b1 - b0).toBeCloseTo(74 * pxPerSec, 6);
  });

  it('closes a side with no counterpart to a point', () => {
    const view = makeView(params(500));
    const [a0, a1] = view.extent(layout[2], 'a'); // the added bridge, on A
    expect(a1 - a0).toBe(0);
  });

  it('keeps corresponding music level at the focus line, whichever side drives', () => {
    for (const driver of ['a', 'b']) {
      for (const scrollTop of [0, 300, 700, 1000, 1320]) {
        const view = makeView(params(scrollTop, driver));
        const driverTime = view.time(driver, view.focusY);
        const other = driver === 'a' ? 'b' : 'a';
        const otherTime = mapTime(layout, driver, other, driverTime);
        expect(view.y(driver, driverTime)).toBeCloseTo(view.focusY, 3);
        expect(view.y(other, otherTime)).toBeCloseTo(view.focusY, 3);
      }
    }
  });

  it('round-trips a moment through its height', () => {
    const view = makeView(params(700, 'b'));
    expect(view.time('a', view.y('a', 55))).toBeCloseTo(55, 6);
    expect(view.time('b', view.y('b', 120))).toBeCloseTo(120, 6);
  });

  it('does not scroll when the driving song fits', () => {
    const small = layoutBands(buildBands(segments, durations.a, durations.b), 3);
    const view = makeView({ ...params(500), layout: small, pxPerSec: 3 }); // 636 px < 800
    expect(view.maxScroll).toBe(0);
    expect(view.y('a', 0)).toBe(0);
  });
});

describe('syncPoint — where the songs line up when you scroll by hand', () => {
  const max = 2000;

  it('is at the top at the start of the song', () => {
    expect(syncPoint(0, max, 800)).toBe(0);
  });

  it('slides to the middle over the first half screen', () => {
    expect(syncPoint(200, max, 800)).toBeCloseTo(200, 6);
    expect(syncPoint(400, max, 800)).toBeCloseTo(400, 6);
  });

  it('stays in the middle for the rest of the song', () => {
    for (const scroll of [400, 900, 1600]) expect(syncPoint(scroll, max, 800)).toBeCloseTo(400, 6);
  });

  it('slides to the bottom over the last half screen', () => {
    expect(syncPoint(1800, max, 800)).toBeCloseTo(600, 6);
    expect(syncPoint(2000, max, 800)).toBeCloseTo(800, 6);
  });

  it('slides straight across when there is too little to scroll for two half screens', () => {
    expect(syncPoint(150, 300, 800)).toBeCloseTo(400, 6);
    expect(syncPoint(300, 300, 800)).toBeCloseTo(800, 6);
  });
});

describe('followPlayback', () => {
  const H = viewHeight;
  const follow = (t, side = 'a') => followPlayback(params(0, side), side, t);

  it('leaves the page still while the playhead travels from the top to the middle', () => {
    for (const t of [0, 10, 25, 40]) {
      const { scrollTop, focusY } = follow(t);
      expect(scrollTop).toBe(0);
      expect(focusY).toBeCloseTo(t * pxPerSec, 6);
    }
  });

  it('keeps the playhead in the middle while the page scrolls under it', () => {
    for (const t of [41, 90, 150]) {
      const { scrollTop, focusY } = follow(t);
      expect(focusY).toBeCloseTo(H / 2, 6);
      expect(scrollTop).toBeCloseTo(t * pxPerSec - H / 2, 6);
    }
  });

  it('stops the page once the end is in view, and lets the playhead travel on to the bottom', () => {
    const endScroll = durations.a * pxPerSec - H;
    for (const t of [175, 195, 212]) {
      const { scrollTop, focusY } = follow(t);
      expect(scrollTop).toBeCloseTo(endScroll, 6);
      expect(focusY).toBeCloseTo(t * pxPerSec - endScroll, 6);
    }
    expect(follow(212).focusY).toBeCloseTo(H, 6);
  });

  // Playback frame by frame, as the app runs it.
  const play = (from, seconds, scrollTop, side = 'a') => {
    const frames = [];
    let previous = { scrollTop, dt: 0 };
    const dt = 1 / 60;
    const until = Math.min(from + seconds, durations[side]); // a song ends
    for (let t = from; t <= until; t += dt) {
      const frame = followPlayback(params(0, side), side, t, previous);
      frames.push({ t, ...frame });
      previous = { scrollTop: frame.scrollTop, focusY: frame.focusY, dt };
    }
    return frames;
  };

  it('does not move the page when you click above the middle: the playhead travels down from there', () => {
    const scrolled = 800; // mid-song
    const clickedAt = 100; // px from the top of the view
    const t = (scrolled + clickedAt) / pxPerSec;
    const frames = play(t, 0.5, scrolled);
    expect(frames[0]).toMatchObject({ scrollTop: scrolled, focusY: clickedAt });
    expect(frames.at(-1).scrollTop).toBe(scrolled);
    expect(frames.at(-1).focusY).toBeGreaterThan(clickedAt);
  });

  it('starts scrolling once the playhead so launched reaches the middle, and holds it there', () => {
    const scrolled = 800;
    const t = (scrolled + 300) / pxPerSec; // 100 px above the middle, 10 s at 10 px/s
    const frames = play(t, 20, scrolled);
    const arrived = frames.find((f) => f.focusY >= H / 2 - 1e-6);
    expect(arrived.t - t).toBeCloseTo(10, 1);
    for (const f of frames.filter((frame) => frame.t > arrived.t + 0.1)) {
      expect(f.focusY).toBeCloseTo(H / 2, 6);
    }
  });

  it('does not jump when you click below the middle: the playhead glides back up to it', () => {
    const scrolled = 800;
    const clickedAt = 650;
    const t = (scrolled + clickedAt) / pxPerSec;
    const frames = play(t, 3, scrolled);
    expect(frames[0]).toMatchObject({ scrollTop: scrolled, focusY: clickedAt });
    // never a jump: the line moves by a few pixels a frame at most
    for (let k = 1; k < frames.length; k += 1) {
      expect(Math.abs(frames[k].focusY - frames[k - 1].focusY)).toBeLessThan(15);
    }
    // always easing upward, never past the middle
    expect(frames.every((f) => f.focusY >= H / 2 - 1e-6)).toBe(true);
    expect(frames.at(-1).focusY).toBeCloseTo(H / 2, 6);
    expect(frames.find((f) => f.focusY - H / 2 < 1).t - t).toBeLessThan(2.5);
  });

  it('brings the view to a playhead that jumped off the screen, with the playhead in the middle', () => {
    const frame = followPlayback(params(0, 'a'), 'a', 150, { scrollTop: 0, dt: 1 / 60 });
    expect(frame.focusY).toBeCloseTo(H / 2, 6);
  });

  it('lets the playhead finish at the bottom even when clicked below the middle near the end', () => {
    const endScroll = durations.a * pxPerSec - H;
    const frames = play((endScroll + 650) / pxPerSec, 20, endScroll);
    expect(frames.every((f) => f.scrollTop === endScroll)).toBe(true);
    expect(frames.at(-1).focusY).toBeGreaterThan(H - 2);
    expect(frames.at(-1).focusY).toBeLessThanOrEqual(H);
  });

  it('settles exactly on the middle at any zoom, however fast the playhead moves', () => {
    for (const zoom of [14, 60, 120]) { // zooms at which the song scrolls
      const zoomed = { ...params(0, 'a'), pxPerSec: zoom };
      let t = 100; // clicked at 1:40, near the bottom of the view
      let previous = { scrollTop: t * zoom - 700, dt: 0 };
      let frame;
      for (let k = 0; k < 240; k += 1) {
        frame = followPlayback(zoomed, 'a', t, previous);
        previous = { scrollTop: frame.scrollTop, focusY: frame.focusY, dt: 1 / 60 };
        t += 1 / 60;
      }
      expect(frame.focusY).toBeCloseTo(H / 2, 6);
    }
  });

  it('settles exactly on the middle even when playback does not advance by the frame time', () => {
    // a browser: frames report 1/60 s while the audio clock moves 1/48 s, with jitter
    const zoomed = { ...params(0, 'a'), pxPerSec: 14 };
    let t = 100;
    let previous = { scrollTop: t * 14 - 640, dt: 0 };
    let frame;
    for (let k = 0; k < 300; k += 1) {
      frame = followPlayback(zoomed, 'a', t, previous);
      previous = { scrollTop: frame.scrollTop, focusY: frame.focusY, dt: 1 / 60 };
      t += 1 / 48 + (k % 3 === 0 ? 0.004 : 0);
    }
    expect(frame.focusY).toBeCloseTo(H / 2, 6);
  });

  it('lines the other song up on the playhead’s own line, wherever it is on screen', () => {
    for (const t of [12, 60, 120, 200]) {
      const { scrollTop, focusY } = follow(t, 'a');
      const view = makeView({ ...params(scrollTop, 'a'), focusY });
      expect(view.y('a', t)).toBeCloseTo(focusY, 3);
      expect(view.y('b', mapTime(layout, 'a', 'b', t))).toBeCloseTo(focusY, 3);
    }
  });
});

describe('handing the scroll to the other side', () => {
  it('keeps the side taking over exactly where it is on screen', () => {
    for (const scrollTop of [150, 640, 1200]) {
      const onA = makeView(params(scrollTop, 'a'));
      const onB = makeView(params(scrollForNewDriver(onA, params(scrollTop, 'a'), 'b'), 'b'));
      for (const t of [20, 90, 150]) {
        expect(onB.y('b', t)).toBeCloseTo(onA.y('b', t), 3);
      }
    }
  });
});

describe('a song that starts with music the other does not have', () => {
  // The recording's first 31.7 s unclassified; the first segment pairs its
  // 0:31.7 with Suno's 0:00.
  const lead = { a: 211.7, b: 248.2 };
  const leadLayout = layoutBands(buildBands([{ kind: 'same', a: [31.7, 50.3], b: [0, 55.5] }], lead.a, lead.b), 14);
  const leadParams = (scrollTop, driver) => ({
    mode: 'true',
    layout: leadLayout,
    durations: lead,
    pxPerSec: 14,
    scrollTop,
    viewHeight: 800,
    driver,
  });

  it('shows the recording’s opening when scrolling on the recording', () => {
    const view = makeView(leadParams(0, 'a'));
    expect(view.y('a', 0)).toBe(0);
    expect(view.y('a', 10)).toBeGreaterThan(0);
    expect(view.y('a', 10)).toBeLessThan(800);
  });

  it('can bring every moment of the opening to the focus line, while Suno waits at its start', () => {
    for (const t of [0, 10, 20, 31]) {
      const view = makeView(leadParams(scrollFor(leadParams(0, 'a'), 'a', t), 'a'));
      expect(view.y('a', t)).toBeCloseTo(view.focusY, 3);
      expect(view.y('b', 0)).toBeCloseTo(view.focusY, 3);
    }
  });

  it('keeps the playhead on screen while following the opening on the recording', () => {
    for (const t of [1, 15, 30]) {
      const view = makeView(leadParams(scrollFor(leadParams(0, 'a'), 'a', t), 'a'));
      expect(view.y('a', t)).toBeGreaterThanOrEqual(0);
      expect(view.y('a', t)).toBeLessThanOrEqual(800);
    }
  });
});

describe("makeView — 'aligned' mode", () => {
  it('reads the band layout, with one shared scroll', () => {
    const view = makeView(params(100, 'a', 'aligned'));
    expect(view.y('a', 0)).toBe(-100);
    expect(view.y('b', 0)).toBe(-100);
  });

  it('gives every band its full slot on both sides, for the hatching', () => {
    const view = makeView(params(0, 'a', 'aligned'));
    const band = layout[2]; // the added bridge
    expect(view.extent(band)).toEqual([band.top, band.top + band.height]);
  });
});

describe('scrollFor', () => {
  it('brings a moment of the driving side to the focus line', () => {
    for (const [side, t] of [['a', 40], ['b', 96], ['a', 150], ['b', 230]]) {
      const scrollTop = scrollFor(params(0, side), side, t);
      const view = makeView(params(scrollTop, side));
      expect(view.y(side, t)).toBeCloseTo(view.focusY, 3);
    }
  });

  it('brings a moment of the other side to the focus line when the driving side has its counterpart', () => {
    for (const [side, t] of [['b', 40], ['b', 230], ['a', 150]]) {
      const driver = side === 'a' ? 'b' : 'a';
      const view = makeView(params(scrollFor(params(0, driver), side, t), driver));
      expect(view.y(side, t)).toBeCloseTo(view.focusY, 3);
    }
  });

  it('brings a moment only the other side has onto the screen, though not onto the focus line', () => {
    // B's bridge jumps past while A drives — so following and revealing hand
    // the scroll to the side they show
    const view = makeView(params(scrollFor(params(0, 'a'), 'b', 96), 'a'));
    expect(view.y('b', 96)).toBeGreaterThanOrEqual(0);
    expect(view.y('b', 96)).toBeLessThanOrEqual(viewHeight);
  });

  it('is at the top for the start and at the end for the end', () => {
    expect(scrollFor(params(0, 'a'), 'a', 0)).toBeCloseTo(0, 6);
    expect(scrollFor(params(0, 'b'), 'b', 248)).toBeCloseTo(2480 - viewHeight, 3);
  });

  it('keeps the playhead a little above centre in aligned mode', () => {
    const scrollTop = scrollFor(params(0, 'a', 'aligned'), 'a', 100);
    const view = makeView(params(scrollTop, 'a', 'aligned'));
    expect(view.y('a', 100)).toBeCloseTo(viewHeight * 0.4, 3);
  });
});
