// Every segment edit goes through here: snapshot for undo, write the
// document, rebuild the layout, mark the document dirty.

import { useTwinStore, refreshLayout } from '../state/store.js';
import { pushHistory } from '../state/history.js';

export function applySegments(segments, { history = true } = {}) {
  const { doc } = useTwinStore.getState();
  if (!doc) return;
  if (history) pushHistory();
  useTwinStore.setState({ doc: { ...doc, segments }, dirty: true });
  refreshLayout();
}
