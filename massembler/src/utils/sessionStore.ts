import { AudioClip, AudioFileOptimization, Track } from '../types';

/**
 * The browser's own copy of the open project, kept in IndexedDB so a refresh
 * or a closed tab loses nothing. There is one session: the project last
 * worked on in this browser.
 *
 * Audio lives in a store of its own, one record per file, and a file is only
 * written when it is new or has changed. The project record is small and is
 * rewritten on every save. Both go in one transaction, so a session is never
 * left with a project that points at audio that is not there.
 */

const DB_NAME = 'massembler';
const DB_VERSION = 1;
const PROJECT_STORE = 'project';
const AUDIO_STORE = 'audio';
const PROJECT_KEY = 'current';

/** Shape of the stored project record. Bump when it changes incompatibly. */
const SCHEMA = 1;

export interface SessionAudioMeta {
  id: string;
  name: string;
  duration: number;
  /** Name the stored bytes go by; its extension tells their encoding. */
  fileName: string;
  optimization?: AudioFileOptimization;
}

export interface SessionProject {
  schema: number;
  savedAt: number;
  name: string;
  tracks: Track[];
  clips: AudioClip[];
  pixelsPerSecond: number;
  /** Absent in sessions kept before it existed: full volume. */
  masterVolume?: number;
  audioFiles: SessionAudioMeta[];
}

export interface SessionAudio {
  id: string;
  /** The bytes to store. Only called when the file has to be written. */
  blob: () => Blob;
  /** True when an earlier save already wrote these exact bytes. */
  unchanged: boolean;
}

let opening: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(PROJECT_STORE);
      request.result.createObjectStore(AUDIO_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }).catch((error) => {
    opening = null; // let a later save try again
    throw error;
  });
  return opening;
}

function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function committed(tx: IDBTransaction): Promise<void> {
  const done = new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
  });
  // Awaited at the end; this only keeps an early failure from going unhandled.
  done.catch(() => {});
  return done;
}

export async function writeSession(
  project: Omit<SessionProject, 'schema' | 'savedAt'>,
  audio: SessionAudio[]
): Promise<void> {
  const db = await openDb();
  const tx = db.transaction([PROJECT_STORE, AUDIO_STORE], 'readwrite');
  const done = committed(tx);
  const audioStore = tx.objectStore(AUDIO_STORE);

  try {
    // What is actually stored, not what this tab believes it wrote: another
    // tab working on another project may have replaced the session meanwhile.
    const stored = new Set((await result(audioStore.getAllKeys())).map(String));
    const used = new Set(audio.map((a) => a.id));

    for (const file of audio) {
      if (!file.unchanged || !stored.has(file.id)) audioStore.put(file.blob(), file.id);
    }
    for (const id of stored) {
      if (!used.has(id)) audioStore.delete(id);
    }

    tx.objectStore(PROJECT_STORE).put(
      { ...project, schema: SCHEMA, savedAt: Date.now() },
      PROJECT_KEY
    );
  } catch (error) {
    // All or nothing: a half-written save could delete audio the stored
    // project still needs.
    try {
      tx.abort();
    } catch {
      // already finished
    }
    throw error;
  }

  await done;
}

export async function readSession(): Promise<{
  project: SessionProject;
  audio: Map<string, Blob>;
} | null> {
  const db = await openDb();
  const tx = db.transaction([PROJECT_STORE, AUDIO_STORE], 'readonly');

  const project = (await result(tx.objectStore(PROJECT_STORE).get(PROJECT_KEY))) as
    | SessionProject
    | undefined;
  if (!project || project.schema !== SCHEMA) return null;

  const audio = new Map<string, Blob>();
  for (const meta of project.audioFiles) {
    const blob = await result(tx.objectStore(AUDIO_STORE).get(meta.id));
    if (blob instanceof Blob) audio.set(meta.id, blob);
  }

  return { project, audio };
}
