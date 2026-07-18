import { describe, it, expect } from 'vitest';
import { parseSrtMarkers } from '../src/model/srt';
import { snapTime } from '../src/model/snap';

const SRT = `1
00:00:01,500 --> 00:00:03,000
First line

2
00:00:10,250 --> 00:00:12,000
Second line
continued

3
broken cue without arrow

4
00:01:00,000 --> 00:01:02,000
Minute one
`;

describe('parseSrtMarkers', () => {
  it('extracts start time and text of each cue', () => {
    const markers = parseSrtMarkers(SRT);
    expect(markers).toEqual([
      { t: 1.5, label: 'First line' },
      { t: 10.25, label: 'Second line continued' },
      { t: 60, label: 'Minute one' },
    ]);
  });

  it('returns empty on non-SRT input', () => {
    expect(parseSrtMarkers('just some text')).toEqual([]);
    expect(parseSrtMarkers('')).toEqual([]);
  });
});

describe('snapTime', () => {
  const markers = [{ t: 10, label: 'a' }, { t: 20, label: 'b' }];

  it('snaps to the nearest marker within tolerance', () => {
    expect(snapTime(10.3, markers, 0.5)).toBe(10);
    expect(snapTime(19.6, markers, 0.5)).toBe(20);
  });

  it('leaves the time alone outside tolerance', () => {
    expect(snapTime(15, markers, 0.5)).toBe(15);
    expect(snapTime(10.6, markers, 0.5)).toBe(10.6);
  });

  it('prefers the closest marker', () => {
    expect(snapTime(14.9, markers, 10)).toBe(10);
    expect(snapTime(15.1, markers, 10)).toBe(20);
  });
});
