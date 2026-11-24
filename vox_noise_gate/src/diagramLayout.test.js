import { describe, expect, it } from "vitest";

import { BREAK_PX, CONTEXT, timeAxis, toTime, toX } from "./diagramLayout";
import { DEFAULT_PARAMS } from "./core/gate";

const silence = (silenceStart, silenceEnd) => ({ silenceStart, silenceEnd, atStart: false, atEnd: false });

describe("timeAxis", () => {
  it("shows a short silence whole, with voice either side", () => {
    const axis = timeAxis(silence(10, 10.5), DEFAULT_PARAMS, 60, 800);

    expect(axis.cutFrom).toBeNull();
    expect(axis.from).toBe(10 - CONTEXT);
    expect(axis.to).toBe(10.5 + CONTEXT);
    expect(toX(axis, axis.from)).toBe(0);
    expect(toX(axis, axis.to)).toBeCloseTo(800);
  });

  it("squeezes the middle of a long silence into a break, both edges at one scale", () => {
    const axis = timeAxis(silence(10, 14), DEFAULT_PARAMS, 60, 800);

    expect(axis.cutFrom).not.toBeNull();
    expect(toX(axis, axis.to)).toBeCloseTo(800);

    // 100 ms take as many pixels at the start and at the end of the silence
    const atStart = toX(axis, 10.1) - toX(axis, 10);
    const atEnd = toX(axis, 14) - toX(axis, 13.9);

    expect(atStart).toBeCloseTo(atEnd);
    expect(toX(axis, axis.cutTo) - toX(axis, axis.cutFrom)).toBeCloseTo(BREAK_PX);
  });

  it("keeps the edges wide enough for the kept audio, the fades and the min silence", () => {
    const params = { ...DEFAULT_PARAMS, keepAfter: 600, fadeOut: 100, fadeIn: 100, minSilence: 1000 };
    const axis = timeAxis(silence(10, 20), params, 60, 800);

    expect(axis.cutFrom).toBeGreaterThan(10 + 0.6 + 0.1);
    expect(axis.cutFrom).toBeGreaterThan(10 + 1);
  });

  it("stays inside the recording", () => {
    const axis = timeAxis({ silenceStart: 0, silenceEnd: 0.4, atStart: true, atEnd: false }, DEFAULT_PARAMS, 60, 800);

    expect(axis.from).toBe(0);
  });
});

describe("toTime", () => {
  it("undoes toX, in the break too", () => {
    for (const s of [silence(10, 10.5), silence(10, 14)]) {
      const axis = timeAxis(s, DEFAULT_PARAMS, 60, 800);

      for (const t of [9.8, 10, 10.2, 10.45, 12, 13.95, 14.1]) {
        const clamped = Math.max(axis.from, Math.min(axis.to, t));

        expect(toTime(axis, toX(axis, t))).toBeCloseTo(clamped, 6);
      }
    }
  });
});
