import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './components/App.jsx';
import { openTwinDoc } from './actions/open_twin.js';
import { engine } from './audio/engine.js';
import { useTwinStore } from './state/store.js';
import { mapTime } from './model/bands.js';
import './styles.css';

// The engine needs to map times across the two timelines, and the mapping
// lives in the layout. Reading it from the store keeps the engine free of
// anything but audio.
engine.mapper = (from, to, t) => mapTime(useTwinStore.getState().layout, from, to, t);
engine.onEnded = () => useTwinStore.setState({ playing: engine.playing });

// A handle for the console and for driving the app from a browser session.
if (import.meta.env.DEV) {
  window.__twin = useTwinStore;
  window.__engine = engine;
  window.__openTwinDoc = openTwinDoc;
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
