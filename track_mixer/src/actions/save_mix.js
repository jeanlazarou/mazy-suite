import { useMixStore } from '../state/store';
import { serializeMix } from '../model/mixdoc';
import { putDataFile, songDir } from '../api';
import { downloadBlob } from '../utils';
import { showToast } from './show_toast';

// Ctrl+S: save the non-destructive mix document. Songs opened from the
// suite save mix.json next to their stems (via the suite bridge); ad hoc
// sessions download it instead.
export const saveMix = async () => {
  const { tracks, groups, master, song, markersSource } = useMixStore.getState();
  const doc = serializeMix({ tracks, groups, master, song, markersSource });
  const json = JSON.stringify(doc, null, 2) + '\n';
  if (song) {
    const ok = await putDataFile(`${songDir(song)}/mix.json`, json, 'application/json');
    if (ok) {
      showToast(`Saved ${songDir(song)}/mix.json`);
      return;
    }
    showToast('Suite bridge unavailable — downloading instead');
  }
  downloadBlob(new Blob([json], { type: 'application/json' }), 'mix.json');
};
