import { atom, useAtom, useAtomValue, useSetAtom } from "jotai";
import { useAtomCallback } from "jotai/utils";
import { useCallback, useEffect } from "react";
import WaveSurfer from "wavesurfer.js";
import Regions from "wavesurfer.js/dist/plugins/regions.esm.js";

import { currentDuration, currentSong } from "./Lyrics";
import { AnomaliesIcon } from "./AnomaliesIcon";
import { RegionCard } from "./RegionCard";
import { zoomLevel } from "./ZoomInput";

import { toMarkers } from "./utils";
import { newRegionRange } from "./actions/change_region_range";
import { showRegionAtTime } from "./actions/show_region_at_time";
import { splitRegion } from "./actions/split_region";
import { deleteRegion } from "./actions/delete_region";

export const visibleMarkers = atom(false);

export const editorMode = atom("edit") /* edit, split, or delete */;

let waveSurfer = undefined;
let mediaElement = undefined; // Native HTMLAudioElement for timing (library-independent)
let timingRegion = undefined;
let regionsPlugin = undefined;
let originalRegionData = null; // Store original region data for cancel/restore

class AudioEngine {
  newRegionColor = "hsla(120,100%,50%,0.3)"; // Green for new/active regions
  regionColor = "hsla(120,100%,50%,0.3)"; // Green for active regions (same as new)
  savedRegionColor = "rgba(119, 119, 119, 0.3)"; // Gray for saved/unchanged regions
  changedRegionColor = "rgba(114, 34, 119, 0.3)"; // Violet for changed but unsaved regions

  constructor() {
    this.currentBlobUrl = null;
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }

  canUse = () => waveSurfer !== undefined;

  // Convert AudioBuffer to WAV Blob URL for in-memory playback
  _audioBufferToBlob = (audioBuffer) => {
    const numberOfChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const length = audioBuffer.length * numberOfChannels * 2;
    const buffer = new ArrayBuffer(44 + length);
    const view = new DataView(buffer);

    // WAV header
    const writeString = (offset, string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + length, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numberOfChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numberOfChannels * 2, true);
    view.setUint16(32, numberOfChannels * 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, length, true);

    // Interleave channels and convert to 16-bit PCM
    const channels = [];
    for (let i = 0; i < numberOfChannels; i++) {
      channels.push(audioBuffer.getChannelData(i));
    }

    let offset = 44;
    for (let i = 0; i < audioBuffer.length; i++) {
      for (let channel = 0; channel < numberOfChannels; channel++) {
        let sample = Math.max(-1, Math.min(1, channels[channel][i]));
        sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
        view.setInt16(offset, sample, true);
        offset += 2;
      }
    }

    const blob = new Blob([buffer], { type: 'audio/wav' });
    return URL.createObjectURL(blob);
  };

  open = async (track) => {
    if (!waveSurfer) return null;
    if (track.file) {
      try {
        const arrayBuffer = await track.file.arrayBuffer();
        const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
        const blobUrl = this._audioBufferToBlob(audioBuffer);
        if (this.currentBlobUrl) {
          URL.revokeObjectURL(this.currentBlobUrl);
        }
        this.currentBlobUrl = blobUrl;
        return waveSurfer.load(blobUrl);
      } catch (error) {
        console.error('Failed to decode audio file:', error);
        return waveSurfer.loadBlob(track.file);
      }
    }
    return null;
  };

  load = async (track) => {
    if (!waveSurfer) return null;
    if (track.url) {
      // Fetch, decode to AudioBuffer, and convert to WAV Blob for in-memory playback
      try {
        const response = await fetch(track.url);
        const arrayBuffer = await response.arrayBuffer();

        // Decode to AudioBuffer
        const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

        // Convert to WAV Blob URL
        const blobUrl = this._audioBufferToBlob(audioBuffer);

        // Cleanup previous blob
        if (this.currentBlobUrl) {
          URL.revokeObjectURL(this.currentBlobUrl);
        }
        this.currentBlobUrl = blobUrl;

        // Load from WAV Blob URL
        return waveSurfer.load(blobUrl);
      } catch (error) {
        console.error(`Failed to decode audio from ${track.url}:`, error);
        // Fallback to streaming if decode fails
        return waveSurfer.load(track.url);
      }
    }
    return null;
  };

  dispose = () => {
    if (this.currentBlobUrl) {
      URL.revokeObjectURL(this.currentBlobUrl);
      this.currentBlobUrl = null;
    }
  };

  playPause = () => (waveSurfer ? waveSurfer.playPause() : null);
  isPlaying = () => (mediaElement ? !mediaElement.paused : false);

  clearMarkers = () => {
    if (!regionsPlugin) return;

    // Clear all timing regions (but not the active region)
    const allRegions = regionsPlugin.getRegions();
    allRegions.forEach(region => {
      if (region.id?.startsWith('timing-')) {
        region.remove();
      }
    });
  };
  
