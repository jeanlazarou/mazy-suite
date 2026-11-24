import { atom, useAtomValue, useSetAtom } from "jotai";
import { useAtomCallback } from "jotai/utils";
import { useCallback, useEffect } from "react";
import WaveSurfer from "wavesurfer.js";
import Regions from "wavesurfer.js/dist/plugins/regions.esm.js";

import { GatePlayer } from "./GatePlayer";
import { RegionCard } from "./RegionCard";
import { ThresholdLines } from "./ThresholdLines";
import { zoomLevel, zoomToPxPerSec } from "./ZoomInput";
import { currentRecording } from "./Editor";
import { gateEdits, gateParams, gateRegions, levelAnalysis } from "./GateSettings";

import { renderChannel } from "./core/gate";
import { activeRegion, renderedRegions, LOOP_CONTEXT } from "./actions/regions";
import { changeRegionRange } from "./actions/change_region_range";
import { clickRegion } from "./actions/click_region";
import { drawRegion } from "./actions/draw_region";

export const editorMode = atom("edit"); /* edit, split, or delete */

export const monitorMode = atom("gated"); /* gated, original, or removed */

export const waveView = atom("wave"); /* wave, or level */

export const WAVE_HEIGHT = 220;

const COLORS = {
  auto: "rgba(219, 40, 40, 0.22)", // red: muted by the gate
  manual: "rgba(114, 34, 119, 0.3)", // violet: muted by hand
  keep: "rgba(33, 133, 208, 0.15)", // blue: left alone by hand
  active: "hsla(120, 100%, 50%, 0.3)", // green: being edited
};

class AudioEngine {
  constructor() {
    this.player = new GatePlayer();
    this.waveSurfer = undefined;
    this.regionsPlugin = undefined;
    this.drawn = new Map(); // region id -> WaveSurfer region
    this.recording = undefined;
    this.buffer = undefined;
    this.peaks = undefined;
    this.stopDrawing = undefined;
  }

  canUse = () => this.waveSurfer !== undefined;

  attach = (container, handlers) => {
    if (this.waveSurfer) return;

    this.regionsPlugin = Regions.create();

    this.waveSurfer = WaveSurfer.create({
      container,
      height: WAVE_HEIGHT,
      waveColor: "#e6e7d1de",
      progressColor: "#359fefde",
      media: this.player,
      plugins: [this.regionsPlugin],
    });

    const ws = this.waveSurfer;

    ws.on("play", handlers.onPlay);
    ws.on("pause", handlers.onPause);
    ws.on("finish", handlers.onFinish);
    ws.on("timeupdate", handlers.onTimeUpdate);

    this.regionsPlugin.on("region-clicked", (region, event) => {
      handlers.onRegionClick(region.id, this.timeOfClick(region, event));
    });

    this.regionsPlugin.on("region-updated", (region) => {
      if (region.id === "active") handlers.onActiveChange(region.start, region.end);
    });

    this.regionsPlugin.on("region-created", (region) => {
      if (region.id !== "drawn") return;

      const { start, end } = region;

      region.remove();
      handlers.onDrawn(start, end);
    });
  };

  // time under the mouse, read from the region element itself: WaveSurfer
  // seeks on the same click, but only after the region event
  timeOfClick = (region, event) => {
    const rect = region.element?.getBoundingClientRect();

    if (!rect || rect.width === 0) return (region.start + region.end) / 2;

    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));

    return region.start + ratio * (region.end - region.start);
  };

  open = (recording, peaks) => {
    if (!this.waveSurfer) return;

    const { channels, sampleRate } = recording;
    const context = this.player.audioContext;

    this.recording = recording;
    this.buffer = context.createBuffer(channels.length, channels[0].length, sampleRate);

    channels.forEach((data, c) => this.buffer.copyToChannel(data, c));

    this.regionsPlugin.clearRegions();
    this.drawn.clear();

    this.player.setAudioBuffer(this.buffer);
    this.peaks = peaks;

    return this.waveSurfer.load("", [peaks], recording.duration);
  };

  // setOptions({ peaks }) would redraw the previous peaks: load the new ones,
  // which leaves the player and the regions alone
  showPeaks = (peaks) => {
    if (!this.waveSurfer || !this.recording || peaks === this.peaks) return;

    this.peaks = peaks;
    this.waveSurfer.load("", [peaks], this.recording.duration);
  };

  // What plays: the recording through the gate, as is, or what the gate
  // removes. regions: disjoint, see mergeForRender
  render = (regions, params, mode) => {
    if (!this.buffer || !this.recording) return;

    const { channels, sampleRate } = this.recording;

    channels.forEach((input, c) => {
      renderChannel(input, this.buffer.getChannelData(c), sampleRate, regions, params, mode);
    });

    this.player.refresh();
  };

  setDrawing = (enabled) => {
    if (!this.regionsPlugin) return;

    if (enabled && !this.stopDrawing) {
      this.stopDrawing = this.regionsPlugin.enableDragSelection({
        id: "drawn",
        color: COLORS.active,
      });
    } else if (!enabled && this.stopDrawing) {
      this.stopDrawing();
      this.stopDrawing = undefined;
    }
  };

  // regions: [{ id, start, end, origin }], keeps: [{ id, start, end }],
  // active: the region being edited, drawn in place of its own id
  drawRegions = (regions, keeps, active) => {
    if (!this.regionsPlugin) return;

    const wanted = new Map();

    for (const r of regions) {
      if (active && r.id === active.id) continue;

      wanted.set(r.id, { start: r.start, end: r.end, color: COLORS[r.origin], editable: false });
    }

    for (const k of keeps) {
      wanted.set(k.id, { start: k.start, end: k.end, color: COLORS.keep, editable: false, content: "keep" });
    }

    if (active) {
      wanted.set("active", { start: active.start, end: active.end, color: COLORS.active, editable: true });
    }

    for (const [id, region] of this.drawn) {
      if (!wanted.has(id)) {
        region.remove();
        this.drawn.delete(id);
      }
    }

    for (const [id, want] of wanted) {
      const region = this.drawn.get(id);

      if (!region) {
        this.drawn.set(
          id,
          this.regionsPlugin.addRegion({
            id,
            start: want.start,
            end: want.end,
            color: want.color,
            content: want.content,
            drag: want.editable,
            resize: want.editable,
          })
        );
      } else if (
        region.start !== want.start ||
        region.end !== want.end ||
        region.color !== want.color ||
        region.drag !== want.editable
      ) {
        region.setOptions({
          start: want.start,
          end: want.end,
          color: want.color,
          drag: want.editable,
          resize: want.editable,
        });
      }
    }
  };

  playPause = () => (this.waveSurfer ? this.waveSurfer.playPause() : null);
  isPlaying = () => !this.player.paused;
  getCurrentTime = () => this.player.currentTime;

  seekTo = (time) => {
    if (!this.waveSurfer) return;

    this.waveSurfer.setTime(Math.max(0, Math.min(this.waveSurfer.getDuration(), time)));
  };
}

