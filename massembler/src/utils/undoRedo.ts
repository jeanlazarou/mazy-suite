import { AudioClip, AudioFile, Track } from '../types';

/**
 * Undo history, kept as snapshots of the project.
 *
 * Tracks, clips and audio files are immutable, so a snapshot is just the
 * three arrays as they stood: whatever did not change is shared between
 * entries and costs nothing. An audio file is held by reference, so no audio
 * is ever copied - but a removed file stays in memory for as long as a step
 * in the history could bring it back.
 *
 * Every change to those arrays is recorded as it happens (the store
 * subscribes and calls record), so no action has to opt in. Two things group
 * changes into a single entry:
 *
 * - A gesture: everything between beginGesture and endGesture, such as a
 *   drag, files one entry, and none at all if nothing changed.
 * - A burst: changes made through coalesced() under the same key, close
 *   together, join the entry the first of them opened. Typing a name or
 *   turning a knob is one step, not one per keystroke or wheel notch.
 */

export interface Snapshot {
  tracks: Track[];
  clips: AudioClip[];
  audioFiles: AudioFile[];
}

/** Whether two snapshots hold different arrays: anything changed in between. */
export function snapshotsDiffer(a: Snapshot, b: Snapshot): boolean {
  return a.tracks !== b.tracks || a.clips !== b.clips || a.audioFiles !== b.audioFiles;
}

const MAX_ENTRIES = 100;
/** Changes under one key closer together than this are one burst. */
const BURST_MS = 1500;

export class History {
  private past: Snapshot[] = [];
  private future: Snapshot[] = [];
  /** The arrangement as it was when the running gesture began. */
  private gestureStart: Snapshot | null = null;
  private burst: { key: string; at: number } | null = null;
  private pendingKey: string | null = null;
  private restoring = false;

  /** Called whenever canUndo or canRedo may have changed. */
  onChange: (() => void) | null = null;

  constructor(
    private read: () => Snapshot,
    private write: (snapshot: Snapshot) => void
  ) {}

  canUndo(): boolean {
    return this.past.length > 0;
  }

  canRedo(): boolean {
    return this.future.length > 0;
  }

  /** Tracks or clips just changed; `before` is what they replaced. */
  record(before: Snapshot) {
    if (this.restoring || this.gestureStart) return;

    const key = this.pendingKey;
    const now = Date.now();
    const continues =
      key !== null && this.burst?.key === key && now - this.burst.at < BURST_MS;

    this.burst = key === null ? null : { key, at: now };
    if (!continues) this.push(before);
  }

  /** Make a change as part of the burst named by `key`. */
  coalesced(key: string, change: () => void) {
    this.pendingKey = key;
    try {
      change();
    } finally {
      this.pendingKey = null;
    }
  }

  beginGesture() {
    // A gesture whose end never arrived is closed here, rather than left
    // open to swallow every change after it.
    this.endGesture();
    this.gestureStart = this.read();
  }

  endGesture() {
    const start = this.gestureStart;
    if (!start) return;
    this.gestureStart = null;
    this.burst = null;

    const now = this.read();
    if (snapshotsDiffer(now, start)) this.push(start);
  }

  undo() {
    // Not mid-gesture: the drag would carry on writing over the restored state.
    if (this.gestureStart) return;
    const previous = this.past.pop();
    if (!previous) return;
    this.future.push(this.read());
    this.restore(previous);
  }

  redo() {
    if (this.gestureStart) return;
    const next = this.future.pop();
    if (!next) return;
    this.past.push(this.read());
    this.restore(next);
  }

  clear() {
    this.past = [];
    this.future = [];
    this.gestureStart = null;
    this.burst = null;
    this.onChange?.();
  }

  private push(snapshot: Snapshot) {
    this.past.push(snapshot);
    if (this.past.length > MAX_ENTRIES) this.past.shift();
    this.future = [];
    this.onChange?.();
  }

  private restore(snapshot: Snapshot) {
    this.burst = null;
    this.restoring = true;
    try {
      this.write(snapshot);
    } finally {
      this.restoring = false;
    }
    this.onChange?.();
  }
}
