// Leaving a twin with unsaved edits. The first attempt only warns; doing the
// same thing again within a few seconds goes ahead and discards them. No
// browser confirm(): like prompt(), browsers start offering to block it, and
// the gesture that asked is the natural one to confirm with.

import { useTwinStore } from '../state/store.js';
import { showToast } from './show_toast.js';

const WINDOW_MS = 4000;
let armed = null; // { key, until }

// Returns true when `key` (what is being attempted) may go ahead now.
export function mayLeaveTwin(key, again) {
  if (!useTwinStore.getState().dirty) return true;
  const now = Date.now();
  if (armed && armed.key === key && now < armed.until) {
    armed = null;
    return true;
  }
  armed = { key, until: now + WINDOW_MS };
  showToast(`unsaved changes in this twin — Ctrl+S to save them, or ${again} to discard them`);
  return false;
}
