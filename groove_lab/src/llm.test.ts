import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchModels, generateVariation, sanitizePattern } from "./llm";
import { createEmptyPattern } from "./pattern";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

describe("fetchModels", () => {
  it("strips only :latest, keeps size tags distinct", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          models: [
            { name: "qwen2.5:32b" },
            { name: "qwen2.5:latest" },
            { name: "phi4:latest" },
          ],
        }),
      ),
    );
    expect(await fetchModels("http://x")).toEqual([
      "qwen2.5:32b",
      "qwen2.5",
      "phi4",
    ]);
  });

  it("returns null (and warns) when Ollama is down or errors", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    expect(await fetchModels("http://x")).toBeNull();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, false, 500)));
    expect(await fetchModels("http://x")).toBeNull();
    expect(warn).toHaveBeenCalled();
  });
});

describe("sanitizePattern — trust nothing", () => {
  const base = () => ({ ...createEmptyPattern(), bpm: 111, swing: 0.3 });

  it("keeps grid dimensions and bpm/swing from the base pattern", () => {
    const p = sanitizePattern(base(), {
      drums: { kick: [{ step: 0, velocity: 0.9 }] },
      bass: [],
    })!;
    expect(p.bpm).toBe(111);
    expect(p.swing).toBe(0.3);
    expect(p.bars).toBe(1);
    expect(p.drums.kick).toEqual([{ step: 0, velocity: 0.9 }]);
  });

  it("drops out-of-range steps, dedupes, sorts, rounds fractional steps", () => {
    const p = sanitizePattern(base(), {
      drums: {
        snare: [
          { step: 12, velocity: 0.8 },
          { step: 4.4, velocity: 0.8 },
          { step: 4, velocity: 0.5 }, // dup of rounded 4.4
          { step: 16, velocity: 0.8 }, // out of range
          { step: -1, velocity: 0.8 },
          { step: "x", velocity: 0.8 },
        ],
      },
      bass: [],
    })!;
    expect(p.drums.snare).toEqual([
      { step: 4, velocity: 0.8 },
      { step: 12, velocity: 0.8 },
    ]);
  });

  it("normalizes 0-127 velocities and clamps the rest", () => {
    const p = sanitizePattern(base(), {
      drums: {
        kick: [
          { step: 0, velocity: 100 }, // MIDI scale
          { step: 4, velocity: 1.7 }, // "over-enthusiastic 1.0", not MIDI scale
          { step: 8, velocity: 0 }, // dropped
          { step: 12, velocity: 300 }, // absurd → clamp to 1? >127 → clamped
        ],
      },
      bass: [],
    })!;
    const byStep = Object.fromEntries(p.drums.kick.map((s) => [s.step, s.velocity]));
    expect(byStep[0]).toBeCloseTo(100 / 127);
    expect(byStep[4]).toBe(1);
    expect(byStep[8]).toBeUndefined();
    expect(byStep[12]).toBe(1);
  });

  it("folds bass pitches into E1–G3 by octaves and enforces monophony", () => {
    const p = sanitizePattern(base(), {
      drums: {},
      bass: [
        { step: 0, durationSteps: 8, midiPitch: 16, velocity: 0.8 }, // E0 → E1
        { step: 4, durationSteps: 2, midiPitch: 69, velocity: 0.8 }, // A4 → A3?→ folds down to ≤55
      ],
    })!;
    expect(p.bass[0]).toMatchObject({ step: 0, midiPitch: 28, durationSteps: 4 }); // truncated by note 2
    expect(p.bass[1].midiPitch).toBeLessThanOrEqual(55);
    expect(p.bass[1].midiPitch).toBeGreaterThanOrEqual(28);
    expect(p.bass[1].midiPitch % 12).toBe(69 % 12); // same pitch class
  });

  it("missing lanes come back empty; garbage returns null", () => {
    const p = sanitizePattern(base(), { drums: {}, bass: [] })!;
    expect(p.drums.ride).toEqual([]);
    expect(sanitizePattern(base(), null)).toBeNull();
    expect(sanitizePattern(base(), "nope")).toBeNull();
    expect(sanitizePattern(base(), { bass: [] })).toBeNull();
  });
});

describe("generateVariation", () => {
  it("parses schema-constrained output, even wrapped in code fences", async () => {
    const content =
      "```json\n" +
      JSON.stringify({
        drums: { kick: [{ step: 0, velocity: 0.9 }] },
        bass: [{ step: 0, durationSteps: 4, midiPitch: 33, velocity: 0.8 }],
      }) +
      "\n```";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ message: { content } })),
    );
    const p = await generateVariation(createEmptyPattern(), "busier", "m", "http://x");
    expect(p?.drums.kick).toHaveLength(1);
    expect(p?.bass).toHaveLength(1);
  });

  it("null on HTTP error, network failure, or prose output — never throws", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, false, 500)));
    expect(await generateVariation(createEmptyPattern(), "x", "m", "http://x")).toBeNull();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("abort")));
    expect(await generateVariation(createEmptyPattern(), "x", "m", "http://x")).toBeNull();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({ message: { content: "Here is the pattern you asked for!" } }),
      ),
    );
    expect(await generateVariation(createEmptyPattern(), "x", "m", "http://x")).toBeNull();
    expect(warn).toHaveBeenCalledTimes(3);
  });
});
