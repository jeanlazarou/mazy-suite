import { useEffect, useRef } from 'react';

import { HOTKEYS } from '../hotkeys.js';

export function HelpBox({ open, onClose }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog ref={dialogRef} className="help-box" onCancel={onClose} onClose={onClose}>
      <h2>Keys</h2>
      <table>
        <tbody>
          {HOTKEYS.map(([key, what]) => (
            <tr key={key}>
              <th>{key}</th>
              <td>{what}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hint">
        Click a waveform to move there — clicking the silent side takes you to the corresponding
        moment, not to its own second count.
      </p>
      <footer>
        <button type="button" onClick={onClose}>
          close
        </button>
      </footer>
    </dialog>
  );
}
