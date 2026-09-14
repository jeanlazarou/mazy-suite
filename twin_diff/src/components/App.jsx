import { useEffect, useState } from 'react';

import { useTwinStore } from '../state/store.js';
import { engine } from '../audio/engine.js';
import { installHotkeys } from '../hotkeys.js';
import { loadTwinsIndex } from '../api.js';
import { openTwinFromIndex } from '../actions/open_twin.js';
import { Transport } from './Transport.jsx';
import { SideHeaders } from './SideHeaders.jsx';
import { PendingBar } from './PendingBar.jsx';
import { TwinView } from './TwinView.jsx';
import { BandList } from './BandList.jsx';
import { OpenBox } from './OpenBox.jsx';
import { HelpBox } from './HelpBox.jsx';
import { TextDialog } from './TextDialog.jsx';

// The pairing gesture has two steps, so it has to be able to say what it is
// waiting for.
function Toast() {
  const toast = useTwinStore((s) => s.toast);
  return toast ? <div className="toast">{toast}</div> : null;
}

export function App() {
  const status = useTwinStore((s) => s.status);
  const error = useTwinStore((s) => s.error);
  const playing = useTwinStore((s) => s.playing);
  const [openBox, setOpenBox] = useState(false);
  const [helpBox, setHelpBox] = useState(false);

  useEffect(() => installHotkeys({ onHelp: () => setHelpBox(true) }), []);

  // The position is read from the audio clock, not counted in React.
  useEffect(() => {
    if (!playing) return undefined;
    let frame = 0;
    const tick = () => {
      useTwinStore.setState({ position: engine.position(), playing: engine.playing });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  // One twin in the index opens on its own; more than one asks.
  useEffect(() => {
    loadTwinsIndex()
      .then((entries) => {
        useTwinStore.setState({ twins: entries, twinsError: null });
        if (entries.length === 1) openTwinFromIndex(entries[0].file);
        else if (entries.length > 1) setOpenBox(true);
      })
      .catch((problem) =>
        useTwinStore.setState({ twins: [], twinsError: String(problem.message ?? problem) }),
      );
  }, []);

  return (
    <div className="app">
      <Transport onOpen={() => setOpenBox(true)} onHelp={() => setHelpBox(true)} />
      {status === 'ready' ? (
        <>
          <SideHeaders />
          <PendingBar />
          <div className="work">
            <TwinView />
            <BandList />
          </div>
        </>
      ) : (
        <div className="placeholder">
          {status === 'loading' ? (
            <p>decoding both sides…</p>
          ) : status === 'error' ? (
            <p className="error">{error}</p>
          ) : (
            <p>
              Two renditions of one song, side by side. <button type="button" onClick={() => setOpenBox(true)}>Open a twin</button>
            </p>
          )}
        </div>
      )}
      <OpenBox open={openBox} onClose={() => setOpenBox(false)} />
      <HelpBox open={helpBox} onClose={() => setHelpBox(false)} />
      <TextDialog />
      <Toast />
    </div>
  );
}