  setMarkers = (markers) => {
    if (!regionsPlugin) return;

    this.clearMarkers();

    // markers are now full regions with start/end times and proper colors
    markers.forEach((marker, index) => {
      if (timingRegion &&
          Math.abs(timingRegion.start - marker.start) < 0.01 &&
          Math.abs(timingRegion.end - marker.end) < 0.01) {
        return;
      }

      regionsPlugin.addRegion({
        id: `timing-${index}`,
        start: marker.start,
        end: marker.end,
        content: marker.label || '',
        color: marker.color,
        drag: false,
        resize: false,
      });
    });
  };
  
  showMarker = (marker) => {
    if (!regionsPlugin) return;

    regionsPlugin.addRegion({
      id: `timing-single`,
      start: marker.start || marker.time,
      end: marker.end || (marker.time + 0.1),
      content: marker.label || '',
      color: marker.color || 'rgba(119, 119, 119, 0.3)',
      drag: false,
      resize: false
    });
  };
  
  updateRegionColor = (regionId, color) => {
    if (!regionsPlugin) return;
    
    const region = regionsPlugin.getRegions().find(r => r.id === regionId);
    if (region) {
      region.setOptions({ color });
    }
  };

  getRegion = () => {
    return timingRegion
      ? { start: timingRegion.start, end: timingRegion.end }
      : { start: 0, end: 0 };
  };
  
  deactivateRegion = () => {
    // Convert active region back to timing marker without reverting changes
    // Used when switching to a different region after accepting changes
    if (!timingRegion) return;

    // Remove the active region
    timingRegion.remove();

    // Clear the reference
    timingRegion = undefined;
    originalRegionData = null;

    // Note: setMarkers() will recreate this region as a timing marker
  };

  cancelRegion = () => {
    if (!timingRegion) return;

    // Remove the active region
    timingRegion.remove();

    // Also ensure any region with id 'active-region' is removed
    const activeRegion = regionsPlugin?.getRegions().find(r => r.id === 'active-region');
    if (activeRegion) {
      activeRegion.remove();
    }

    timingRegion = undefined;

    // If we were editing an existing region, restore it to original state
    if (originalRegionData) {
      regionsPlugin.addRegion({
        id: originalRegionData.id,
        start: originalRegionData.start,
        end: originalRegionData.end,
        content: originalRegionData.content,
        color: originalRegionData.color,
        drag: false,
        resize: false,
        loop: false
      });

      originalRegionData = null;
    }
  };
  
  newRegion = ({ start, end }) => {
    if (!regionsPlugin) return;

    // Caller should have already deactivated any existing active region
    // and refreshed markers before calling this

    // Create new active region with looping (no existing region to convert)
    timingRegion = regionsPlugin.addRegion({
      id: 'active-region',
      start: start,
      end: end,
      color: this.newRegionColor,
      drag: true,
      resize: true,
      loop: true
    });

    // No original data since this is a brand new region
    originalRegionData = null;

    return timingRegion;
  };
  
  showRegion = ({ start, end }) => {
    if (!regionsPlugin) return;

    // If already showing this exact region, just return it
    if (timingRegion &&
        Math.abs(timingRegion.start - start) < 0.1 &&
        Math.abs(timingRegion.end - end) < 0.1) {
      return timingRegion;
    }

    // Caller should have already deactivated any existing active region
    // and refreshed markers before calling this

    // Find the existing timing region at this position
    const existingRegion = regionsPlugin.getRegions().find(r =>
      r.id?.startsWith('timing-') &&
      Math.abs(r.start - start) < 0.1 &&
      Math.abs(r.end - end) < 0.1
    );

    if (existingRegion) {
      // Store original properties so we can revert on cancel
      originalRegionData = {
        id: existingRegion.id,
        start: existingRegion.start,
        end: existingRegion.end,
        content: existingRegion.content,
        color: existingRegion.color
      };

      // Remove the timing region and recreate as active
      // (WaveSurfer doesn't allow changing drag/resize/loop after creation)
      existingRegion.remove();

      // Create the active region at the same position
      timingRegion = regionsPlugin.addRegion({
        id: 'active-region',
        start: start,
        end: end,
        color: this.regionColor,
        drag: true,
        resize: true,
        loop: true
      });
    } else {
      // No existing region at this position, create a new one
      timingRegion = regionsPlugin.addRegion({
        id: 'active-region',
        start: start,
        end: end,
        color: this.regionColor,
        drag: true,
        resize: true,
        loop: true
      });

      originalRegionData = null; // No original to restore
    }

    return timingRegion;
  };
  
  acceptRegion = () => {
    if (!timingRegion) return;

    // Changes are now saved in timings, nothing to revert on cancel
    originalRegionData = null;
  };
  
  moveRegion = (seconds) => {
    if (timingRegion) {
      const duration = timingRegion.end - timingRegion.start;
      const newStart = timingRegion.start + seconds;
      timingRegion.setOptions({
        start: newStart,
        end: newStart + duration
      });
    }
  };
  
  resizeRegionOnTheLeft = (seconds) => {
    if (timingRegion) {
      timingRegion.setOptions({
        start: timingRegion.start + seconds
      });
    }
  };
  
