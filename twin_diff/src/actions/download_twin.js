// Ctrl+Shift+S, or ⤓: the twin document as a file — to keep, share, or open
// again later with open… → "Twin document from a file".

import { useTwinStore } from '../state/store.js';
import { serializeTwinDoc, twinFileName } from '../model/twin.js';
import { showToast } from './show_toast.js';

export function downloadTwin() {
  const { doc } = useTwinStore.getState();
  if (!doc) return;
  const name = twinFileName(doc);
  const body = `${JSON.stringify(serializeTwinDoc(doc), null, 2)}\n`;
  const url = URL.createObjectURL(new Blob([body], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // released a moment later: some browsers (Safari) cancel a download whose
  // URL is revoked straight after the click
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  showToast(`downloaded “${name}” — open… → Twin document from a file brings it back`);
}
