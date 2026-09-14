// Open a twin: read the document, decode both sides, build the layout.

import { loadTwinFile, loadAudio } from '../api.js';
import { parseTwinDoc, twinPath } from '../model/twin.js';
import { readFromBrowser, forgetInBrowser } from '../state/local_twins.js';
import { showToast } from './show_toast.js';
import { sharedScale } from '../model/peaks.js';
import { engine } from '../audio/engine.js';
import { useTwinStore, refreshLayout, DEFAULT_PX_PER_SEC } from '../state/store.js';
import { clearHistory } from '../state/history.js';
import { loadLyricsFor } from './load_lyrics.js';

export async function openTwinDoc(raw, { fetchAudio, file = null, localCopy = null } = {}) {
  const { doc, problems } = parseTwinDoc(raw);
  if (!doc) {
    useTwinStore.setState({ status: 'error', error: problems.join('; '), problems });
    return null;
  }

  useTwinStore.setState({ status: 'loading', error: null, problems, doc });
  engine.clear();

  try {
    const get = fetchAudio ?? ((side) => loadAudio(side.url));
    const [aBuffer, bBuffer] = await Promise.all([get(doc.sides.a, 'a'), get(doc.sides.b, 'b')]);
    const [a, b] = await Promise.all([engine.decode(aBuffer), engine.decode(bBuffer)]);
    engine.setSide('a', a);
    engine.setSide('b', b);
    engine.clock = 'a';
    engine.audible = 'a';

    useTwinStore.setState({
      status: 'ready',
      durations: { a: a.buffer.duration, b: b.buffer.duration },
      peaks: { a: a.peaks, b: b.peaks },
      waveScale: sharedScale(a.peaks, b.peaks),
      pxPerSec: DEFAULT_PX_PER_SEC,
      clock: 'a',
      audible: 'a',
      playing: false,
      position: 0,
      selected: null,
      file,
      localCopy, // { savedAt } when this is the browser's saved version, not the published one
      dirty: false,
      pending: null,
      editing: null,
      scrollDriver: 'a',
      toast: null, // a message about the twin just left no longer applies
    });
    clearHistory();
    refreshLayout();
    // Lyrics arrive on their own time: the twin is usable without them.
    loadLyricsFor(doc);
    return doc;
  } catch (error) {
    useTwinStore.setState({ status: 'error', error: String(error.message ?? error) });
    return null;
  }
}

// A twin of the index. If this browser keeps a saved version of it (Save on
// a site that cannot write files), that version is the one opened — marked as
// such, with the published one a click away.
export async function openTwinFromIndex(file, { published = false } = {}) {
  try {
    const kept = published ? null : readFromBrowser(file);
    if (kept) {
      return await openTwinDoc(kept.document, { file, localCopy: { savedAt: kept.savedAt } });
    }
    return await openTwinDoc(await loadTwinFile(file), { file });
  } catch (error) {
    useTwinStore.setState({ status: 'error', error: String(error.message ?? error) });
    return null;
  }
}

// Back to the published version: the browser's saved one is forgotten.
export async function openPublishedVersion() {
  const { file } = useTwinStore.getState();
  if (!file) return null;
  forgetInBrowser(file);
  const doc = await openTwinFromIndex(file, { published: true });
  if (doc) showToast('this is the published version again — your browser copy was removed');
  return doc;
}

// A twin document from a file — typically one downloaded earlier. Its audio
// and lyrics are found the usual way, by the paths it names. When it is one of
// the index's twins (same song, same renditions), it takes that twin's place:
// the set stepper knows where it is, and Save keeps it under that name.
export async function openTwinFromFile(fileObject) {
  let raw;
  try {
    raw = JSON.parse(await fileObject.text());
  } catch {
    showToast(`“${fileObject.name}” is not a twin document (not JSON)`);
    return null;
  }
  const { doc, problems } = parseTwinDoc(raw);
  if (!doc) {
    showToast(`“${fileObject.name}” is not a twin document: ${problems.join('; ')}`);
    return null;
  }
  const path = twinPath(doc);
  const indexed = useTwinStore.getState().twins.some((entry) => entry.file === path);
  const opened = await openTwinDoc(raw, { file: indexed ? path : null });
  if (opened) showToast(`opened “${fileObject.name}”`);
  return opened;
}