  resizeRegionOnTheRight = (seconds) => {
    if (timingRegion) {
      timingRegion.setOptions({
        end: timingRegion.end + seconds
      });
    }
  };
  
  seekTo = (time) => {
    if (!mediaElement) return;

    mediaElement.currentTime = time;
  };
}

export const audioEngine = atom(new AudioEngine());

export const audioState = atom("stopped");

export const audioPosition = atom(0);

// Due to delay between region click event and current playback position (time) to be updated we must defer split operation
let pendingRegionToSplit = null;

export function Waveform({ track }) {
  const zoom = useAtomValue(zoomLevel);
  const song = useAtomValue(currentSong);
  const duration = useSetAtom(currentDuration);
  const engine = useAtomValue(audioEngine);
  const [playingState, changePlayingState] = useAtom(audioState);
  const [position, changePlaybackPosition] = useAtom(audioPosition);
  const labelsVisible = useAtomValue(visibleMarkers);

  const displayMarkers = useAtomCallback(
    useCallback(
      async (get) => {
        const currentValue = get(currentSong);
        const labels = get(visibleMarkers);

        engine.setMarkers(
          toMarkers(currentValue.timings, currentValue.savedTimings, labels)
        );
      },
      [engine]
    )
  );

  const applySplit = useAtomCallback(
    useCallback(async (get, set) => {
      if (pendingRegionToSplit) {
        const region = pendingRegionToSplit;

        pendingRegionToSplit = null;

        const clickTime = mediaElement ? mediaElement.currentTime : (region.start + region.end) / 2;

        await splitRegion(get, set, clickTime);
      }
    }, [])
  );

  const handleRegionClick = useAtomCallback(
    useCallback(async (get, set, region) => {
      const currentMode = get(editorMode);

      if (currentMode === 'split') {
        pendingRegionToSplit = region;
      } else if (currentMode === 'delete') {
        await deleteRegion(get, set, region.id);
      } else {
        await showRegionAtTime(get, set, region.start);
      }
    }, [])
  );

  const regionRangeChange = useAtomCallback(
    useCallback(async (get, set, start, end) => {
      newRegionRange(get, set, start, end);
    }, [])
  );

  useEffect(() => {
    const element = document.querySelector("#waveform");

    if (!element || !track) return;

    if (waveSurfer) return;

    // Initialize regions plugin
    regionsPlugin = Regions.create({});

    // Create our own audio element for library-independent timing
    mediaElement = new Audio();

    waveSurfer = WaveSurfer.create({
      container: "#waveform",
      height: 220,
      waveColor: "#e6e7d1de",
      progressColor: "#359fefde",
      plugins: [regionsPlugin],
      media: mediaElement,
    });

    waveSurfer.on("ready", function () {
      duration(Math.round(mediaElement.duration * 1000));

      displayMarkers();
    });

    waveSurfer.on("play", () => changePlayingState("playing"));
    waveSurfer.on("pause", () => changePlayingState("paused"));
    waveSurfer.on("finish", () => {
      changePlayingState("stopped");

      if (mediaElement.duration > 0) {
        if (mediaElement.currentTime >= mediaElement.duration - 0.1) {
          mediaElement.currentTime = 0;
          changePlaybackPosition(0);
        }
      }
    });

    regionsPlugin.on("region-clicked", (region) => {
      if (region.id?.startsWith('timing-')) {
        handleRegionClick(region);
      }
    });

    regionsPlugin.on("region-updated", (region) => {
      regionRangeChange(region.start, region.end);
    });
    
    waveSurfer.on("seeking", () => {
      if (pendingRegionToSplit) {
        applySplit();
      }
    });

    waveSurfer.on("timeupdate", () => {
      const currentTime = mediaElement.currentTime;
      changePlaybackPosition(currentTime);

      const activeRegion = regionsPlugin.getRegions().find(r => r.id === 'active-region');

      if (activeRegion && !mediaElement.paused) {
        if (currentTime > activeRegion.end) {
          mediaElement.currentTime = activeRegion.start;
        }
      }
    });

    // Cleanup on unmount
    return () => {
      engine.dispose();
    };
  });

  useEffect(() => {
    if (waveSurfer) {
      waveSurfer.setOptions({ minPxPerSec: zoom });
    }
  }, [zoom]);

  useEffect(() => {
    if (track) {
      if (track.file) {
        engine.open(track);
      } else if (track.url) {
        engine.load(track);
      }
    }
  }, [engine, track]);

  useEffect(() => {
    engine.clearMarkers();
  }, [engine, song.title]);

  useEffect(() => {
    // Debounce marker updates to prevent flickering during rapid state changes
    const timeoutId = setTimeout(() => {
      displayMarkers();
    }, 100);
    
    return () => clearTimeout(timeoutId);
  }, [labelsVisible, displayMarkers]);

  useEffect(() => {
    if (playingState !== "playing" && mediaElement) mediaElement.currentTime = position;
    // seek only when the position changes (jog dial); not on play/pause transitions
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position])

  return (
    <div id="waveform">
      <AnomaliesIcon />
      <RegionCard />
    </div>
  );
}
