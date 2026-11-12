import { describe, expect, it } from 'vitest';
import { activeLoop, timelinePosition } from './loop';

const region = { start: 4, end: 6 };

describe('activeLoop', () => {
  it('loops when playback starts before the end of the region', () => {
    expect(activeLoop(region, 0)).toBe(region);
    expect(activeLoop(region, 5)).toBe(region);
  });

  it('carries straight on when started past it', () => {
    expect(activeLoop(region, 6)).toBeNull();
    expect(activeLoop(region, 9)).toBeNull();
  });

  it('ignores a missing or too short region', () => {
    expect(activeLoop(null, 0)).toBeNull();
    expect(activeLoop({ start: 4, end: 4.1 }, 0)).toBeNull();
  });
});

describe('timelinePosition', () => {
  it('moves straight on without a loop', () => {
    expect(timelinePosition(3, 10, null)).toBe(13);
  });

  it('reaches the end of the region, then goes round it', () => {
    expect(timelinePosition(1, 4.5, region)).toBe(5.5); // still before the end
    expect(timelinePosition(1, 5, region)).toBe(4); // at the end: back to the start
    expect(timelinePosition(1, 6.5, region)).toBe(5.5);
    expect(timelinePosition(1, 9.25, region)).toBe(4.25); // the third time round
  });

  it('starts inside the region as readily as before it', () => {
    expect(timelinePosition(5, 0.5, region)).toBe(5.5);
    expect(timelinePosition(5, 1.5, region)).toBe(4.5);
  });

  it('ignores a region that playback started after', () => {
    expect(timelinePosition(7, 2, region)).toBe(9);
  });
});
