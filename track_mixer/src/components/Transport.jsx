import { useEffect, useRef } from 'react';
import { useMixStore } from '../state/store';
import { engine } from '../audio/engine';
import { togglePlay } from '../actions/toggle_play';
import { toggleBypass } from '../actions/toggle_bypass';
import { exportWav } from '../actions/export_wav';
import { openFiles } from '../actions/open_files';
import { saveMix } from '../actions/save_mix';
import { createGroup } from '../actions/create_group';
import { addTracks } from '../actions/add_tracks';
import { sendToMastering } from '../actions/send_to_mastering';
import { toggleMarkers } from '../actions/toggle_markers';
import { togglePanMode } from '../actions/toggle_pan_mode';
import { zoomIn } from '../actions/zoom_in';
import { zoomOut } from '../actions/zoom_out';
import { zoomFit } from '../actions/zoom_fit';
import { toggleHelp } from '../actions/toggle_help';
import { fmtTenths } from '../utils';
import SuiteBox from './SuiteBox';

export const OPEN_FILES_INPUT_ID = 'open-files-input'; // Ctrl+O clicks it too

export default function Transport() {
  const playing = useMixStore((s) => s.playing);
  const bypass = useMixStore((s) => s.bypass);
  const hasMarkers = useMixStore((s) => s.markers.length > 0);
  const markersVisible = useMixStore((s) => s.markersVisible);
  const panMode = useMixStore((s) => s.panMode);
  const zoomed = useMixStore((s) => s.view.duration !== null);
  const toast = useMixStore((s) => s.toast);
  const timeRef = useRef(null);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => useMixStore.setState({ toast: null }), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  // The clock repaints outside React — no re-render per frame.
  useEffect(() => {
    let raf;
    const tick = () => {
      if (timeRef.current) {
        timeRef.current.textContent = `${fmtTenths(engine.getPosition())} / ${fmtTenths(engine.duration())}`;
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <header>
      <h1>Track Mixer</h1>
      <button onClick={togglePlay}>{playing ? '❚❚ Pause' : '▶ Play'}</button>
      <span id="time" ref={timeRef} />
      <button
        className={bypass ? 'on' : ''}
        title="Hear raw stems, mix bypassed (B)"
        onClick={toggleBypass}
      >A/B bypass</button>
      <button
        title="Open stems and/or mix.json (Ctrl+O)"
        onClick={() => document.getElementById(OPEN_FILES_INPUT_ID).click()}
      >Open…</button>
      <input
        id={OPEN_FILES_INPUT_ID}
        type="file"
        multiple
        accept="audio/*,.json,application/json"
        onChange={(e) => {
          if (e.target.files.length) openFiles(e.target.files);
          e.target.value = ''; // re-selecting the same files must fire again
        }}
      />
      <SuiteBox />
      <button title="Save mix document (Ctrl+S)" onClick={saveMix}>Save</button>
      <button onClick={exportWav}>Export WAV</button>
      <button
        title="Render the mixdown for the mix-mastering tool"
        onClick={sendToMastering}
      >Send to mastering</button>
      <button
        title="Add tracks from audio files (keeps the current session)"
        onClick={() => document.getElementById('add-tracks-input').click()}
      >+ Track</button>
      <input
        id="add-tracks-input"
        type="file"
        multiple
        accept="audio/*"
        onChange={(e) => {
          if (e.target.files.length) addTracks(e.target.files);
          e.target.value = '';
        }}
      />
      <button title="Add a VCA-style group lane" onClick={() => createGroup()}>+ Group</button>
      <button
        className={panMode ? 'on' : ''}
        title="Edit the pan line instead of the gain line (center = middle, top = right)"
        onClick={togglePanMode}
      >Pan</button>
      <span className="zoom">
        <button title="Zoom out (Ctrl+wheel)" onClick={zoomOut}>−</button>
        <button title="Zoom in (Ctrl+wheel)" onClick={zoomIn}>+</button>
        {zoomed && <button title="Fit whole song" onClick={zoomFit}>Fit</button>}
      </span>
      {hasMarkers && (
        <button
          className={markersVisible ? 'on' : ''}
          title="Show/hide SRT markers (hiding also disables snapping)"
          onClick={toggleMarkers}
        >Markers</button>
      )}
      {toast && <span className="toast">{toast}</span>}
      <button className="help-btn" title="Hotkeys & gestures (?)" onClick={toggleHelp}>?</button>
    </header>
  );
}
