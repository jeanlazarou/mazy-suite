import { currentTrack } from "./Editor";

import { editingLyrics } from "./Lyrics";

import { addRegion } from "./actions/add_region";
import { acceptRegionChange } from "./actions/accept_region";
import { dismissRegion } from "./actions/dismiss_region";
import { duplicateRegion } from "./actions/duplicate_region";
import { enlargeRegionOnTheLeft } from "./actions/enlarge_region_on_the_left";
import { enlargeRegionOnTheRight } from "./actions/enlarge_region_on_the_right";
import { gotoMemorizedPosition } from "./actions/goto_memorized_position";
import { memorizePosition } from "./actions/memorize_position";
import { moveRegionToTheLeft } from "./actions/move_region_to_the_left";
import { moveRegionToTheRight } from "./actions/move_region_to_the_right";
import { playPause } from "./actions/toggle_play";
import { requestCheck } from "./actions/check_request";
import { requestOpen } from "./actions/open_files_request";
import { requestProjectOpen } from "./actions/open_project_request";
import { requestSave } from "./actions/save_request";
import { selectRegion } from "./actions/select_region";
import { shiftRegion } from "./actions/shift_region";
import { shrinkRegionOnTheLeft } from "./actions/shrink_region_on_the_left";
import { shrinkRegionOnTheRight } from "./actions/shrink_region_on_the_right";
import { toggleMarkerLabels } from "./actions/toggle_markers";
import { dropRegion } from "./actions/drop_region";
import { movePlaybackPositionForward } from "./actions/move_playback_position_forward";
import { movePlaybackPositionBackward } from "./actions/move_playback_position_backward";
import { movePlaybackPositionHome } from "./actions/move_playback_position_home";

export const processHotkeys = async (e, get, set) => {
  const track = get(currentTrack);
  const editing = get(editingLyrics);

  if (e.key.toLowerCase() === "a") {
    if (editing) return;

    requestProjectOpen(get, set);

    e.preventDefault();
    return;
  }

  if (editing || !track) {
    if (e.ctrlKey) {
      const key = e.key.toLowerCase();

      if (key === "s") {
        e.preventDefault();
      } else if (key === "o") {
        e.preventDefault();
      } else if (key === "m") {
        e.preventDefault();
      } else if (key === "g") {
        e.preventDefault();
      } else if (key === "d") {
        e.preventDefault();
      } else if (key === "p") {
        e.preventDefault();
      } else if (key === "i") {
        e.preventDefault();
      }
    }
    return;
  }

  if (e.ctrlKey) {
    const key = e.key.toLowerCase();

    if (key === "s") {
      requestSave(get, set);
      e.preventDefault();
    } else if (key === "o") {
      requestOpen(get, set);
      e.preventDefault();
    } else if (key === "v") {
      requestCheck(get, set);
      e.preventDefault();
    } else if (key === "m") {
      memorizePosition(get, set);
      e.preventDefault();
    } else if (key === "g") {
      gotoMemorizedPosition(get, set);
      e.preventDefault();
    } else if (key === "d") {
      duplicateRegion(get);
      e.preventDefault();
    } else if (key === "p") {
      toggleMarkerLabels(get, set);
      e.preventDefault();
    } else if (key === "i") {
      dropRegion(get, set);
      e.preventDefault();
    }
  } else if (e.key === " ") {
    playPause(get);
    e.preventDefault();
  } else if (e.key === "s") {
    selectRegion(get, set);
  } else if (e.key === "S") {
    shiftRegion(get, set);
  } else if (e.key === "Escape") {
    dismissRegion(get, set);
  } else if (e.key === "Insert" || e.key === "i") {
    addRegion(get, set);
  } else if (e.key === "Enter") {
    acceptRegionChange(get, set);
  } else if (e.key === "Home") {
    movePlaybackPositionHome(get, set);
  } else if (e.key === "ArrowLeft") {
    if (e.shiftKey) {
      moveRegionToTheLeft(get, set);
    } else {
      movePlaybackPositionBackward(get, set);
    }
  } else if (e.key === "ArrowRight") {
    if (e.shiftKey) {
      moveRegionToTheRight(get, set);
    } else {
      movePlaybackPositionForward(get, set);
    }
  } else if (e.key === "ArrowDown") {
    if (e.shiftKey) {
      enlargeRegionOnTheLeft(get, set);
    } else {
      shrinkRegionOnTheRight(get, set);
    }
  } else if (e.key === "ArrowUp") {
    if (e.shiftKey) {
      shrinkRegionOnTheLeft(get, set);
    } else {
      enlargeRegionOnTheRight(get, set);
    }
  }
};
