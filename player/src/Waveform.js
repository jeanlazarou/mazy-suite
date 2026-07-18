import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useAtom, useSetAtom } from "jotai";

import { commands$ } from "./CommandsStream";
import { requestedTrack } from "./atoms";
import { Sequencer, playingTrack, useSequencerReady } from "./Sequencer";

import { AudioPlayer } from "./waveguide/AudioPlayer";
import { WaveformCanvas } from "./waveguide/WaveformCanvas";

export function Waveform({ id, width = 400, height = 20 }) {
  const isReady = useSequencerReady();
  const [currentTrack, setTrack] = useAtom(playingTrack);
  const trackLoaded = useSetAtom(requestedTrack);

  // AudioPlayer lives for the lifetime of this component
  const player = useRef(null);
  if (!player.current) {
    player.current = new AudioPlayer();
  }

  const [peaks, setPeaks] = useState(null);
  const [progress, setProgress] = useState(0);
  const [waveWidth, setWaveWidth] = useState(0);

  // duration kept in a ref so onSeek never captures a stale value
  const durationRef = useRef(0);

  // Hand the AudioPlayer to Sequencer as its audio backend
  useEffect(() => {
    Sequencer.setAudioInstance(player.current);
  }, [isReady]);

  // Subscribe to waveform peaks via watch() — survives Sequencer's unAll() calls
  useEffect(() => {
    const p = player.current;
    p.watch("wavedata", setPeaks);
    return () => {
      p.unWatch("wavedata", setPeaks);
      commands$.stop();
    };
  }, []);

  // Measure container width after DOM commit (useLayoutEffect guarantees the
  // div is in the DOM, unlike reading it during the render phase)
  useLayoutEffect(() => {
    const container = document.querySelector(`#${id}`);
    if (!container) return;
    const rect = container.getBoundingClientRect();
    if (rect.width > 0) {
      setWaveWidth(rect.width);
      container.style.width = `${rect.width}px`;
    }
  }, [id]);

  // Update playingTrack Recoil atom and waveform cursor from sequencer events
  useLayoutEffect(() => {
    const onPlaying = ({ detail: { url, title } }) => {
      trackLoaded(null);
      setTrack({ url, title, position: 0 });
      setProgress(0);
    };

    const onPosition = ({ detail: { url, title, duration, position } }) => {
      durationRef.current = duration;
      const newPosition = Math.round(position);
      if (newPosition !== currentTrack.position) {
        setTrack({ url, title, position: newPosition });
      }
      setProgress(duration > 0 ? position / duration : 0);
    };

    document.addEventListener("sequencer:playing", onPlaying);
    document.addEventListener("sequencer:position", onPosition);

    return () => {
      document.removeEventListener("sequencer:playing", onPlaying);
      document.removeEventListener("sequencer:position", onPosition);
    };
  }, [currentTrack.position, setTrack, trackLoaded]);

  const onSeek = (p) => {
    // Fall back to AudioPlayer's live duration in case no position event has
    // fired yet (e.g. user seeks in the first second of a track)
    const duration = durationRef.current || player.current.getDuration();
    commands$.jump(p * duration);
  };

  return (
    <div id={id} style={{ width, height }}>
      <WaveformCanvas
        peaks={peaks}
        progress={progress}
        width={waveWidth}
        height={height}
        onSeek={onSeek}
      />
    </div>
  );
}
