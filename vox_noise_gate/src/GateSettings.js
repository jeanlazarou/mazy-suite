import { atom, useAtomValue } from "jotai";
import { selectAtom, useAtomCallback } from "jotai/utils";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Slider from "@mui/material/Slider";
import Tooltip from "@mui/material/Tooltip";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";

import { currentRecording } from "./Editor";
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
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");

    return { ...DEFAULT_PARAMS, ...saved };
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

const SLIDERS = [
  {
    key: "threshold",
    label: "Threshold",
    help: "Quieter than this is silence. The level view (V) shows it against the recording.",
    min: -90,
    max: -10,
    step: 0.5,
    unit: "dB",
  },
  {
    key: "minSilence",
    label: "Min silence",
    help: "Shorter silences, like the gaps between words, are left as they are.",
    min: 50,
    max: 2000,
    step: 10,
    unit: "ms",
  },
  {
    key: "keepBefore",
    label: "Keep before voice",
    help: "Audio kept before the voice comes back, for breaths and soft consonants.",
    min: 0,
    max: 500,
    step: 5,
    unit: "ms",
  },
  {
    key: "keepAfter",
    label: "Keep after voice",
    help: "Audio kept after the voice stops, for word endings and room tails.",
    min: 0,
    max: 1000,
    step: 10,
    unit: "ms",
  },
  {
    key: "fade",
    label: "Fades",
    help: "Length of the fade at each end of a silenced region. The fades happen inside the region.",
    min: 0,
    max: 200,
    step: 1,
    unit: "ms",
  },
];

const FLOORS = [
  { value: "silence", label: "Silence" },
  { value: -40, label: "-40 dB" },
  { value: -30, label: "-30 dB" },
  { value: -20, label: "-20 dB" },
  { value: -12, label: "-12 dB" },
];

const LOW_CUTS = [
  { value: 0, label: "Off" },
  { value: 80, label: "80 Hz" },
  { value: 150, label: "150 Hz" },
  { value: 300, label: "300 Hz" },
];

const formatValue = (value, unit) =>
  unit === "dB" ? `${value.toFixed(1)} dB` : `${value} ms`;

// a select would get the focus back once its menu closes, and keep Space for
// itself
const releaseFocus = () => document.activeElement?.blur?.();

const MENU_PROPS = { disableRestoreFocus: true };

function Setting({ label, help, children, value }) {
  return (
    <div className="setting">
      <Tooltip title={help} placement="top-start" enterDelay={600}>
        <span className="setting-label">{label}</span>
      </Tooltip>
      <div className="setting-control">{children}</div>
      <span className="setting-value">{value}</span>
    </div>
  );
}

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
      {SLIDERS.map(({ key, label, help, min, max, step, unit }) => (
        <Setting key={key} label={label} help={help} value={formatValue(params[key], unit)}>
          <Slider
            size="small"
            min={min}
            max={max}
            step={step}
            value={params[key]}
            onChange={(_, value) => change({ [key]: value })}
            aria-label={label}
          />
          {key === "threshold" ? (
            <Tooltip title="Set it from the noise floor of this recording">
              <span>
                <IconButton size="small" onClick={auto} disabled={!analysis} aria-label="auto threshold">
                  <AutoFixHighIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          ) : null}
        </Setting>
      ))}

      {analysis ? (
        <div className="noise-floor">
          noise floor {analysis.stats.noiseFloor.toFixed(0)} dB · voice {analysis.stats.voiceLevel.toFixed(0)} dB
        </div>
      ) : null}

      <Setting label="Reduce to" help="Level of the silenced regions: true silence, or the noise turned down only." value="">
        <Select
          size="small"
          variant="standard"
          value={params.floorDb === null ? "silence" : params.floorDb}
          onChange={(e) => change({ floorDb: e.target.value === "silence" ? null : e.target.value })}
          onClose={releaseFocus}
          MenuProps={MENU_PROPS}
        >
          {FLOORS.map((f) => (
            <MenuItem key={f.value} value={f.value}>
              {f.label}
            </MenuItem>
          ))}
        </Select>
      </Setting>

      <Setting
        label="Ignore lows below"
        help="The gate does not listen to rumble (traffic, air conditioning, handling noise) below this frequency. The audio itself is not filtered."
        value=""
      >
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
      </Setting>

      <Stats />
    </div>
  );
}
