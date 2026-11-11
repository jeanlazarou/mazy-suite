/**
 * A stand-in for the Web Audio API, enough for the scheduler, the engine and
 * the transport: it records what it is asked to do instead of making sound.
 * Its clock only moves when a test sets `currentTime`.
 */

export type AutomationEvent = [kind: 'set' | 'ramp' | 'target', value: number, time: number];

export class MockParam {
  events: AutomationEvent[] = [];
  constructor(public value = 1) {}
  setValueAtTime(value: number, time: number) {
    this.events.push(['set', value, time]);
    return this;
  }
  linearRampToValueAtTime(value: number, time: number) {
    this.events.push(['ramp', value, time]);
    return this;
  }
  setTargetAtTime(value: number, time: number) {
    this.events.push(['target', value, time]);
    return this;
  }
}

export class MockNode {
  disconnected = false;
  connect<T>(node: T): T {
    return node;
  }
  disconnect() {
    this.disconnected = true;
  }
}

export class MockGain extends MockNode {
  gain = new MockParam(1);
}

export class MockBuffer {
  private channels: Float32Array[];
  constructor(
    public numberOfChannels: number,
    public length: number,
    public sampleRate: number
  ) {
    this.channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }
  get duration() {
    return this.length / this.sampleRate;
  }
  getChannelData(channel: number) {
    return this.channels[channel];
  }
}

export class MockSource extends MockNode {
  buffer: MockBuffer | null = null;
  playbackRate = new MockParam(1);
  /** [when, offset, duration] as passed to start(). */
  startArgs: number[] | null = null;
  stops: number[] = [];
  start(...args: number[]) {
    this.startArgs = args;
  }
  stop(time = 0) {
    this.stops.push(time);
  }
}

export class MockContext {
  /** Every context made, so tests can reach the one the app created. */
  static created: MockContext[] = [];

  currentTime = 0;
  sampleRate = 10;
  state: AudioContextState = 'running';
  destination = new MockNode();
  sources: MockSource[] = [];
  gains: MockGain[] = [];

  constructor() {
    MockContext.created.push(this);
  }
  createGain() {
    const gain = new MockGain();
    this.gains.push(gain);
    return gain;
  }
  createBufferSource() {
    const source = new MockSource();
    this.sources.push(source);
    return source;
  }
  createBuffer(channels: number, length: number, sampleRate: number) {
    return new MockBuffer(channels, length, sampleRate);
  }
  resume() {
    return Promise.resolve();
  }
}

/** The last item of a list (the app targets ES2020, before Array.prototype.at). */
export const last = <T>(items: readonly T[]): T | undefined => items[items.length - 1];

/** The mocks, typed as the real things for the code under test. */
export const asAudioContext = (ctx: MockContext) => ctx as unknown as AudioContext;
export const asAudioBuffer = (buffer: MockBuffer) => buffer as unknown as AudioBuffer;
