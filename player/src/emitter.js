// Minimal event-stream primitives replacing the RxJS Subject/ReplaySubject/throttle
// trio this app used. Subscribers get a { unsubscribe } handle, like RxJS.

export class Emitter {
  constructor() {
    this.listeners = new Set();
  }

  next(value) {
    for (const listener of [...this.listeners]) listener(value);
  }

  subscribe(listener) {
    this.listeners.add(listener);

    return { unsubscribe: () => this.listeners.delete(listener) };
  }

  // Filtered view of this emitter (replaces .pipe(filter(...))).
  filter(predicate) {
    return {
      subscribe: (listener) =>
        this.subscribe((value) => {
          if (predicate(value)) listener(value);
        }),
    };
  }
}

// Replays the latest value to new subscribers (replaces ReplaySubject(1)).
export class ReplayEmitter extends Emitter {
  next(value) {
    this.last = value;
    this.hasValue = true;

    super.next(value);
  }

  subscribe(listener) {
    const subscription = super.subscribe(listener);

    if (this.hasValue) listener(this.last);

    return subscription;
  }
}

// Leading-edge throttle: emits a value, then mutes the stream for `delay` ms
// (replaces .pipe(throttle(() => interval(delay)))).
export class ThrottleEmitter extends Emitter {
  constructor(delay) {
    super();
    this.delay = delay;
    this.lastEmit = 0;
  }

  next(value) {
    const now = Date.now();

    if (now - this.lastEmit < this.delay) return;

    this.lastEmit = now;

    super.next(value);
  }
}
