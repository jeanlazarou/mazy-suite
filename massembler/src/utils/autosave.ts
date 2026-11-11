import { useStore } from '../store';
import { AudioFile } from '../types';
import { audioBufferToWav } from './projectManager';
import { SessionProject, readSession, writeSession } from './sessionStore';

/**
 * Keeps the open project in browser storage (see sessionStore.ts) a moment
 * after every change, and brings it back on the next visit.
 *
 * Saving starts only once the person has chosen whether to restore the last
 * session: until then it must not be overwritten by the empty project the
 * app opens with.
 */

const SAVE_DELAY_MS = 1000;

export interface SavedSession {
  project: SessionProject;
  audio: Map<string, Blob>;
}

/**
 * What each audio file's bytes come from, as of the last successful save.
 * Compared by identity: relinking keeps a file's id but swaps its bytes.
 */
const written = new Map<string, object>();
const bytesOf = (audioFile: AudioFile): object => audioFile.sourceBlob ?? audioFile.buffer;

let started = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let saving = false;
let saveAgain = false;
let changes = 0;
let savedChanges = 0;
let failing = false;

const hasUnsavedChanges = () => changes !== savedChanges;

async function save() {
  if (saving) {
    saveAgain = true;
    return;
  }
  saving = true;

  const upTo = changes;
  const { projectName, tracks, clips, pixelsPerSecond, audioFiles } = useStore.getState();

  try {
    await writeSession(
      {
        name: projectName,
        tracks,
        clips,
        pixelsPerSecond,
        audioFiles: audioFiles.map((f) => ({
          id: f.id,
          name: f.name,
          duration: f.duration,
          fileName: f.sourceBlob ? (f.sourceFileName ?? f.name) : `${f.id}.wav`,
          optimization: f.optimization,
        })),
      },
      audioFiles.map((f) => ({
        id: f.id,
        blob: () => f.sourceBlob ?? audioBufferToWav(f.buffer),
        unchanged: written.get(f.id) === bytesOf(f),
      }))
    );

    written.clear();
    audioFiles.forEach((f) => written.set(f.id, bytesOf(f)));
    savedChanges = upTo;
    failing = false;
  } catch (error) {
    console.error('Autosave failed:', error);
    if (!failing) {
      const reason =
        error instanceof DOMException && error.name === 'QuotaExceededError'
          ? 'browser storage is full'
          : 'this browser would not store the project';
      useStore
        .getState()
        .showToast(
          `Autosave stopped: ${reason}. Use Save Project to keep your work in a file.`,
          'error',
          0
        );
    }
    failing = true;
  } finally {
    saving = false;
    if (saveAgain) {
      saveAgain = false;
      void save();
    }
  }
}

function flush() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (hasUnsavedChanges()) void save();
}

export function startAutosave() {
  if (started) return;
  started = true;

  useStore.subscribe((state, previous) => {
    if (
      state.tracks === previous.tracks &&
      state.clips === previous.clips &&
      state.audioFiles === previous.audioFiles &&
      state.projectName === previous.projectName &&
      state.pixelsPerSecond === previous.pixelsPerSecond
    ) {
      return;
    }
    changes++;
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, SAVE_DELAY_MS);
  });

  // Saved work needs no warning; only changes not yet stored do.
  window.addEventListener('beforeunload', (e) => {
    if (!hasUnsavedChanges()) return;
    flush();
    e.preventDefault();
    e.returnValue = '';
  });

  // The last chance that reliably comes, on mobile especially.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
}

/** The session kept from last time, if it holds any work worth offering. */
export async function findSavedSession(): Promise<SavedSession | null> {
  try {
    const session = await readSession();
    if (!session) return null;
    const { project } = session;
    return project.audioFiles.length > 0 || project.clips.length > 0 ? session : null;
  } catch (error) {
    console.error('Could not read the saved session:', error);
    return null;
  }
}

export async function restoreSession({ project, audio }: SavedSession): Promise<void> {
  const store = useStore.getState();
  let ctx = store.audioContext;
  if (!ctx) {
    ctx = new AudioContext();
    store.setAudioContext(ctx);
  }

  const audioFiles: AudioFile[] = [];
  for (const meta of project.audioFiles) {
    const blob = audio.get(meta.id);
    if (!blob) throw new Error(`the audio for "${meta.name}" is missing`);

    const buffer = await ctx.decodeAudioData(await blob.arrayBuffer());
    audioFiles.push({
      id: meta.id,
      name: meta.name,
      buffer,
      duration: buffer.duration,
      sourceBlob: blob,
      sourceFileName: meta.fileName,
      optimization: meta.optimization,
    });
  }

  store.loadProjectState(
    project.tracks,
    project.clips,
    audioFiles,
    project.pixelsPerSecond,
    project.name
  );

  // Already stored: the next save need not write them again.
  audioFiles.forEach((f) => written.set(f.id, bytesOf(f)));
}
