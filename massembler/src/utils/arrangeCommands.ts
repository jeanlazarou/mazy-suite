import { useStore } from '../store';
import { shortcutLabel } from './keyboard';

/**
 * Editing commands on the selected clips, as the keyboard and the clip panel
 * run them: the store does the work, these say why when nothing happened.
 */

const store = () => useStore.getState();
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

function hasSelection(action: string): boolean {
  if (store().selectedTrackClips.length > 0) return true;
  store().showToast(`Select a clip to ${action} (click it; ${shortcutLabel('')}click adds more)`, 'info');
  return false;
}

/** Split the selected clips at the playhead (S). */
export function splitAtPlayhead() {
  if (!hasSelection('split')) return;
  const { split, repeating } = store().splitSelectedAt(store().playbackState.currentTime);
  if (split > 0) return;
  store().showToast(
    repeating > 0
      ? "A repeating clip can't be split: set its Repeat off first"
      : 'Move the playhead inside the selected clip to split it there',
    'info'
  );
}

/** Copy the selected clips (⌘C). False when nothing was selected. */
export function copySelection(): boolean {
  const copied = store().copySelected();
  if (copied > 0) {
    store().showToast(
      `Copied ${plural(copied, 'clip')} - ${shortcutLabel('V')} pastes at the playhead`,
      'info',
      2500
    );
  }
  return copied > 0;
}

/** Paste the copied clips at the playhead (⌘V). */
export function pasteAtPlayhead() {
  if (store().clipboard.length === 0) {
    store().showToast(`Nothing copied yet: select clips and press ${shortcutLabel('C')}`, 'info');
    return;
  }
  if (!store().pasteAt(store().playbackState.currentTime)) {
    store().showToast("Can't paste at the playhead: it would overlap another clip", 'warning');
  }
}

/** Place copies of the selected clips straight after them (⌘D). */
export function duplicateSelection() {
  if (!hasSelection('duplicate')) return;
  if (!store().duplicateSelected()) {
    store().showToast(
      "No room straight after the selection: a copy would overlap another clip. Alt-drag places one anywhere.",
      'warning'
    );
  }
}

/** Delete the selected clips (Delete). */
export function deleteSelection() {
  store().deleteSelected();
}
