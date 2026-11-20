import { useCallback, useEffect, useState } from "react";
import { atom, useAtom, useAtomValue } from "jotai";
import { useAtomCallback } from "jotai/utils";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import LinearProgress from "@mui/material/LinearProgress";
import Typography from "@mui/material/Typography";
import DownloadIcon from "@mui/icons-material/Download";
import EqualizerIcon from "@mui/icons-material/Equalizer";
import GraphicEqIcon from "@mui/icons-material/GraphicEq";
import HearingIcon from "@mui/icons-material/Hearing";
import MicIcon from "@mui/icons-material/Mic";
import PauseCircleIcon from "@mui/icons-material/PauseCircle";
import PlayCircleIcon from "@mui/icons-material/PlayCircle";
import RemoveCircleOutlineIcon from "@mui/icons-material/RemoveCircleOutline";
import SaveIcon from "@mui/icons-material/Save";
import ShowChartIcon from "@mui/icons-material/ShowChart";
import UploadIcon from "@mui/icons-material/Upload";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VolumeUpIcon from "@mui/icons-material/VolumeUp";

import { Timer } from "./Timer";
import { JogDial } from "./vendor/JogDial";
import { usePosition } from "./vendor/usePosition";

import { GateSettings } from "./GateSettings";
import { HotkeysHelp } from "./HotkeysHelp";
import { LevelMeter } from "./LevelMeter";
import { ModeSpeedDial } from "./ModeSpeedDial";
import { PositionMemory } from "./PositionMemory";
import { ExportBox } from "./ExportBox";
import { ZoomInput } from "./ZoomInput";
import {
  Waveform,
  audioEngine,
  audioPosition,
  audioState,
  monitorMode,
  waveView,
} from "./Waveform";

import { processHotkeys } from "./HotkeysMapping";

import { exportRequest } from "./actions/requests";
import { requestExport } from "./actions/export_request";
import { RECORDING_INPUT, requestFileOpen } from "./actions/open_file_request";
import { loadRecording } from "./actions/load_recording";
import { toggleView } from "./actions/toggle_view";

import "./Editor.css";

// { name, sampleRate, channels: Float32Array[], duration, bitDepth, float,
//   wav, peaks }
export const currentRecording = atom(null);

// message shown while a recording is read or analysed
export const loadingState = atom(null);

function Header({ recording }) {
  return (
    <Typography component="span" className="song-title" sx={{ fontSize: "1.4em", color: "#2185d0" }}>
      {recording.name}
    </Typography>
  );
}

function CommandButton({ icon, label, onClick, selected = true }) {
  return (
    <Chip
      icon={icon}
      label={label}
      color="primary"
      variant={selected ? "filled" : "outlined"}
      onClick={onClick}
    />
  );
}

// A button or slider keeps the focus once clicked, and would take Space,
// Enter or the arrows for itself: the keyboard goes back to the hotkeys
function releaseClickedControl() {
  setTimeout(() => {
    const element = document.activeElement;

    if (!element || element === document.body) return;
    if (element.closest(".MuiDialog-root, .MuiPopover-root")) return;

    const role = element.getAttribute("role");

    if (element.tagName === "BUTTON" || role === "button" || element.type === "range") {
      element.blur();
    }
  });
}

const MONITORS = [
  { value: "gated", label: "Gated", icon: <GraphicEqIcon /> },
  { value: "original", label: "Original", icon: <MicIcon /> },
  { value: "removed", label: "Removed", icon: <RemoveCircleOutlineIcon /> },
];

function Commands() {
  const playing = useAtomValue(audioState);
  const engine = useAtomValue(audioEngine);
  const [monitor, setMonitor] = useAtom(monitorMode);
  const view = useAtomValue(waveView);

  const open = useAtomCallback(async (get, set) => requestFileOpen(get, set));
  const save = useAtomCallback(async (get, set) => requestExport(get, set));
  const switchView = useAtomCallback(async (get, set) => toggleView(get, set));

  return (
    <div className="commands">
      <Divider>
        <VolumeUpIcon fontSize="small" />
      </Divider>

      <CommandButton
        label={playing === "playing" ? "Pause" : "Play"}
        icon={playing === "playing" ? <PauseCircleIcon /> : <PlayCircleIcon />}
        onClick={() => engine.playPause()}
      />

      <Divider>
        <HearingIcon fontSize="small" />
      </Divider>

      {MONITORS.map((m) => (
        <CommandButton
          key={m.value}
          label={m.label}
          icon={m.icon}
          selected={monitor === m.value}
          onClick={() => setMonitor(m.value)}
        />
      ))}

      <Divider>
        <VisibilityIcon fontSize="small" />
      </Divider>

      <CommandButton
        label={view === "wave" ? "Level view" : "Wave view"}
        icon={view === "wave" ? <ShowChartIcon /> : <EqualizerIcon />}
        onClick={switchView}
      />

      <Divider>
        <SaveIcon fontSize="small" />
      </Divider>

      <CommandButton label="Open" icon={<UploadIcon />} onClick={open} />
      <CommandButton label="Export" icon={<DownloadIcon />} onClick={save} />
    </div>
  );
}

