import { atom, useAtomValue } from "jotai";
import { selectAtom, useAtomCallback } from "jotai/utils";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Tooltip from "@mui/material/Tooltip";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";

import { currentRecording } from "./Editor";
import { GateDiagram } from "./GateDiagram";
import { formatDuration } from "./utils";

import { DEFAULT_PARAMS, detectSilences } from "./core/gate";
import { NO_EDITS, combineRegions, hasEdits } from "./core/regions";

import { renderedRegions } from "./actions/regions";
import { changeParams } from "./actions/change_params";
import { autoThreshold } from "./actions/auto_threshold";
import { resetEdits } from "./actions/reset_edits";

const STORAGE_KEY = "vox_noise_gate.params";

// the same microphone in the same room keeps the same settings
function loadParams() {
  try {
    const { fade, ...saved } = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");

    // before v1.1, one fade for both ends
    const fades = fade === undefined ? {} : { fadeOut: fade, fadeIn: fade };

    return { ...DEFAULT_PARAMS, ...fades, ...saved };
  } catch {
    return { ...DEFAULT_PARAMS };
  }
}

const storedParams = atom(loadParams());

export const gateParams = atom(
  (get) => get(storedParams),
  (get, set, update) => {
    const params = { ...get(storedParams), ...update };

    set(storedParams, params);

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(params));
    } catch {
      // private window: the settings last until the page closes
    }
  }
);

// { levels, hopSeconds, lowCut, peaks, stats: { noiseFloor, voiceLevel, threshold } }
export const levelAnalysis = atom(null);

export const gateEdits = atom(NO_EDITS);

const detectionParams = selectAtom(
  gateParams,
  ({ threshold, minSilence, keepBefore, keepAfter }) => ({
    threshold,
    minSilence,
    keepBefore,
    keepAfter,
  }),
  (a, b) =>
    a.threshold === b.threshold &&
    a.minSilence === b.minSilence &&
    a.keepBefore === b.keepBefore &&
    a.keepAfter === b.keepAfter
);

export const detectedRegions = atom((get) => {
  const recording = get(currentRecording);
  const analysis = get(levelAnalysis);

  if (!recording || !analysis) return [];

  return detectSilences(analysis.levels, analysis.hopSeconds, recording.duration, get(detectionParams));
});

// [{ id, start, end, origin: "auto" | "manual" }]
export const gateRegions = atom((get) => combineRegions(get(detectedRegions), get(gateEdits)));

const LOW_CUTS = [
  { value: 0, label: "Off" },
  { value: 80, label: "80 Hz" },
  { value: 150, label: "150 Hz" },
  { value: 300, label: "300 Hz" },
];

// a select would get the focus back once its menu closes, and keep Space for
// itself
const releaseFocus = () => document.activeElement?.blur?.();

const MENU_PROPS = { disableRestoreFocus: true };

function Stats() {
  const recording = useAtomValue(currentRecording);
  const rendered = useAtomValue(renderedRegions);
  const regions = useAtomValue(gateRegions);
  const edits = useAtomValue(gateEdits);

  const reset = useAtomCallback(async (get, set) => {
    if (window.confirm("Forget every region edited by hand and keep zone?")) {
      resetEdits(get, set);
    }
  });

  if (!recording) return null;

  const silenced = rendered.reduce((total, r) => total + (r.end - r.start), 0);
  const percent = recording.duration ? Math.round((silenced / recording.duration) * 100) : 0;
  const edited = edits.manual.length + edits.keeps.length;

  return (
    <div className="gate-stats">
      <span>
        {regions.length} region{regions.length === 1 ? "" : "s"} · {formatDuration(silenced)} silenced ({percent}%)
      </span>
      {hasEdits(edits) ? (
        <span>
          {" · "}
          {edited} hand edit{edited === 1 ? "" : "s"}
          <Button size="small" color="inherit" onClick={reset} sx={{ ml: 1, minWidth: 0 }}>
            Reset
          </Button>
        </span>
      ) : null}
    </div>
  );
}

export function GateSettings() {
  const params = useAtomValue(gateParams);
  const analysis = useAtomValue(levelAnalysis);

  const change = useAtomCallback(async (get, set, update) => changeParams(get, set, update));
  const auto = useAtomCallback(async (get, set) => autoThreshold(get, set));

  return (
    <div className="gate-settings">
      <GateDiagram />

      <div className="gate-footer">
        <span className="gate-take">
          <Tooltip title="Set the threshold from the noise floor of this recording">
            <span>
              <IconButton size="small" onClick={auto} disabled={!analysis} aria-label="auto threshold">
                <AutoFixHighIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          {analysis
            ? `noise ${analysis.stats.noiseFloor.toFixed(0)} dB · voice ${analysis.stats.voiceLevel.toFixed(0)} dB`
            : null}
        </span>

        <span className="gate-low-cut">
          <Tooltip
            title="The gate does not listen to rumble (traffic, air conditioning, handling noise) below this frequency. The audio itself is not filtered."
            enterDelay={600}
          >
            <span className="setting-label">Ignore lows below</span>
          </Tooltip>
          <Select
            size="small"
            variant="standard"
            value={params.lowCut}
            onChange={(e) => change({ lowCut: e.target.value })}
            onClose={releaseFocus}
            MenuProps={MENU_PROPS}
          >
            {LOW_CUTS.map((f) => (
              <MenuItem key={f.value} value={f.value}>
                {f.label}
              </MenuItem>
            ))}
          </Select>
        </span>

        <Stats />
      </div>
    </div>
  );
}
