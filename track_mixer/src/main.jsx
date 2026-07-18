import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './components/App';
import { useMixStore } from './state/store';
import { engine } from './audio/engine';
import './styles.css';

if (import.meta.env.DEV) { // for browser-driven tests
  window.__mixStore = useMixStore;
  window.__engine = engine;
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
