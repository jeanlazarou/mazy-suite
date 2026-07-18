import { useEffect } from "react";
import { atom, useAtom } from "jotai";

import { tracks$ } from "./TracksStream";
import { options$ } from "./OptionsStream";
import { commands$ } from "./CommandsStream";
import { EDITOR, NO_LOOP, LOOP_PLAYLIST, LOOP_TRACK } from "./Config";
import { JUMP, PLAY, PAUSE, STOP, NEXT, PREVIOUS } from "./CommandsStream";

import { BuffersLoader } from "./BuffersLoader";
import { retryWithBackoff } from "./RetryHelper";

const playerCommands$ = commands$.stream.filter(({ action }) =>
    [JUMP, PLAY, PAUSE, STOP, NEXT, PREVIOUS].includes(action),
);

export const playingTrack = atom({ url: null, position: 0 });

export const sequencerReady = atom(false);

export const playbackState = atom("idle");

export function useSequencerReady() {
  const [isReady, setReady] = useAtom(sequencerReady);

  useEffect(() => {
    const done = () => {
      setReady(true);
    };

    document.addEventListener("sequencer:ready", done);

    return () => {
      document.removeEventListener("sequencer:ready", done);
    };
  }, [setReady]);

  return isReady;
}

export function usePlaybackState() {
  const [state, setState] = useAtom(playbackState);

  useEffect(() => {
    const stopped = () => setState("idle");
    const paused = () => setState("paused");
    const playing = () => setState("playing");
    const restart = () => setState("playing");

    document.addEventListener("sequencer:paused", paused);
    document.addEventListener("sequencer:start", playing);
    document.addEventListener("sequencer:ended", stopped);
    document.addEventListener("sequencer:stopped", stopped);
    document.addEventListener("sequencer:continue", restart);

    return () => {
      document.removeEventListener("sequencer:paused", paused);
      document.removeEventListener("sequencer:start", playing);
      document.removeEventListener("sequencer:ended", stopped);
      document.removeEventListener("sequencer:stopped", stopped);
      document.removeEventListener("sequencer:continue", restart);
    };
  }, [setState]);

  return state;
}

const dummyAudio = {
  stop: () => {},
  skip: (_at) => {},
  on: () => {},
  unAll: () => {},
  load: () => Promise.resolve(),
  play: () => {},
  pause: () => {},
  setVolume: () => {},
  getCurrentTime: () => 0,
  getDuration: () => 0,
};

let singleton = null;

class Sequencer {
  static create(playlist, audioCache) {
    singleton = new Sequencer(playlist, audioCache);
  }

  static listUpdated(list) {
    if (singleton === null) return;

    singleton.playlist = list;
  }

  static select(track) {
    if (singleton === null) return;

    singleton.select(track);
  }

  static changeVolume(track) {
    if (singleton === null) return;

    singleton.changeVolume(track);
  }

  static setAudioInstance(instance) {
    if (singleton === null) return;

    singleton.audioInstance = instance;
  }

  static dispose() {
    if (singleton === null) return;

    const sequencer = singleton;

    singleton = null;

    sequencer.dispose();
  }

  constructor(playlist, audiCache) {
    this.playbackState = "idle";

    this.playlist = playlist;

    this.loopMode = NO_LOOP;

    this.current = null;
    this.cachedBuffer = {};
    this.currentBlobUrl = null;
    this.currentBlobTrack = null;
    this.nextBlobUrl = null;
    this.nextBlobTrack = null;

    this.loadAudioData(audiCache);

    this.audio = dummyAudio;

    this.subscriptionC = playerCommands$.subscribe(({ action, at }) => {
      // RxJS Subject fires synchronously — we are still in the user gesture
      // call stack here. Resume the AudioContext now (needed for decoding on
      // some browsers after a period of inactivity).
      if (this.context && this.context.state !== "running") {
        this.context.resume().catch(() => {});
      }

      switch (action) {
        case PLAY:
          this.play();
          break;
        case PAUSE:
          this.pause();
          break;
        case NEXT:
          this.next();
          break;
        case PREVIOUS:
          this.previous();
          break;
        case STOP:
          this.stop();
          this.triggerPlaying(null);
          break;
        case JUMP:
          this.jump(at);
          break;
        default:
      }
    });

    this.subscriptionOpt = options$.stream.subscribe(({ loopMode }) => {
      if (loopMode) this.loopMode = loopMode;
    });
  }

