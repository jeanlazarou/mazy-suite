import { currentRecording } from "./Editor";

import { acceptRegionChange } from "./actions/accept_region";
import { addRegion } from "./actions/add_region";
import { deleteActiveRegion } from "./actions/delete_region";
import { dismissRegion } from "./actions/dismiss_region";
import { enlargeRegionOnTheLeft } from "./actions/enlarge_region_on_the_left";
import { enlargeRegionOnTheRight } from "./actions/enlarge_region_on_the_right";
import { requestExport } from "./actions/export_request";
import { gotoMemorizedPosition } from "./actions/goto_memorized_position";
import { memorizePosition } from "./actions/memorize_position";
import { movePlaybackPositionBackward } from "./actions/move_playback_position_backward";
import { movePlaybackPositionForward } from "./actions/move_playback_position_forward";
import { movePlaybackPositionHome } from "./actions/move_playback_position_home";
import { moveRegionEndToPosition } from "./actions/move_region_end_to_position";
import { moveRegionStartToPosition } from "./actions/move_region_start_to_position";
import { moveRegionToTheLeft } from "./actions/move_region_to_the_left";
import { moveRegionToTheRight } from "./actions/move_region_to_the_right";
import { requestFileOpen } from "./actions/open_file_request";
import { selectNextRegion, selectPreviousRegion } from "./actions/select_next_region";
import { shrinkRegionOnTheLeft } from "./actions/shrink_region_on_the_left";
import { shrinkRegionOnTheRight } from "./actions/shrink_region_on_the_right";
import { playPause } from "./actions/toggle_play";
import { toggleBypass, toggleRemoved } from "./actions/toggle_monitor";
import { toggleView } from "./actions/toggle_view";

const TEXT_INPUTS = ["text", "search", "url", "tel", "email", "password", "number"];

const NAVIGATION = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"];

// Keys pressed in a text field or a dialog are theirs, the arrows belong to a
// focused slider, and Space or Enter on a focused button press that button
const isForAControl = (e) => {
  const target = e.target;

  if (target.closest?.(".MuiDialog-root, .MuiPopover-root")) return true;
  if (target.tagName === "TEXTAREA" || target.isContentEditable) return true;

  if (target.tagName === "INPUT") {
    if (TEXT_INPUTS.includes(target.type)) return true;
    if (target.type === "range") return NAVIGATION.includes(e.key);
  }

  const role = target.getAttribute?.("role");

  if (role === "slider") return NAVIGATION.includes(e.key);

  const button = target.tagName === "BUTTON" || role === "button" || role === "combobox";

  return button && (e.key === " " || e.key === "Enter");
};

const CTRL_KEYS = {
  s: requestExport,
  m: memorizePosition,
  g: gotoMemorizedPosition,
};

const KEYS = {
  " ": playPause,
  b: toggleBypass,
  r: toggleRemoved,
  v: toggleView,
  n: selectNextRegion,
  p: selectPreviousRegion,
  i: addRegion,
  Insert: addRegion,
  Enter: acceptRegionChange,
  Escape: dismissRegion,
  Delete: deleteActiveRegion,
  Backspace: deleteActiveRegion,
  Home: movePlaybackPositionHome,
  End: moveRegionEndToPosition,
  e: moveRegionEndToPosition,
  s: moveRegionStartToPosition,
};

const ARROWS = {
  ArrowLeft: [movePlaybackPositionBackward, moveRegionToTheLeft],
  ArrowRight: [movePlaybackPositionForward, moveRegionToTheRight],
  ArrowDown: [shrinkRegionOnTheRight, enlargeRegionOnTheLeft],
  ArrowUp: [enlargeRegionOnTheRight, shrinkRegionOnTheLeft],
};

export const processHotkeys = async (e, get, set) => {
  if (isForAControl(e)) return;
  if (e.metaKey || e.altKey) return; // the browser's own shortcuts

  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;

  if (key === "a" && !e.ctrlKey) {
    e.preventDefault();
    requestFileOpen(get, set);
    return;
  }

  if (!get(currentRecording)) {
    if (e.ctrlKey && CTRL_KEYS[key]) e.preventDefault();
    return;
  }

  let action;

  if (e.ctrlKey) {
    action = CTRL_KEYS[key];
  } else if (ARROWS[key]) {
    action = ARROWS[key][e.shiftKey ? 1 : 0];
  } else {
    action = KEYS[key];
  }

  if (!action) return;

  e.preventDefault();
  action(get, set);
};
