import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Emitter, ReplayEmitter, ThrottleEmitter } from "./emitter";

describe("Emitter", () => {
  it("delivers values to subscribers", () => {
    const emitter = new Emitter();
    const seen = [];

    emitter.subscribe((v) => seen.push(v));
    emitter.next(1);
    emitter.next(2);

    expect(seen).toEqual([1, 2]);
  });

  it("stops delivering after unsubscribe", () => {
    const emitter = new Emitter();
    const seen = [];

    const subscription = emitter.subscribe((v) => seen.push(v));
    emitter.next(1);
    subscription.unsubscribe();
    emitter.next(2);

    expect(seen).toEqual([1]);
  });

  it("supports multiple independent subscribers", () => {
    const emitter = new Emitter();
    const a = [];
    const b = [];

    emitter.subscribe((v) => a.push(v));
    const subB = emitter.subscribe((v) => b.push(v));

    emitter.next(1);
    subB.unsubscribe();
    emitter.next(2);

    expect(a).toEqual([1, 2]);
    expect(b).toEqual([1]);
  });

  it("filter() only passes matching values", () => {
    const emitter = new Emitter();
    const seen = [];

    const filtered = emitter.filter(({ action }) => action === "play");
    const subscription = filtered.subscribe((v) => seen.push(v));

    emitter.next({ action: "play" });
    emitter.next({ action: "stop" });
    emitter.next({ action: "play" });

    expect(seen).toEqual([{ action: "play" }, { action: "play" }]);

    subscription.unsubscribe();
    emitter.next({ action: "play" });
    expect(seen).toHaveLength(2);
  });

  it("survives a subscriber unsubscribing during dispatch", () => {
    const emitter = new Emitter();
    const seen = [];

    const subscription = emitter.subscribe(() => subscription.unsubscribe());
    emitter.subscribe((v) => seen.push(v));

    emitter.next(1);

    expect(seen).toEqual([1]);
  });
});

describe("ReplayEmitter", () => {
  it("replays the last value to new subscribers", () => {
    const emitter = new ReplayEmitter();
    emitter.next({ loopMode: "track" });

    const seen = [];
    emitter.subscribe((v) => seen.push(v));

    expect(seen).toEqual([{ loopMode: "track" }]);
  });

  it("does not replay when nothing was emitted", () => {
    const emitter = new ReplayEmitter();
    const seen = [];

    emitter.subscribe((v) => seen.push(v));

    expect(seen).toEqual([]);
  });

  it("keeps only the latest value", () => {
    const emitter = new ReplayEmitter();
    emitter.next(1);
    emitter.next(2);

    const seen = [];
    emitter.subscribe((v) => seen.push(v));

    expect(seen).toEqual([2]);
  });
});

describe("ThrottleEmitter", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("emits the first value and mutes the rest of the window", () => {
    const emitter = new ThrottleEmitter(500);
    const seen = [];
    emitter.subscribe((v) => seen.push(v));

    emitter.next(1);
    emitter.next(2);

    vi.advanceTimersByTime(499);
    emitter.next(3);

    vi.advanceTimersByTime(2);
    emitter.next(4);

    expect(seen).toEqual([1, 4]);
  });
});
