import { useCallback, useEffect, useState } from "react";
import { atom, useAtom, useAtomValue } from "jotai";
import { useAtomCallback } from "jotai/utils";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Typography from "@mui/material/Typography";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import DownloadIcon from "@mui/icons-material/Download";
import EventAvailableIcon from "@mui/icons-material/EventAvailable";
import LocalOfferIcon from "@mui/icons-material/LocalOffer";
import PauseCircleIcon from "@mui/icons-material/PauseCircle";
import PlayCircleIcon from "@mui/icons-material/PlayCircle";
import SaveIcon from "@mui/icons-material/Save";
import TimerIcon from "@mui/icons-material/Timer";
import UploadIcon from "@mui/icons-material/Upload";
import VolumeUpIcon from "@mui/icons-material/VolumeUp";

import { Timer } from "./Timer";
import { JogDial } from "./vendor/JogDial";
import { usePosition } from "./vendor/usePosition";
import { currentDuration, Lyrics } from "./Lyrics";

import { HotkeysHelp } from "./HotkeysHelp";
import { audioPosition, visibleMarkers } from "./Waveform";
import { Waveform, audioEngine, audioState } from "./Waveform";

import { processHotkeys } from "./HotkeysMapping";

import {
  openRequest,
  saveRequest,
  checkTimings,
  projectOpenRequest,
} from "./actions/requests";

import { OpenBox } from "./OpenBox";
import { SaveBox } from "./SaveBox";
import { ZoomInput } from "./ZoomInput";
import { TimingsCheck } from "./TimingsCheck";
import { PositionMemory } from "./PositionMemory";

import "./Editor.css";

import { requestSave } from "./actions/save_request";
import { requestCheck } from "./actions/check_request";
import { requestOpen } from "./actions/open_files_request";
import { toggleMarkerLabels } from "./actions/toggle_markers";
import { OpenProjectBox } from "./OpenProjectBox";
import { RegionMemory } from "./RegionMemory";
import { ModeSpeedDial } from "./ModeSpeedDial";

export const currentTrack = atom(null);

function Header({ track }) {
  return (
    <Typography
      component="span"
      className="song-title"
      sx={{ fontSize: "1.4em", color: "#2185d0" }}
    >
      {track.title}
    </Typography>
  );
}

function Button({ icon, label, onClick }) {
  return (
    <Chip icon={icon} label={label} color="primary" onClick={onClick} />
  );
}

function Commands() {
  const playing = useAtomValue(audioState);
  const engine = useAtomValue(audioEngine);
  const markersVisible = useAtomValue(visibleMarkers);

  const check = useAtomCallback(async (get, set) =>
    requestCheck(get, set)
  );
  const open = useAtomCallback(async (get, set) =>
    requestOpen(get, set)
  );
  const save = useAtomCallback(async (get, set) =>
    requestSave(get, set)
  );
  const toggleMarkers = useAtomCallback(async (get, set) =>
    toggleMarkerLabels(get, set)
  );

  return (
    <div className="commands">
      <Divider>
        <VolumeUpIcon fontSize="small" />
      </Divider>

      <Button
        label={playing === "playing" ? "Pause" : "Play"}
        icon={playing === "playing" ? <PauseCircleIcon /> : <PlayCircleIcon />}
        onClick={() => engine.playPause()}
      />

      <Divider>
        <EventAvailableIcon fontSize="small" />
      </Divider>

      <Button label="Timings" icon={<TimerIcon />} onClick={check} />

      <Button
        label={markersVisible ? "Hide Markers" : "Show Markers"}
        icon={<LocalOfferIcon />}
        onClick={toggleMarkers}
      />

      <Divider>
        <SaveIcon fontSize="small" />
      </Divider>

      <Button label="Open" icon={<UploadIcon />} onClick={open} />
      <Button label="Save" icon={<DownloadIcon />} onClick={save} />
    </div>
  );
}

export function Editor({ track: selectedTrack, onSidebarToggle, sideVisible }) {
  const [track, setTrack] = useState();
  const [current, setPlaybackPosition] = useAtom(audioPosition);
  const [rotation, setRotation] = useState(0);
  const [showHandle, setShowHandle] = useState(0);
  const [saving, setSaving] = useAtom(saveRequest);
  const [checking, setChecking] = useAtom(checkTimings);
  const [loadFile, setLoadFile] = useAtom(openRequest);
  const [loadProject, setLoadProject] = useAtom(projectOpenRequest);
  const duration = useAtomValue(currentDuration);

  const position = usePosition(current * 1000, rotation, duration);

  useEffect(() => {
    setTrack(selectedTrack);
  }, [selectedTrack]);

  useEffect(() => {
    setPlaybackPosition(position / 1000);
  }, [position, setPlaybackPosition]);

  useEffect(() => {
    if (sideVisible) {
      setShowHandle(false);
      return;
    }

    const handler = (ev) => {
      setShowHandle(ev.clientX < 30);
    };

    document.documentElement.addEventListener("mousemove", handler);

    return () =>
      document.documentElement.removeEventListener("mousemove", handler);
  }, [sideVisible]);

  const handler = useAtomCallback(
    useCallback(async (get, set, e) => {
      processHotkeys(e, get, set);
    }, [])
  );

  useEffect(() => {
    window.addEventListener("keydown", handler, false);

    return () => window.removeEventListener("keydown", handler);
  }, [handler]);

  return (
    <>
      <div
        className={`sidebar-handle ${sideVisible || showHandle ? "" : "hide"}`}
        onClick={() => onSidebarToggle()}
      >
        {sideVisible ? (
          <ChevronLeftIcon fontSize="large" />
        ) : (
          <ChevronRightIcon fontSize="large" />
        )}
      </div>

      {track ? (
        <>
          <Header track={track} />

          <Divider />

          <Waveform track={track} />

          <div className="editor-content">
            <Lyrics track={track} />
            <div className="transport">
              <ZoomInput />
              <Timer />
              <JogDial
                key="dial"
                onChange={(_, rotation) => setRotation(rotation)}
              />
              <PositionMemory />
            </div>
            <Commands />
          </div>

          <HotkeysHelp />
          <RegionMemory />
          <ModeSpeedDial />
        </>
      ) : null}

      <OpenProjectBox
        open={loadProject}
        onClose={(track) => {
          if (track) setTrack(track);

          setLoadProject(false);
        }}
      />

      <SaveBox open={track && saving} onClose={() => setSaving(false)} />
      <OpenBox open={track && loadFile} onClose={() => setLoadFile(false)} />
      <TimingsCheck
        open={track && checking}
        onClose={() => setChecking(false)}
      />
    </>
  );
}
