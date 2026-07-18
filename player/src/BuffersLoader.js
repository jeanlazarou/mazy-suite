import { loader } from "./FileLoader";
import { audioDataStore } from "./AudioDataStore";

import { isAudioData } from "./utils";

class BuffersLoader {
  /*
   * callbacks receive load progress
   *   'onLoaded', audio file URL, duration
   *   'onError', audio file URL, message
   *   'onReady', web audio context, set of pairs of (url, audio buffer) (last call)
   *   'onRetry', audio file URL, attempt number, delay (optional)
   */
  constructor(context, urlList, callbacks) {
    this.context = context;
    this.urlList = urlList;
    this.buffers = {};
    this.loadCount = 0;

    this.loadedCallback = callbacks.onLoaded;
    this.errorCallback = callbacks.onError;
    this.readyCallback = callbacks.onReady;
    this.retryCallback = callbacks.onRetry;
  }

  loadMetadata = (audiCache) => {
    this.urlList.forEach((url) =>
      loader.loadMetadata(url, audiCache, this.metadataLoaded, this.notFound)
    );
  };

  load = () => {
    this.urlList.forEach((url) => this.loadBuffer(url));
  };

  loadBuffer = (url) => {
    const onRetry = this.retryCallback
      ? (url, attempt, delay) => this.retryCallback(url, attempt, delay)
      : null;

    loader.load(url, this.processData, this.notFound, onRetry);
  };

  notFound = (url) => {
    this.loadCount++;

    if (this.errorCallback) this.errorCallback(url, "'" + url + "' not found");

    this.notifyIfDone();
  };

  notifyIfDone = () => {
    if (this.loadCount === this.urlList.length) {
      if (this.readyCallback) this.readyCallback(this.buffers);
    }
  };

  metadataLoaded = (url, data) => {
    if (data instanceof ArrayBuffer) {
      this.processData(url, data);
      return;
    }

    this.loadCount++;

    this.dataLoaded(url, data);
  };

  processData = (url, data) => {
    this.loadCount++;

    const head = new Uint8Array(data, 0, 4);

    if (!isAudioData(head)) {
      if (this.errorCallback)
        this.errorCallback(url, `Failed to decode file data for ${url}.`);

      this.notifyIfDone();

      return;
    }

    // Asynchronously decode the audio file data in request.response
    this.context.decodeAudioData(
      data,
      (buffer) => {
        if (!buffer) {
          if (this.errorCallback)
            this.errorCallback(url, `Failed to decode file data for ${url}.`);

          this.notifyIfDone();

          return;
        }

        this.buffers[url] = { duration: buffer.duration };

        this.dataLoaded(url, buffer);
      },

      (error) => {
        if (this.errorCallback)
          this.errorCallback(url, "Failed to decode audio data.");
      }
    );
  };

  dataLoaded = (url, buffer) => {
    const update = async (duration) => {
      await audioDataStore.updateMetadata({ id: url, duration });
    };

    update(buffer.duration);

    if (this.loadedCallback) {
      this.loadedCallback(url, buffer.duration, buffer);
    }

    this.notifyIfDone();
  };
}

export { BuffersLoader };