  dispose() {
    this.subscriptionC.unsubscribe();
    this.subscriptionOpt.unsubscribe();

    if (this.currentBlobUrl) {
      URL.revokeObjectURL(this.currentBlobUrl);
      this.currentBlobUrl = null;
      this.currentBlobTrack = null;
    }

    if (this.nextBlobUrl) {
      URL.revokeObjectURL(this.nextBlobUrl);
      this.nextBlobUrl = null;
      this.nextBlobTrack = null;
    }
  }

  set playlist(list) {
    this.list = list;
  }

  set audioInstance(instance) {
    this.audio = instance;
  }

  isPlaying = () => this.playbackState === "playing";
  isPaused = () => this.playbackState === "paused";

  jump = (at) => {
    // HTML range inputs always produce strings; coerce defensively.
    const atNum = parseFloat(at);
    if (isNaN(atNum)) return;

    const current = this.audio.getCurrentTime();

    this.audio.skip(atNum - current);
  };

  play = () => {
    if (this.isPlaying()) return;

    if (this.isPaused()) {
      this.audio.play();

      this.triggerContinue();

      return;
    }

    this.triggerStart();

    this.current = this._findNext(this.current);

    this._playCurrent();
  };

  pause = () => {
    if (this.isPaused()) return;

    if (!this.isPlaying()) return;

    this.playbackState = "paused";

    this.triggerPaused();

    this.audio.pause();
  };

  stop = () => {
    if (!this.audio) return;

    this.audio.stop();

    this.playbackState = "idle";

    this.triggerStopped();

    this.current = null;
  };

  next = () => {
    this.finder = this._findNext;

    this.current = this._findNext(this.current);

    this._playCurrent();
  };

  previous = () => {
    this.finder = this._findPrevious;

    this.current = this._findPrevious(this.current);

    this._playCurrent();
  };

  select = (track) => {
    if (track.url === this.current) return;

    this.audio.stop();

    this.finder = () => track.url;

    this.current = track.url;

    this._playCurrent();
  };

  loadAudioData = (audiCache) => {
    this.buffers = null;
    this.context = new AudioContext();

    const doneLoading = (buffers) => {
      this.buffers = buffers;

      this.triggerReady();
    };

    const files = this.list.map((track) => track.url);

    new BuffersLoader(this.context, files, {
      onLoaded: this.triggerLoaded,
      onError: this.triggerError,
      onReady: doneLoading,
    }).loadMetadata(audiCache);
  };

  triggerLoaded = (url, duration) => {
    var event = new CustomEvent("sequencer:loaded", {
      detail: { url, duration },
    });

    document.dispatchEvent(event);
  };

  triggerError = (url) => {
    var event = new CustomEvent("sequencer:load-error", {
      detail: { url },
    });

    document.dispatchEvent(event);
  };

  triggerRetrying = (url, attempt, delay) => {
    var event = new CustomEvent("sequencer:retrying", {
      detail: { url, attempt, delay },
    });

    document.dispatchEvent(event);
  };

  triggerRetryFailed = (url) => {
    var event = new CustomEvent("sequencer:retry-failed", {
      detail: { url },
    });

    document.dispatchEvent(event);
  };

  triggerReady = () => {
    var event = new CustomEvent("sequencer:ready");

    document.dispatchEvent(event);
  };

  triggerPlaying = (track) => {
    if (track && this.playbackState === "idle") {
      this.triggerStart();
    }

    var event = new CustomEvent("sequencer:playing", {
      detail: { url: track ? track.url : null },
    });

    document.dispatchEvent(event);
  };

