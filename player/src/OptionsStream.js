import { ReplayEmitter } from "./emitter";

function OptionsStream() {
  this.playbackMode = (mode) => {
    this.stream.next({ loopMode: mode });
  };

  this.cardFormat = (format) => {
    this.stream.next({ cardFormat: format });
  };

  this.lyricsActive = (flag) => {
    this.stream.next({ lyricsActive: flag });
  };

  this.stream = new ReplayEmitter();
}

export const options$ = new OptionsStream();
