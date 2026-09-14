// Twin documents kept in the browser.
//
// Where the app cannot write files — a static site such as the published demo —
// Save keeps the document in this browser's storage instead, keyed by the
// twin's path, and opening that twin again brings the browser's version back.
// It survives a reload and a closed tab; it does not travel to another browser
// (that is what downloading the document is for).
//
// Storage can be missing or refuse (a private window, a full quota): every call
// here fails soft and says so through its return value.

const PREFIX = 'twin_diff:twin:';

function storageOrNull(storage) {
  try {
    return storage ?? (typeof window !== 'undefined' ? window.localStorage : null);
  } catch {
    return null; // some browsers throw on merely reading localStorage
  }
}

// Returns the savedAt time, or null when the browser would not keep it.
export function keepInBrowser(path, document, { storage, now = Date.now() } = {}) {
  const store = storageOrNull(storage);
  if (!store || !path) return null;
  try {
    store.setItem(PREFIX + path, JSON.stringify({ savedAt: now, document }));
    return now;
  } catch {
    return null;
  }
}

// { savedAt, document } or null.
export function readFromBrowser(path, { storage } = {}) {
  const store = storageOrNull(storage);
  if (!store || !path) return null;
  try {
    const raw = store.getItem(PREFIX + path);
    if (!raw) return null;
    const value = JSON.parse(raw);
    return value && typeof value === 'object' && value.document ? value : null;
  } catch {
    return null;
  }
}

export function forgetInBrowser(path, { storage } = {}) {
  const store = storageOrNull(storage);
  if (!store || !path) return false;
  try {
    store.removeItem(PREFIX + path);
    return true;
  } catch {
    return false;
  }
}
