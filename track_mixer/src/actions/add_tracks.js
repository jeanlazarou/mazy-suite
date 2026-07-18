import { useMixStore } from '../state/store';
import { engine } from '../audio/engine';
import { recordHistory } from '../state/history';
import { addTrack, TRACK_COLORS } from './add_track';
import { showToast } from './show_toast';

// "+ Track": append stems from local audio files to the current session
// (unlike Ctrl+O, which replaces it). Undoable.
export const addTracks = async (fileList) => {
  const files = [...fileList].filter((f) => !/\.json$/i.test(f.name));
  if (!files.length) return;
  const decoded = [];
  for (const file of files) {
    try {
      decoded.push({ file, buffer: await engine.decode(await file.arrayBuffer()) });
    } catch {
      showToast(`Could not decode ${file.name}`);
    }
  }
  if (!decoded.length) return;
  recordHistory();
  const base = useMixStore.getState().tracks.length;
  decoded.forEach(({ file, buffer }, i) => addTrack({
    name: file.name.replace(/\.\w+$/, ''),
    color: TRACK_COLORS[(base + i) % TRACK_COLORS.length],
    buffer,
    fileName: file.name,
  }));
  engine.modelChanged();
};
