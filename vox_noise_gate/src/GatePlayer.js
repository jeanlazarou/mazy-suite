import WebAudioPlayer from "wavesurfer.js/dist/webaudio.js";

// WaveSurfer's Web Audio player, fed with a buffer rendered here rather than
// one it fetches: what plays is exactly what the gate computes (gated,
// original or removed), and it is re-rendered in place when regions change.
export class GatePlayer extends WebAudioPlayer {
  setAudioBuffer(buffer) {
    this.pause();
    this.playedDuration = 0;
    this.buffer = buffer;
    this.emit("loadedmetadata");
    this.emit("canplay");
  }

  // the context is created before any click, so the browser keeps it
  // suspended until a user gesture asks to play
  async play() {
    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }

    return super.play();
  }

  // A playing source keeps the samples it started with: restart it where it
  // is to hear the new content
  refresh() {
    if (!this.paused) {
      this._pause();
      this._play();
    }
  }
}
