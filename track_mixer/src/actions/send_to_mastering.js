import { useMixStore } from '../state/store';
import { engine } from '../audio/engine';
import { putDataFile, songDir } from '../api';
import { downloadBlob } from '../utils';
import { showToast } from './show_toast';

// Render the mixdown and hand it to the sibling mix-mastering tool: for
// suite songs, write mixdown.wav next to the stems (mix-mastering's input:
// `master process mixdown.wav -o …` or drag into its web UI).
export const sendToMastering = async () => {
  const { song } = useMixStore.getState();
  const blob = await engine.exportWav();
  if (!blob) return;
  if (song) {
    const rel = `${songDir(song)}/mixdown.wav`;
    const ok = await putDataFile(rel, blob, 'audio/wav');
    if (ok) {
      showToast(`Rendered data/${rel} — run: master process "${song.title}/mixdown.wav"`);
      return;
    }
    showToast('Suite bridge unavailable — downloading instead');
  }
  downloadBlob(blob, 'mixdown.wav');
};
