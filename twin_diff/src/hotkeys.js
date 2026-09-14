// The keys, in one place. Same spirit as player_editor: one hand on the
// keyboard, no menus.

import { togglePlay } from './actions/toggle_play.js';
import { setAudible } from './actions/set_audible.js';
import { swapAudible } from './actions/swap_audible.js';
import { seekHome } from './actions/seek.js';
import { stepBand } from './actions/select_band.js';
import { stepTwin } from './actions/step_twin.js';
import { zoomBy, resetZoom, toggleFollow } from './actions/set_zoom.js';
import { markOneSided, clearPending } from './actions/pair_range.js';
import { toggleLayoutMode, toggleMagnet } from './actions/set_view_mode.js';
import { cycleKind, dropSegment } from './actions/edit_segment.js';
import { openTextEditor } from './actions/edit_text.js';
import { mergeSelected } from './actions/merge_segments.js';
import { classifySelected } from './actions/classify_gap.js';
import { showToast } from './actions/show_toast.js';
import { useTwinStore } from './state/store.js';
import { seedFromLyrics } from './actions/seed_from_lyrics.js';
import { toggleLyrics } from './actions/load_lyrics.js';
import { saveTwin } from './actions/save_twin.js';
import { downloadTwin } from './actions/download_twin.js';
import { undo, redo } from './state/history.js';

export const HOTKEYS = [
  ['Space', 'play / pause'],
  ['1 / 2 / 3', 'hear A / hear B / both'],
  ['Tab', 'swap the audible side, keeping the position'],
  ['drag', 'take a stretch of one side; drag the matching stretch on the other to pair them'],
  ['Shift+click', 'take a stretch in one click: back to the region above (Alt: forward)'],
  ['m', 'magnet — edges stick to boundaries, the playhead and quiet moments'],
  ['t', 'true scale ↔ aligned'],
  ['a or r', 'no match: the waiting stretch, or the selected one-sided gap — added (B) / removed (A)'],
  ['s', 'the selected gap (music on both sides) is the same'],
  ['c', 'the selected gap is changed · on a segment, same ↔ changed'],
  ['j', 'join the selected segment with a touching one of the same kind'],
  ['g', 'seed segments from the two lyric tracks, around what is already marked'],
  ['y', 'show / hide the lyrics'],
  ['n / l', 'note / label on the selected segment'],
  ['Delete', 'drop the selected segment back to a gap'],
  ['Esc', 'forget the pending stretch'],
  ['↓ / ↑', 'next / previous band'],
  ['→ / ←', 'next / previous twin of the set'],
  ['Home', 'back to the start'],
  ['+ / − / 0', 'zoom in / out / reset'],
  ['f', 'follow the playhead'],
  ['Ctrl+S', 'save the twin document (in this browser, on a site that cannot write files)'],
  ['Ctrl+Shift+S', 'download the twin document as a file'],
  ['Ctrl+Z / Ctrl+Y', 'undo / redo'],
  ['?', 'this list'],
];

// Letters are matched on the character typed, so they follow the keyboard
// layout. The digit keys are matched on the physical key instead: on an AZERTY
// keyboard the unshifted top row types & é " à, and "hear A" must not need
// Shift.
function keyOf(event) {
  const digit = /^Digit([0-3])$/.exec(event.code ?? '');
  return digit ? digit[1] : event.key;
}

export function installHotkeys({ onHelp }) {
  const handler = (event) => {
    const tag = event.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || event.target?.isContentEditable) return;
    // A modal dialog owns the keyboard: Space must not start playback behind
    // it, nor Delete drop a segment.
    if (document.querySelector('dialog[open]')) return;

    if (event.metaKey || event.ctrlKey) {
      switch (event.key.toLowerCase()) {
        case 's':
          event.preventDefault();
          if (event.shiftKey) downloadTwin();
          else saveTwin();
          break;
        case 'z':
          event.preventDefault();
          if (event.shiftKey) redo();
          else undo();
          break;
        case 'y':
          event.preventDefault();
          redo();
          break;
        default:
          break;
      }
      return;
    }
    if (event.altKey) return;

    switch (keyOf(event)) {
      case ' ':
        event.preventDefault();
        togglePlay();
        break;
      case '1':
        setAudible('a');
        break;
      case '2':
        setAudible('b');
        break;
      case '3':
        setAudible('both');
        break;
      case 'Tab':
        event.preventDefault();
        swapAudible();
        break;
      // a / r: a waiting stretch has no match — or, with none waiting, the
      // selected one-sided gap is what that side has alone
      case 'a':
      case 'r':
        if (useTwinStore.getState().pending) markOneSided();
        else if (!classifySelected('one-sided')) markOneSided();
        break;
      // c: a selected gap becomes `changed`; a selected segment flips same ↔ changed
      case 'c':
        if (!classifySelected('changed')) cycleKind();
        break;
      case 's':
        if (!classifySelected('same')) showToast('select an unclassified gap first, then s marks it same');
        break;
      case 'j':
        mergeSelected();
        break;
      case 'g':
        seedFromLyrics();
        break;
      case 'y':
        toggleLyrics();
        break;
      case 'n':
        // preventDefault: the n must not arrive in the input the dialog focuses
        event.preventDefault();
        openTextEditor('note');
        break;
      case 'l':
        event.preventDefault();
        openTextEditor('label');
        break;
      case 'Delete':
      case 'Backspace':
        event.preventDefault();
        dropSegment();
        break;
      case 'Escape':
        clearPending();
        break;
      case 'ArrowDown':
        event.preventDefault();
        stepBand(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        stepBand(-1);
        break;
      case 'ArrowRight':
        event.preventDefault();
        stepTwin(1);
        break;
      case 'ArrowLeft':
        event.preventDefault();
        stepTwin(-1);
        break;
      case 'Home':
        seekHome();
        break;
      case '+':
      case '=':
        zoomBy(1.4);
        break;
      case '-':
        zoomBy(1 / 1.4);
        break;
      case '0':
        resetZoom();
        break;
      case 'f':
        toggleFollow();
        break;
      case 'm':
        toggleMagnet();
        break;
      case 't':
        toggleLayoutMode();
        break;
      case '?':
        onHelp();
        break;
      default:
        break;
    }
  };

  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}