export const audioEngine = atom(new AudioEngine());

export const audioState = atom("stopped");

export const audioPosition = atom(0);

export function Waveform() {
  const recording = useAtomValue(currentRecording);
  const analysis = useAtomValue(levelAnalysis);
  const zoom = useAtomValue(zoomLevel);
  const engine = useAtomValue(audioEngine);
  const view = useAtomValue(waveView);
  const mode = useAtomValue(editorMode);
  const monitor = useAtomValue(monitorMode);
  const regions = useAtomValue(gateRegions);
  const edits = useAtomValue(gateEdits);
  const active = useAtomValue(activeRegion);
  const rendered = useAtomValue(renderedRegions);
  const { fadeOut, fadeIn, floorDb } = useAtomValue(gateParams);
  const position = useAtomValue(audioPosition);
  const setPlayingState = useSetAtom(audioState);

  const onTimeUpdate = useAtomCallback(
    useCallback(
      (get, set, time) => {
        set(audioPosition, time);

        // the region being edited loops, with some audio either side of it
        const region = get(activeRegion);

        if (region && get(audioState) === "playing") {
          const engine = get(audioEngine);

          if (time > region.end + LOOP_CONTEXT) {
            engine.seekTo(Math.max(0, region.start - LOOP_CONTEXT));
          }
        }
      },
      []
    )
  );

  const onFinish = useAtomCallback(
    useCallback((get, set) => {
      set(audioState, "stopped");
      get(audioEngine).seekTo(0);
      set(audioPosition, 0);
    }, [])
  );

  const onRegionClick = useAtomCallback(
    useCallback((get, set, id, time) => clickRegion(get, set, id, time), [])
  );

  const onActiveChange = useAtomCallback(
    useCallback((get, set, start, end) => changeRegionRange(get, set, start, end), [])
  );

  const onDrawn = useAtomCallback(
    useCallback((get, set, start, end) => drawRegion(get, set, start, end), [])
  );

  useEffect(() => {
    const element = document.querySelector("#waveform");

    if (!element) return;

    engine.attach(element, {
      onPlay: () => setPlayingState("playing"),
      onPause: () => setPlayingState("paused"),
      onFinish,
      onTimeUpdate,
      onRegionClick,
      onActiveChange,
      onDrawn,
    });
  }, [engine, setPlayingState, onFinish, onTimeUpdate, onRegionClick, onActiveChange, onDrawn]);

  const peaks = view === "level" && analysis ? analysis.peaks : recording?.peaks;

  useEffect(() => {
    if (recording) engine.open(recording, recording.peaks);
  }, [engine, recording]);

  useEffect(() => {
    if (peaks) engine.showPeaks(peaks);
  }, [engine, peaks]);

  useEffect(() => {
    engine.setDrawing(mode === "edit");
  }, [engine, mode]);

  useEffect(() => {
    if (engine.canUse() && recording) {
      engine.waveSurfer.setOptions({ minPxPerSec: zoomToPxPerSec(zoom) });
    }
  }, [engine, recording, zoom]);

  useEffect(() => {
    engine.drawRegions(regions, edits.keeps, active);
  }, [engine, regions, edits.keeps, active]);

  useEffect(() => {
    // a handle dragged re-detects at every step: render once it rests
    const timeoutId = setTimeout(() => {
      engine.render(rendered, { fadeOut, fadeIn, floorDb }, monitor);
    }, 40);

    return () => clearTimeout(timeoutId);
  }, [engine, recording, rendered, fadeOut, fadeIn, floorDb, monitor]);

  useEffect(() => {
    // the jog dial moves the position while paused
    if (!engine.isPlaying() && Math.abs(engine.getCurrentTime() - position) > 1e-3) {
      engine.seekTo(position);
    }
  }, [engine, position]);

  return (
    <div id="waveform">
      {view === "level" ? <ThresholdLines /> : null}
      <RegionCard />
    </div>
  );
}