  triggerStart = () => {
    this.playbackState = "playing";

    var event = new CustomEvent("sequencer:start");

    document.dispatchEvent(event);
  };

  triggerPaused = () => {
    var event = new CustomEvent("sequencer:paused");

    document.dispatchEvent(event);
  };

  triggerContinue = () => {
    this.playbackState = "playing";

    var event = new CustomEvent("sequencer:continue");

    document.dispatchEvent(event);
  };

  triggerStopped = () => {
    var event = new CustomEvent("sequencer:stopped");

    document.dispatchEvent(event);
  };

  triggerEnded = () => {
    var event = new CustomEvent("sequencer:ended");

    document.dispatchEvent(event);
  };

  triggerPosition = (url, title, position) => {
    const duration = this.audio.getDuration();

    var event = new CustomEvent("sequencer:position", {
      detail: { url, title, duration, position },
    });

    document.dispatchEvent(event);
  };

  changeVolume = (track) => {
    const fraction = track.volume / 100;

    // x² curve — simple linear does not sound as good.
    const gain = fraction * fraction;

    this.audio.setVolume(gain);
  };

  _findNext = (current) => {
    const from =
      current === null ? 0 : this.list.findIndex((e) => e.url === current) + 1;

    const i = this.list.slice(from).findIndex((e) => e.enabled && !e.error);

    return i < 0 ? null : this.list[from + i].url;
  };

  _findPrevious = (current) => {
    const reversed = [...this.list].reverse();

    const from =
      current === null ? 0 : reversed.findIndex((e) => e.url === current) + 1;

    const i = reversed
      .slice(from)
      .findIndex((e) => e.infoLoaded && e.enabled && !e.error);

    return i < 0 ? null : reversed[from + i].url;
  };

  _playCurrent = () => {
    if (this.current === null) {
      this._cancelCurrent();

      return;
    }

    const track = this.list.find((e) => e.url === this.current);

    this._loadAndPlay(track);
  };

  _loadAndPlay = (track) => {
    if (this.cachedBuffer[track.url]) {
      this._playBuffer(track, this.cachedBuffer[track.url]);
      this._preloadNext();

      return;
    }

    tracks$.select(track);

    new BuffersLoader(this.context, [track.url], {
      onLoaded: (_url, _duration, buffer) => {
        this._playBuffer(track, buffer);
        this._preloadNext();
      },
      onError: () => this._cancelCurrent(),
      onReady: () => {},
      onRetry: (url, attempt, delay) => {
        this.triggerRetrying(url, attempt, delay);
      },
    }).load();
  };

  _cancelCurrent = () => {
    this.audio.unAll();

    this.audio.stop();

    this.playbackState = "idle";

    this.triggerPlaying(null);
    this.triggerEnded();
  };

