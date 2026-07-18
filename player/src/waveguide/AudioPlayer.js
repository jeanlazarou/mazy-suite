/**
 * waveguide — AudioPlayer
 *
 * Lightweight <audio> wrapper with an event system.
 * No framework dependencies — designed to be extracted as a standalone library.
 *
 * API used by Sequencer:
 *   load(url, audioBuffer?)  → Promise<void>
 *   play()                   → Promise<void>
 *   pause()
 *   stop()
 *   skip(seconds)
 *   setVolume(gain 0–1)
 *   getCurrentTime()         → number
 *   getDuration()            → number
 *   on(event, handler)
 *   unAll()
 *   media                    → HTMLAudioElement
 *
 * Events emitted:
 *   timeupdate(currentTime)  — native audio timeupdate
 *   interaction()            — after any seek (native 'seeked')
 *   finish()                 — track ended naturally
 *   wavedata(Float32Array)   — amplitude peaks, emitted synchronously in load()
 */

const PEAKS = 1000;

function computePeaks(audioBuffer) {
  const nCh = audioBuffer.numberOfChannels;
  const len = audioBuffer.length;
  const block = Math.max(1, Math.floor(len / PEAKS));
  const peaks = new Float32Array(PEAKS);

  const channels = [];
  for (let c = 0; c < nCh; c++) channels.push(audioBuffer.getChannelData(c));

  for (let i = 0; i < PEAKS; i++) {
    const start = i * block;
    const end = Math.min(start + block, len);
    let max = 0;
    for (let j = start; j < end; j++) {
      for (let c = 0; c < nCh; c++) {
        const v = Math.abs(channels[c][j]);
        if (v > max) max = v;
      }
    }
    peaks[i] = max;
  }

  return peaks;
}

class AudioPlayer {
  constructor() {
    this._el = document.createElement("audio");
    this._el.preload = "auto";
    this._handlers = {};    // cleared by unAll()
    this._watched = {};     // persistent — NOT cleared by unAll()

    this._el.addEventListener("timeupdate", () => {
      this._emit("timeupdate", this._el.currentTime);
    });

    this._el.addEventListener("ended", () => {
      this._emit("finish");
    });

    // Any seek (user-initiated or programmatic) fires 'interaction' so
    // Sequencer can update position state immediately after a jump.
    this._el.addEventListener("seeked", () => {
      this._emit("interaction");
    });
  }

  /** The underlying HTMLAudioElement — used by Sequencer for its 'emptied' listener. */
  get media() {
    return this._el;
  }

  /**
   * Load a URL and prepare for playback.
   * If audioBuffer is provided, amplitude peaks are computed synchronously
   * and emitted via 'wavedata' before the Promise resolves.
   */
  load(url, audioBuffer) {
    if (audioBuffer) {
      this._emit("wavedata", computePeaks(audioBuffer));
    }

    return new Promise((resolve, reject) => {
      const cleanup = () => {
        this._el.removeEventListener("canplaythrough", onReady);
        this._el.removeEventListener("loadeddata", onReady);
        this._el.removeEventListener("error", onError);
        clearTimeout(tid);
      };

      const onReady = () => { cleanup(); resolve(); };
      const onError = (e) => {
        cleanup();
        reject(new Error(`Audio load error: ${e.message ?? e}`));
      };

      // 'canplaythrough' is preferred; 'loadeddata' covers browsers that are
      // slow to fire it for in-memory blob URLs.
      this._el.addEventListener("canplaythrough", onReady);
      this._el.addEventListener("loadeddata", onReady);
      this._el.addEventListener("error", onError);

      // Safety net — should never trigger for blob URLs
      const tid = setTimeout(onReady, 5000);

      this._el.src = url;
      this._el.load();
    });
  }

  play() {
    return this._el.play();
  }

  pause() {
    this._el.pause();
  }

  stop() {
    this._el.pause();
    if (!isNaN(this._el.duration)) {
      try { this._el.currentTime = 0; } catch { /* not seekable yet */ }
    }
  }

  skip(seconds) {
    const target = this._el.currentTime + seconds;
    const dur = this._el.duration;
    this._el.currentTime = isNaN(dur)
      ? Math.max(0, target)
      : Math.max(0, Math.min(dur, target));
  }

  setVolume(gain) {
    this._el.volume = Math.max(0, Math.min(1, gain));
  }

  getCurrentTime() {
    return this._el.currentTime || 0;
  }

  getDuration() {
    const d = this._el.duration;
    return isNaN(d) ? 0 : d;
  }

  /** Transient subscription — cleared by unAll() (used by Sequencer internally). */
  on(event, handler) {
    (this._handlers[event] ??= []).push(handler);
  }

  /**
   * Persistent subscription — survives unAll() (used by external consumers
   * like the Waveform component that need to stay subscribed across tracks).
   */
  watch(event, handler) {
    (this._watched[event] ??= []).push(handler);
  }

  unWatch(event, handler) {
    if (this._watched[event]) {
      this._watched[event] = this._watched[event].filter((h) => h !== handler);
    }
  }

  /** Clears only transient handlers — persistent watchers are preserved. */
  unAll() {
    this._handlers = {};
  }

  _emit(event, ...args) {
    (this._handlers[event] ?? []).forEach((h) => h(...args));
    (this._watched[event] ?? []).forEach((h) => h(...args));
  }
}

export { AudioPlayer, computePeaks };