function Welcome() {
  const open = useAtomCallback(async (get, set) => requestFileOpen(get, set));

  return (
    <div className="welcome">
      <MicIcon sx={{ fontSize: 64, color: "#2185d0" }} />
      <Typography variant="h5">Vox Noise Gate</Typography>
      <Typography color="text.secondary">
        Drop a vocal recording here, or press <kbd>A</kbd>. The silences between the phrases
        are found and muted; check them, adjust them, and export a clean WAV.
      </Typography>
      <Button variant="contained" startIcon={<UploadIcon />} onClick={open}>
        Open a recording
      </Button>
      <Typography variant="caption" color="text.secondary">
        WAV files are kept sample for sample; MP3, FLAC and the like are decoded by the browser.
        Nothing leaves this computer.
      </Typography>
    </div>
  );
}

export function Editor() {
  const recording = useAtomValue(currentRecording);
  const loading = useAtomValue(loadingState);
  const [current, setPlaybackPosition] = useAtom(audioPosition);
  const [exporting, setExporting] = useAtom(exportRequest);
  const [rotation, setRotation] = useState(0);
  const [dragging, setDragging] = useState(false);

  const duration = recording ? recording.duration * 1000 : 0;
  const position = usePosition(current * 1000, rotation, duration);

  useEffect(() => {
    setPlaybackPosition(position / 1000);
  }, [position, setPlaybackPosition]);

  const handler = useAtomCallback(
    useCallback(async (get, set, e) => {
      processHotkeys(e, get, set);
    }, [])
  );

  useEffect(() => {
    window.addEventListener("keydown", handler, false);
    window.addEventListener("pointerup", releaseClickedControl);

    return () => {
      window.removeEventListener("keydown", handler);
      window.removeEventListener("pointerup", releaseClickedControl);
    };
  }, [handler]);

  const load = useAtomCallback(
    useCallback(async (get, set, file) => loadRecording(get, set, file), [])
  );

  useEffect(() => {
    const over = (e) => {
      if (![...(e.dataTransfer?.types ?? [])].includes("Files")) return;

      e.preventDefault();
      setDragging(true);
    };
    const leave = (e) => {
      if (!e.relatedTarget) setDragging(false);
    };
    const drop = (e) => {
      e.preventDefault();
      setDragging(false);

      const file = e.dataTransfer?.files?.[0];

      if (file) load(file);
    };

    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);

    return () => {
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, [load]);

  return (
    <>
      <input
        id={RECORDING_INPUT}
        type="file"
        accept="audio/*,.wav,.wave"
        style={{ display: "none" }}
        onChange={(e) => {
          load(e.target.files[0]);
          e.target.value = "";
        }}
      />

      {loading ? (
        <div className="loading">
          <LinearProgress />
          <Typography variant="body2">{loading}</Typography>
        </div>
      ) : null}

      {recording ? (
        <>
          <Header recording={recording} />

          <Divider />

          <Waveform />

          <div className="editor-content">
            <GateSettings />
            <div className="transport">
              <ZoomInput />
              <Timer />
              <LevelMeter />
              <JogDial key="dial" onChange={(_, rotation) => setRotation(rotation)} />
              <PositionMemory />
            </div>
            <Commands />
          </div>

          <HotkeysHelp />
          <ModeSpeedDial />
        </>
      ) : loading ? null : (
        <Welcome />
      )}

      {dragging ? <div className="drop-overlay">Drop the recording to open it</div> : null}

      <ExportBox open={exporting} onClose={() => setExporting(false)} />
    </>
  );
}
