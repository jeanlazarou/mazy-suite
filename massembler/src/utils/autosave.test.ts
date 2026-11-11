import 'fake-indexeddb/auto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { useStore } from '../store';
import { AudioClip, AudioFile, Track } from '../types';
import { findSavedSession, restoreSession, startAutosave } from './autosave';
import { readSession } from './sessionStore';

// These tests follow one session from start to finish, so they build on one
// another and run in order: autosave keeps state for the life of the page.

// Node's, which fake-indexeddb runs its work on; the app's types are DOM-only.
declare function setImmediate(callback: () => void): void;

const s = () => useStore.getState();

const audioFile = (id: string, bytes: string): AudioFile => ({
  id,
  name: `${id}.mp3`,
  duration: 3,
  buffer: {} as AudioBuffer,
  sourceBlob: new Blob([bytes]),
  sourceFileName: `${id}.mp3`,
});
const clipOn = (id: string, audioFileId: string): AudioClip => ({
  id, name: id, audioFileId, startTime: 0, endTime: 1, duration: 1,
});
const oneTrack = (): Track[] => [
  {
    id: 'track-1', name: 'T1', volume: 0.8, muted: false,
    clips: [{ id: 'tc-1', clipId: 'A', position: 0, repeat: false }],
  },
];

// --- the browser around it

const listeners: Record<string, (event: unknown) => void> = {};
/** Whether closing the tab now would ask for confirmation. */
function closingWarns() {
  let warned = false;
  listeners.beforeunload({ preventDefault: () => (warned = true), returnValue: undefined });
  return warned;
}

/** Writes per object store, and a switch to make saving the project fail. */
const writes: Record<string, number> = {};
let storageFull = false;

/** Let the save delay run out, then let IndexedDB finish. */
async function afterSave() {
  await vi.advanceTimersByTimeAsync(1000);
  for (let i = 0; i < 100; i++) await new Promise<void>((resolve) => setImmediate(resolve));
}

const storedAudio = async () => [...((await readSession())?.audio.keys() ?? [])].sort();

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  vi.spyOn(console, 'error').mockImplementation(() => {});

  vi.stubGlobal('window', {
    addEventListener: (type: string, listener: (event: unknown) => void) => (listeners[type] = listener),
  });
  vi.stubGlobal('document', {
    visibilityState: 'visible',
    addEventListener: () => {},
  });
  vi.stubGlobal(
    'AudioContext',
    class {
      async decodeAudioData(bytes: ArrayBuffer) {
        return { duration: bytes.byteLength } as AudioBuffer;
      }
    }
  );

  const put = IDBObjectStore.prototype.put;
  vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
    this: IDBObjectStore,
    ...args: Parameters<IDBObjectStore['put']>
  ) {
    if (storageFull && this.name === 'project') {
      throw new DOMException('full', 'QuotaExceededError');
    }
    writes[this.name] = (writes[this.name] ?? 0) + 1;
    return put.apply(this, args);
  });
});

afterAll(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('autosave, over one session', () => {
  it('finds nothing to offer at first', async () => {
    expect(await findSavedSession()).toBeNull();
  });

  it('stores the project and its audio a moment after a change', async () => {
    startAutosave();
    expect(closingWarns()).toBe(false);

    s().loadProjectState(oneTrack(), [clipOn('A', 'f1')], [audioFile('f1', 'first')], 50, 'My song');
    expect(closingWarns()).toBe(true);

    await afterSave();
    expect(closingWarns()).toBe(false);

    const stored = await readSession();
    expect(stored?.project.name).toBe('My song');
    expect(stored?.project.tracks[0].clips[0].id).toBe('tc-1');
    expect(stored?.project.audioFiles[0].fileName).toBe('f1.mp3');
    expect(await stored?.audio.get('f1')?.text()).toBe('first');
    expect(writes.audio).toBe(1);
  });

  it('saves a burst of edits once, without writing the audio again', async () => {
    const projectWrites = writes.project;
    s().updateTrack('track-1', { name: 'Lead' });
    s().updateTrack('track-1', { volume: 0.5 });
    s().setProjectName('My song 2');
    await afterSave();

    expect(writes.project).toBe(projectWrites + 1);
    expect(writes.audio).toBe(1);
    expect((await readSession())?.project.tracks[0].name).toBe('Lead');
  });

  it('writes a relinked file again: same id, new bytes', async () => {
    useStore.setState({ audioFiles: [audioFile('f1', 'relinked')] });
    await afterSave();

    expect(writes.audio).toBe(2);
    expect(await (await readSession())?.audio.get('f1')?.text()).toBe('relinked');
  });

  it('drops the audio of a file the project no longer has', async () => {
    s().addAudioFile(audioFile('f2', 'second'));
    await afterSave();
    s().removeAudioFile('f1');
    await afterSave();

    expect(await storedAudio()).toEqual(['f2']);
  });

  it('writes its audio back when another tab has replaced the session', async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open('massembler');
      request.onsuccess = () => resolve(request.result);
    });
    await new Promise<void>((resolve) => {
      const tx = db.transaction('audio', 'readwrite');
      tx.objectStore('audio').clear();
      tx.oncomplete = () => resolve();
    });

    s().updateTrack('track-1', { muted: true });
    await afterSave();

    expect(await storedAudio()).toEqual(['f2']);
  });

  it('restores a session, decoding the stored audio', async () => {
    const session = await findSavedSession();
    expect(session).not.toBeNull();

    s().loadProjectState([], [], [], 50, 'something else');
    await restoreSession(session!);

    expect(s().projectName).toBe('My song 2');
    expect(s().audioFiles.map((f) => f.id)).toEqual(['f2']);
    expect(await s().audioFiles[0].sourceBlob?.text()).toBe('second');
  });

  it('does not offer a project with nothing in it', async () => {
    s().loadProjectState(
      [{ id: 'track-1', name: 'T', volume: 1, muted: false, clips: [] }], [], [], 50, 'empty'
    );
    await afterSave();
    expect(await findSavedSession()).toBeNull();
  });

  it('when storage fails: one lasting toast, the stored session intact, and a warning on close', async () => {
    s().loadProjectState(oneTrack(), [clipOn('A', 'f3')], [audioFile('f3', 'third')], 50, 'Kept');
    await afterSave();

    storageFull = true;
    s().addAudioFile(audioFile('f4', 'fourth'));
    await afterSave();
    s().updateTrack('track-1', { name: 'again' });
    await afterSave();

    const errors = s().toasts.filter((t) => t.type === 'error');
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/storage is full/);
    expect(errors[0].duration).toBe(0);
    expect((await readSession())?.project.name).toBe('Kept');
    expect(await storedAudio()).toEqual(['f3']); // the failed save wrote nothing
    expect(closingWarns()).toBe(true);
  });

  it('recovers on the next save once storage is back', async () => {
    storageFull = false;
    s().updateTrack('track-1', { name: 'recovered' });
    await afterSave();

    expect(closingWarns()).toBe(false);
    expect(await storedAudio()).toEqual(['f3', 'f4']);
  });
});
