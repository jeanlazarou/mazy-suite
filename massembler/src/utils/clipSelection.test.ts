import { describe, expect, it } from 'vitest';
import {
  MIN_SELECTION_SECONDS,
  advancePlayhead,
  dragSelection,
  grabAt,
  panView,
  zoomView,
} from './clipSelection';

// 10 pixels a second, for grabAt.
const toX = (time: number) => time * 10;

describe('grabAt', () => {
  const selection = { start: 2, end: 6 }; // 20 px to 60 px

  it('grabs an edge within reach', () => {
    expect(grabAt(22, selection, toX, 8)).toBe('start');
    expect(grabAt(57, selection, toX, 8)).toBe('end');
  });

  it('grabs the middle to move the selection', () => {
    expect(grabAt(40, selection, toX, 8)).toBe('move');
  });

  it('starts a new selection anywhere else, or when there is none', () => {
    expect(grabAt(80, selection, toX, 8)).toBe('new');
    expect(grabAt(40, null, toX, 8)).toBe('new');
  });

  it('takes the nearer edge of a selection too narrow to tell apart', () => {
    const narrow = { start: 2, end: 2.5 }; // 20 px to 25 px
    expect(grabAt(21, narrow, toX, 8)).toBe('start');
    expect(grabAt(24, narrow, toX, 8)).toBe('end');
  });
});

describe('dragSelection', () => {
  const origin = { start: 2, end: 6 };

  it('selects between the press and the pointer, either way round', () => {
    expect(dragSelection('new', null, 5, 8, 10)).toEqual({ start: 5, end: 8 });
    expect(dragSelection('new', origin, 5, 1, 10)).toEqual({ start: 1, end: 5 });
  });

  it('moves one edge, never past the other', () => {
    expect(dragSelection('start', origin, 2, 3, 10)).toEqual({ start: 3, end: 6 });
    expect(dragSelection('end', origin, 6, 9, 10)).toEqual({ start: 2, end: 9 });
    expect(dragSelection('start', origin, 2, 8, 10)).toEqual({ start: 6 - MIN_SELECTION_SECONDS, end: 6 });
  });

  it('moves the whole selection, keeping its length and staying in the file', () => {
    expect(dragSelection('move', origin, 4, 5, 10)).toEqual({ start: 3, end: 7 });
    expect(dragSelection('move', origin, 4, 20, 10)).toEqual({ start: 6, end: 10 });
    expect(dragSelection('move', origin, 4, -5, 10)).toEqual({ start: 0, end: 4 });
  });

  it('stays inside the file', () => {
    expect(dragSelection('new', null, 5, 30, 10)).toEqual({ start: 5, end: 10 });
    expect(dragSelection('end', origin, 6, -3, 10).start).toBe(2);
  });
});

describe('zoomView', () => {
  const whole = { start: 0, end: 100 };

  it('keeps the time under the pointer in place', () => {
    const zoomed = zoomView(whole, 2, 0.25, 100, 32); // pointer at 25 s
    expect(zoomed).toEqual({ start: 12.5, end: 62.5 });
    expect(zoomed.start + 0.25 * (zoomed.end - zoomed.start)).toBe(25);
  });

  it('stops at the whole file and at the deepest zoom', () => {
    expect(zoomView(whole, 0.5, 0.5, 100, 32)).toEqual(whole);
    const deepest = zoomView({ start: 0, end: 4 }, 2, 0, 100, 32);
    expect(deepest.end - deepest.start).toBe(100 / 32);
  });

  it('never runs past either end of the file', () => {
    expect(zoomView({ start: 90, end: 100 }, 0.5, 1, 100, 32)).toEqual({ start: 80, end: 100 });
  });
});

describe('panView', () => {
  it('slides the view, stopping at the ends of the file', () => {
    expect(panView({ start: 10, end: 20 }, 5, 100)).toEqual({ start: 15, end: 25 });
    expect(panView({ start: 10, end: 20 }, -50, 100)).toEqual({ start: 0, end: 10 });
    expect(panView({ start: 10, end: 20 }, 500, 100)).toEqual({ start: 90, end: 100 });
  });
});

describe('advancePlayhead', () => {
  const selection = { start: 2, end: 6 };

  it('moves on with the audio', () => {
    expect(advancePlayhead(3, 0.5, selection, false)).toBe(3.5);
    expect(advancePlayhead(5.8, 0.5, selection, false)).toBeCloseTo(6.3); // the audio stops there
  });

  it('wraps back to the start of the selection when looping', () => {
    expect(advancePlayhead(5.8, 0.5, selection, true)).toBeCloseTo(2.3);
  });

  it('wraps into a selection just moved behind the playhead', () => {
    expect(advancePlayhead(8, 0.1, { start: 2, end: 3 }, true)).toBeCloseTo(2.1);
  });
});