  _audioBufferToBlob = (audioBuffer) => {
    const numberOfChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const length = audioBuffer.length * numberOfChannels * 2; // 16-bit samples

    const buffer = new ArrayBuffer(44 + length);
    const view = new DataView(buffer);

    const writeString = (offset, string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    writeString(0, "RIFF");
    view.setUint32(4, 36 + length, true);
    writeString(8, "WAVE");
    writeString(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numberOfChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numberOfChannels * 2, true);
    view.setUint16(32, numberOfChannels * 2, true);
    view.setUint16(34, 16, true);
    writeString(36, "data");
    view.setUint32(40, length, true);

    const channels = [];
    for (let i = 0; i < numberOfChannels; i++) {
      channels.push(audioBuffer.getChannelData(i));
    }

    let offset = 44;
    for (let i = 0; i < audioBuffer.length; i++) {
      for (let channel = 0; channel < numberOfChannels; channel++) {
        let sample = Math.max(-1, Math.min(1, channels[channel][i]));
        sample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
        view.setInt16(offset, sample, true);
        offset += 2;
      }
    }

    const blob = new Blob([buffer], { type: "audio/wav" });
    return URL.createObjectURL(blob);
  };

  _playTrack = (track) => {
    this._playBuffer(track, this.buffers[track.url]);
  };

  _playBuffer = (track, buffer) => {
    this.audio.unAll();

    this.finder = this._findNext;

    let blobUrl;
    if (this.currentBlobTrack === track.url && this.currentBlobUrl) {
      // Same track (loop mode) — reuse existing blob URL
      blobUrl = this.currentBlobUrl;
    } else if (this.nextBlobTrack === track.url && this.nextBlobUrl) {
      // Pre-converted blob URL available from preload — no conversion needed
      if (this.currentBlobUrl) URL.revokeObjectURL(this.currentBlobUrl);
      blobUrl = this.nextBlobUrl;
      this.currentBlobUrl = blobUrl;
      this.currentBlobTrack = track.url;
      this.nextBlobUrl = null;
      this.nextBlobTrack = null;
    } else {
      blobUrl = this._audioBufferToBlob(buffer);
      if (this.currentBlobUrl) URL.revokeObjectURL(this.currentBlobUrl);
      this.currentBlobUrl = blobUrl;
      this.currentBlobTrack = track.url;
    }

    // Fire immediately so car display shows new track title without delay.
    this.triggerPlaying(track);

    // When WaveSurfer loads a new blob, the browser fires 'emptied' on its
    // internal <audio> element and synchronously resets Media Session metadata
    // to the page defaults (document.title). We intercept 'emptied' and
    // immediately re-set our metadata in the same event tick — before the
    // browser propagates the change to the OS / car display.
    if (this.audio.media) {
      const onEmptied = () => {
        this.audio.media.removeEventListener("emptied", onEmptied);
        this.triggerPlaying(track);
      };
      this.audio.media.addEventListener("emptied", onEmptied);
    }

    retryWithBackoff(() => this.audio.load(blobUrl, buffer), {
      maxRetries: 3,
      onRetry: (attempt, _error, delay) => {
        console.log(
          `Retrying WaveSurfer load for ${track.url} (attempt ${attempt}/3) after ${delay}ms`,
        );
        this.triggerRetrying(track.url, attempt, delay);
      },
    })
      .then(() => {
        if (this.current !== track.url) return;

        // Re-fire after load completes as a belt-and-suspenders measure.
        this.triggerPlaying(track);

        this.audio.setVolume(track.volume / 100);

        this.audio.on("timeupdate", (currentTime) => {
          this.triggerPosition(track.url, track.title, currentTime);
        });

        this.audio.on("interaction", () => {
          const actualTime = this.audio.getCurrentTime();
          this.triggerPosition(track.url, track.title, actualTime);
        });

        this.audio.on("finish", () => {
          if (this.current !== track.url) return;

          if (this.loopMode === EDITOR) {
            this.pause();
            return;
          }

          if (this.loopMode === LOOP_TRACK) {
            this.cachedBuffer[track.url] = buffer;

            this._playCurrent();

            return;
          }

          this.current = this.finder(this.current);

          if (this.current === null && this.loopMode === LOOP_PLAYLIST) {
            this.current = this.finder(null);
          }

          this._playCurrent();

          this.finder = this._findNext;
        });

        this.audio.play();
      })
      .catch((error) => {
        console.error(
          `Failed to load ${track.url} after all retries:`,
          error.message,
        );
        this.triggerRetryFailed(track.url);
        this._cancelCurrent();
      });
  };

  _preloadNext = () => {
    this.cachedBuffer = {};

    if (this.nextBlobUrl) {
      URL.revokeObjectURL(this.nextBlobUrl);
      this.nextBlobUrl = null;
      this.nextBlobTrack = null;
    }

    const nextURL = this._findNext(this.current);

    if (!nextURL) return;

    new BuffersLoader(this.context, [nextURL], {
      onLoaded: (url, _duration, buffer) => {
        this.cachedBuffer[url] = buffer;
        this.nextBlobUrl = this._audioBufferToBlob(buffer);
        this.nextBlobTrack = url;
      },
      onError: () => {},
      onReady: () => {},
    }).load();
  };
}

export { Sequencer };
