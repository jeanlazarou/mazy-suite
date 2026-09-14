// Ctrl+S. The document is saved where it came from, or at the path the
// naming rule gives it.
//
//   - Run from a dev server, the suite bridge writes the file into the data
//     tree, and keeps the index in step: a twin missing from twins.json cannot
//     be found again (a static app cannot list a folder).
//   - On a static site — the published demo — nothing can be written there, so
//     the document is kept in this browser instead (state/local_twins.js), and
//     opening the twin again brings that version back. Downloading it as a
//     file is a separate action (download_twin.js).

import { useTwinStore } from '../state/store.js';
import { serializeTwinDoc, twinPath } from '../model/twin.js';
import { putDataFile, loadTwinsIndex } from '../api.js';
import { keepInBrowser, forgetInBrowser } from '../state/local_twins.js';
import { downloadTwin } from './download_twin.js';
import { showToast } from './show_toast.js';

const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

// Whether the bridge answered: unknown until the first save. Once a write has
// been refused, this session does not keep asking a server that cannot write.
let bridge = null;

async function updateIndex(file, doc) {
  const entries = await loadTwinsIndex().catch(() => []);
  if (entries.some((entry) => entry.file === file)) return;
  const set = doc.sides.a.album && doc.sides.b.album
    ? `${doc.sides.a.album} ↔ ${doc.sides.b.album}`
    : undefined;
  const next = [...entries, set ? { file, set } : { file }];
  await putDataFile('twins/twins.json', json(next));
}

export async function saveTwin() {
  const { doc, file } = useTwinStore.getState();
  if (!doc) return;

  const path = file ?? twinPath(doc);
  const document = serializeTwinDoc(doc);

  if (bridge !== false && (await putDataFile(`twins/${path}`, json(document)))) {
    bridge = true;
    await updateIndex(path, doc);
    forgetInBrowser(path); // the file now holds this version
    // the index may have gained this twin: keep the set stepper in step
    const twins = await loadTwinsIndex().catch(() => useTwinStore.getState().twins);
    useTwinStore.setState({ dirty: false, file: path, twins, localCopy: null });
    showToast(`saved data/twins/${path}`);
    return;
  }
  bridge = false;

  const savedAt = keepInBrowser(path, document);
  if (savedAt) {
    useTwinStore.setState({ dirty: false, file: path, localCopy: { savedAt } });
    showToast('saved in this browser — ⤓ downloads it as a file, to keep elsewhere');
    return;
  }

  // The browser would not keep it either (a private window, a full quota):
  // hand the document over as a file rather than lose it.
  downloadTwin();
  useTwinStore.setState({ dirty: false });
  showToast('this browser would not keep it, so it was downloaded instead');
}
