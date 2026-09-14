// Writing a segment's label or note. Opens the text dialog (TextDialog) on
// the selected segment and writes the value back when it is confirmed.
//
// The segment is remembered when the dialog opens, so what is typed lands on
// the segment it was opened for even if the selection moves meanwhile.

import { useTwinStore } from '../state/store.js';
import { setFields } from '../model/edits.js';
import { applySegments } from './apply_segments.js';
import { showToast } from './show_toast.js';

export function openTextEditor(field) {
  const { doc, layout, selected } = useTwinStore.getState();
  const band = selected === null ? null : layout[selected];
  if (!doc || !band || band.segment === null) {
    showToast(`select a segment first, then ${field === 'note' ? 'n' : 'l'}`);
    return;
  }
  const segment = doc.segments[band.segment];
  useTwinStore.setState({
    // `opened` makes every opening distinct, so the dialog starts from the
    // segment's text even when the same field is edited twice in a row
    editing: { field, segment: band.segment, value: segment[field] ?? '', opened: Date.now() },
  });
}

export function commitTextEditor(value) {
  const { doc, editing } = useTwinStore.getState();
  useTwinStore.setState({ editing: null });
  if (!doc || !editing || !doc.segments[editing.segment]) return;
  const text = value.trim() || null;
  if (text === (doc.segments[editing.segment][editing.field] ?? null)) return; // unchanged: no undo step
  applySegments(setFields(doc.segments, editing.segment, { [editing.field]: text }));
}

export function cancelTextEditor() {
  useTwinStore.setState({ editing: null });
}
