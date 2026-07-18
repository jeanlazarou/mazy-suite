import { useEffect } from 'react';
import { useMixStore, MASTER_ID } from './state/store';
import { togglePlay } from './actions/toggle_play';
import { toggleBypass } from './actions/toggle_bypass';
import { toggleSolo } from './actions/toggle_solo';
import { toggleMute } from './actions/toggle_mute';
import { seek } from './actions/seek';
import { applyFadePreset } from './actions/apply_fade_preset';
import { cycleRegionType } from './actions/cycle_region_type';
import { toggleRegionEnabled } from './actions/toggle_region_enabled';
import { deleteSelection } from './actions/delete_selection';
import { nudgeSelection } from './actions/nudge_selection';
import { clearSelection } from './actions/clear_selection';
import { toggleHelp } from './actions/toggle_help';
import { undo } from './actions/undo';
import { redo } from './actions/redo';
import { saveMix } from './actions/save_mix';
import { OPEN_FILES_INPUT_ID } from './components/Transport';

// S/M act on the hovered track, falling back to the selected region's track.
const targetTrackId = (s) => {
  const id = s.hoveredTrackId ?? s.selection?.laneId;
  return id && id !== MASTER_ID ? id : null;
};

export const processHotkeys = (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (e.altKey) return;

  if (e.ctrlKey || e.metaKey) {
    const k = e.key.toLowerCase();
    if (k === 'z') {
      e.preventDefault();
      e.shiftKey ? redo() : undo();
    } else if (k === 'y') {
      e.preventDefault();
      redo();
    } else if (k === 's') {
      e.preventDefault();
      saveMix();
    } else if (k === 'o') {
      e.preventDefault();
      document.getElementById(OPEN_FILES_INPUT_ID)?.click();
    }
    return;
  }

  const s = useMixStore.getState();

  if (e.code === 'Space') {
    e.preventDefault();
    togglePlay();
  } else if (e.key === 'b' || e.key === 'B') {
    toggleBypass();
  } else if (e.key === 's' || e.key === 'S') {
    const id = targetTrackId(s);
    if (id) toggleSolo(id);
  } else if (e.key === 'm' || e.key === 'M') {
    const id = targetTrackId(s);
    if (id) toggleMute(id);
  } else if (e.key === 'Home') {
    seek(0);
  } else if (e.key === '1' || e.key === '2' || e.key === '3') {
    applyFadePreset(e.key);
  } else if (e.key === 't' || e.key === 'T') {
    cycleRegionType();
  } else if (e.key === 'e' || e.key === 'E') {
    toggleRegionEnabled();
  } else if (e.key === 'Delete' || e.key === 'Backspace') {
    deleteSelection();
  } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    if (s.selection) {
      e.preventDefault();
      nudgeSelection(e.key === 'ArrowRight' ? 1 : -1, e.shiftKey);
    }
  } else if (e.key === '?') {
    toggleHelp();
  } else if (e.key === 'Escape') {
    clearSelection();
  }
};

export function useHotkeys() {
  useEffect(() => {
    window.addEventListener('keydown', processHotkeys);
    return () => window.removeEventListener('keydown', processHotkeys);
  }, []);
}
