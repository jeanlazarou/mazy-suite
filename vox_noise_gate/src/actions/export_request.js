import { currentRecording } from "../Editor";
import { gateParams } from "../GateSettings";
import { baseName } from "../utils";

import { renderGate } from "../core/gate";
import { encodeWav } from "../core/wav";

import { exportRequest, oneIsOpen } from "./requests";
import { renderedRegions } from "./regions";

export const requestExport = async (get, set) => {
  if (await oneIsOpen(get)) return;
  if (!get(currentRecording)) return;

  set(exportRequest, true);
};

// The format a file is written back in when nothing else is asked for
export function sourceFormat(recording) {
  if (!recording?.wav) return "24";
  if (recording.float || recording.bitDepth > 24) return "32f";

  return recording.bitDepth <= 16 ? "16" : "24";
}

export const FORMATS = {
  16: { label: "16-bit", bitDepth: 16, float: false },
  24: { label: "24-bit", bitDepth: 24, float: false },
  "32f": { label: "32-bit float", bitDepth: 32, float: true },
};

export const exportFileName = (recording) => `${baseName(recording.name)} (gated).wav`;

function download(fileName, data) {
  const url = URL.createObjectURL(new Blob([data], { type: "audio/wav" }));
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = /\.wav$/i.test(fileName) ? fileName : `${fileName}.wav`;
  anchor.click();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// What is exported is what plays in "gated", the region being edited included
export const exportRecording = async (get, _set, { fileName, format }) => {
  const recording = get(currentRecording);

  if (!recording) return;

  const channels = renderGate(
    recording.channels,
    recording.sampleRate,
    get(renderedRegions),
    get(gateParams),
    "gated"
  );

  download(fileName, encodeWav(channels, recording.sampleRate, FORMATS[format]));
};
