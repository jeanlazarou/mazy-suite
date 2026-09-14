import { useEffect, useRef } from 'react';

import { useTwinStore } from '../state/store.js';
import { commitTextEditor, cancelTextEditor } from '../actions/edit_text.js';
import { clock as formatClock } from '../format.js';

// The label / note editor. A <dialog> like the Open and Help boxes, instead of
// window.prompt — which the browser starts offering to block after the first
// use, and which cannot say which segment is being written on.
export function TextDialog() {
  const editing = useTwinStore((s) => s.editing);
  const doc = useTwinStore((s) => s.doc);
  const dialogRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (editing) {
      if (!dialog.open) dialog.showModal();
      inputRef.current?.focus();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [editing]);

  const segment = editing && doc ? doc.segments[editing.segment] : null;
  const where = segment
    ? [
        segment.a ? `${doc.sides.a.label} ${formatClock(segment.a[0])}–${formatClock(segment.a[1])}` : null,
        segment.b ? `${doc.sides.b.label} ${formatClock(segment.b[0])}–${formatClock(segment.b[1])}` : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : '';
  const isNote = editing?.field === 'note';

  return (
    <dialog
      ref={dialogRef}
      className="text-dialog"
      onCancel={(event) => {
        event.preventDefault(); // Esc: close through the store, not behind its back
        cancelTextEditor();
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          commitTextEditor(inputRef.current?.value ?? '');
        }}
      >
        <h2>{isNote ? 'Note' : 'Label'}</h2>
        {segment ? (
          <p className="hint">
            <span className={`kind-tag kind-${segment.kind}`}>{segment.kind}</span> {where}
          </p>
        ) : null}
        {/* A fresh input each time the dialog opens, holding the current text
            from its first render — so when focus lands on it the text is
            already there to select, and typing replaces it. */}
        <input
          key={editing ? `${editing.segment}-${editing.field}-${editing.opened}` : 'closed'}
          ref={inputRef}
          type="text"
          defaultValue={editing?.value ?? ''}
          onFocus={(event) => event.target.select()}
          placeholder={isNote ? 'what changed — "new drum groove"' : 'a short name — "verse 2"'}
          maxLength={isNote ? 400 : 60}
        />
        <p className="hint">Enter to save · Esc to cancel · empty to remove</p>
        <footer>
          <button type="button" onClick={cancelTextEditor}>
            cancel
          </button>
          <button type="submit" className="primary">
            save
          </button>
        </footer>
      </form>
    </dialog>
  );
}
