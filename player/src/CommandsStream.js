import { Emitter } from "./emitter";

export const UNDO = "undo";
export const REDO = "redo";
export const SAVE = "save";

export const SHUFFLE = "shuffle";
export const REORDER = "reorder";

export const FILTER = "filter";

export const SHOW_PLAYLIST = "showPlaylist";
export const TOGGLE_VOLUMES = "toggleVolumes";
export const SHOW_DESCRIPTION = "showDescription";
export const SHOW_MOBILE_TRANSPORT = "showMobileTransport";

export const START_TOUR = "startTour";
export const STOP_TOUR = "stopTour";

export const PLAY = "play";
export const STOP = "stop";
export const NEXT = "next";
export const JUMP = "jump";
export const PAUSE = "pause";
export const PREVIOUS = "previous";

function CommandsStream() {
  this.undo = () => this.stream.next({ action: UNDO });
  this.redo = () => this.stream.next({ action: REDO });

  this.play = () => this.stream.next({ action: PLAY });
  this.stop = () => this.stream.next({ action: STOP });
  this.pause = () => this.stream.next({ action: PAUSE });
  this.playNext = () => this.stream.next({ action: NEXT });
  this.playPrevious = () => this.stream.next({ action: PREVIOUS });

  this.jump = (at) => this.stream.next({ action: JUMP, at });

  this.reorder = () => this.stream.next({ action: REORDER });
  this.shuffle = () => this.stream.next({ action: SHUFFLE });

  this.save = () => this.stream.next({ action: SAVE });
  this.filter = () => this.stream.next({ action: FILTER });
  this.startTour = () => this.stream.next({ action: START_TOUR });
  this.stopTour = () => this.stream.next({ action: STOP_TOUR });
  this.toggleVolumes = () => this.stream.next({ action: TOGGLE_VOLUMES });
  this.showDescription = () => this.stream.next({ action: SHOW_DESCRIPTION });

  this.showPlaylist = () => this.stream.next({ action: SHOW_PLAYLIST });
  this.showMobileTransport = () => this.stream.next({ action: SHOW_MOBILE_TRANSPORT });

  this.stream = new Emitter();
}

export const commands$ = new CommandsStream();
