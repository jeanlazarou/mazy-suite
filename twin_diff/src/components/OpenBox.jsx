import { useEffect, useRef, useState } from 'react';

import { loadTwinsIndex } from '../api.js';
import { useTwinStore } from '../state/store.js';
import { openTwinFromIndex, openTwinFromFile } from '../actions/open_twin.js';
import { readFromBrowser } from '../state/local_twins.js';
import { openLocalFiles } from '../actions/open_local_files.js';
import { mayLeaveTwin } from '../actions/guard_unsaved.js';

// Three ways in: a twin document from the suite's data tree, a twin document
// from a file (one downloaded earlier), or two audio files off the disk for a
// twin that does not exist yet.
export function OpenBox({ open, onClose }) {
  const twins = useTwinStore((s) => s.twins);
  const twinsError = useTwinStore((s) => s.twinsError);
  const dirty = useTwinStore((s) => s.dirty);
  const [files, setFiles] = useState({ a: null, b: null });
  const [twinFile, setTwinFile] = useState(null);
  const [warned, setWarned] = useState(null); // what was clicked once with unsaved changes
  const dialogRef = useRef(null);

  // With unsaved changes, the first click only warns — the toast would be
  // hidden behind this modal dialog, so the warning is shown in it.
  const leave = (key) => {
    if (mayLeaveTwin(key, 'click it again')) {
      setWarned(null);
      return true;
    }
    setWarned(key);
    return false;
  };

  useEffect(() => {
    if (!open) return;
    loadTwinsIndex()
      .then((entries) => useTwinStore.setState({ twins: entries, twinsError: null }))
      .catch((error) =>
        useTwinStore.setState({ twins: [], twinsError: String(error.message ?? error) }),
      );
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const sets = new Map();
  for (const entry of twins) {
    const key = entry.set ?? '';
    if (!sets.has(key)) sets.set(key, []);
    sets.get(key).push(entry);
  }

  const openBoth = async () => {
    if (!files.a || !files.b) return;
    if (!leave('open:local files')) return;
    onClose();
    await openLocalFiles(files.a, files.b);
  };

  return (
    <dialog ref={dialogRef} className="open-box" onCancel={onClose} onClose={onClose}>
      <h2>Open a twin</h2>

      {dirty ? (
        <p className={`unsaved${warned ? ' is-warned' : ''}`}>
          {warned
            ? 'Click it again to open it and discard the unsaved changes — or close this and save first (Ctrl+S).'
            : 'The open twin has unsaved changes: opening another one discards them.'}
        </p>
      ) : null}

      {twinsError ? (
        <p className="hint">
          No <code>data/twins/twins.json</code> ({twinsError}). Point the app at a data folder with{' '}
          <code>scripts/link_data.sh demo</code>, or open two files below.
        </p>
      ) : null}

      {[...sets.entries()].map(([set, entries]) => (
        <section key={set}>
          {set ? <h3>{set}</h3> : null}
          <ul className="twin-index">
            {entries.map((entry) => (
              <li key={entry.file}>
                <button
                  type="button"
                  onClick={async () => {
                    if (!leave(`open:${entry.file}`)) return;
                    onClose();
                    await openTwinFromIndex(entry.file);
                  }}
                >
                  {entry.file.replace(/\.twin\.json$/, '').split('/').pop()}
                  {readFromBrowser(entry.file) ? <span className="kept"> · your version</span> : null}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <section>
        <h3>Twin document from a file</h3>
        <div className="file-rows">
          <input
            type="file"
            accept=".json,application/json"
            onChange={(event) => setTwinFile(event.target.files[0] ?? null)}
          />
        </div>
        <button
          type="button"
          className="primary"
          disabled={!twinFile}
          onClick={async () => {
            if (!leave('open:twin file')) return;
            onClose();
            await openTwinFromFile(twinFile);
          }}
        >
          open the document
        </button>
      </section>

      <section>
        <h3>Two audio files</h3>
        <div className="file-rows">
          {['a', 'b'].map((side) => (
            <label key={side}>
              <span>{side.toUpperCase()}</span>
              <input
                type="file"
                accept="audio/*"
                onChange={(event) =>
                  setFiles((current) => ({ ...current, [side]: event.target.files[0] ?? null }))
                }
              />
            </label>
          ))}
        </div>
        <button type="button" className="primary" onClick={openBoth} disabled={!files.a || !files.b}>
          open the pair
        </button>
      </section>

      <footer>
        <button type="button" onClick={onClose}>
          close
        </button>
      </footer>
    </dialog>
  );
}
