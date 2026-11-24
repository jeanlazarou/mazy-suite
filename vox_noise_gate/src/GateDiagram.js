import { useAtomValue } from "jotai";
import { useAtomCallback } from "jotai/utils";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { currentRecording } from "./Editor";
import { detectedRegions, gateParams, levelAnalysis } from "./GateSettings";
import { audioPosition } from "./Waveform";
import { activeRegion, setActiveFades } from "./actions/regions";
import { autoThreshold } from "./actions/auto_threshold";
import { changeParams } from "./actions/change_params";

import {
  DEFAULT_PARAMS,
  LEVEL_FLOOR,
  floorGain,
  gainAt,
  levelHistogram,
  regionFades,
  regionOfSilence,
  silenceAround,
} from "./core/gate";
import { fadesOf } from "./core/regions";
import { LEVEL_VIEW_FLOOR, levelToHeight } from "./core/peaks";
import { BREAK_PX, timeAxis, toTime, toX } from "./diagramLayout";
import { toTimecode } from "./utils";

// The gate settings drawn on one silence of the take: the threshold across
// its levels, the audio kept around the voice, the fades and the floor of the
// region, the min silence under it. Every setting is a handle. With a region
// selected, the drawing is that region, and its fade handles set its own.

const AXIS_W = 34; // dB scale
const HIST_W = 70; // the take's levels
const PLOT_X = AXIS_W + HIST_W + 14;
const RIGHT = 8;
const LEVEL_Y = 22;
const LEVEL_H = 236;
const GAIN_Y = LEVEL_Y + LEVEL_H + 12;
const GAIN_H = 58;
const RULER_Y = GAIN_Y + GAIN_H;
const LINE = 16; // ruler lines: the kept audio, then the fades
const BRACKET_Y = RULER_Y + 2 * LINE + 14;
const HEIGHT = BRACKET_Y + 20;

const GAIN_TOP = GAIN_Y + 6;
const GAIN_BOTTOM = GAIN_Y + GAIN_H - 4;
const SILENCE_SLOT = 12; // under the -60 dB line: silence
const GAIN_LINE_BOTTOM = GAIN_BOTTOM - SILENCE_SLOT;
const GAIN_FLOOR_DB = -60;

const COLORS = {
  voice: "rgba(33, 186, 69, 0.55)",
  quiet: "#c9ced4",
  threshold: "#f2711c",
  region: "rgba(219, 40, 40, 0.13)",
  keep: "rgba(33, 133, 208, 0.15)",
  ignored: "rgba(0, 0, 0, 0.04)",
  keepLine: "#2185d0",
  fadeLine: "#b03030",
  own: "#16a34a", // the fades of the selected region
  ink: "#555",
  short: "#db2828",
};

const SETTINGS = {
  threshold: {
    label: "Threshold",
    help: "Quieter than this is silence. The histogram on the left is the whole take: room noise is the low hump, the voice the high one. Double-click: set it from the take.",
    min: -90,
    max: -10,
    step: 0.5,
  },
  keepAfter: {
    label: "Keep after voice",
    help: "Audio kept after the voice stops, for word endings and room tails.",
    min: 0,
    max: 1000,
    step: 10,
  },
  keepBefore: {
    label: "Keep before voice",
    help: "Audio kept before the voice comes back, for breaths and soft consonants.",
    min: 0,
    max: 500,
    step: 5,
  },
  fadeOut: {
    label: "Fade out",
    help: "Fade at the start of a silenced region, where the voice has stopped: a longer one sounds like the room dying away. It happens inside the region.",
    min: 0,
    max: 500,
    step: 1,
  },
  fadeIn: {
    label: "Fade in",
    help: "Fade at the end of a silenced region, before the voice comes back: keep it short, or the noise swells up before the voice. It happens inside the region.",
    min: 0,
    max: 200,
    step: 1,
  },
  floorDb: {
    label: "Reduce to",
    help: "Level of the silenced region: true silence, or the noise only turned down to keep some room tone.",
    min: GAIN_FLOOR_DB - 1, // below the scale: silence
    max: -6,
    step: 1,
  },
  minSilence: {
    label: "Min silence",
    help: "Shorter silences, like the gaps between words, are left as they are.",
    min: 50,
    max: 2000,
    step: 10,
  },
};

const levelY = (db) => LEVEL_Y + (1 - levelToHeight(db)) * LEVEL_H;
const yToLevel = (y) => (LEVEL_VIEW_FLOOR * (y - LEVEL_Y)) / LEVEL_H;

const gainY = (gain) => {
  if (gain <= 0) return GAIN_BOTTOM;

  const db = Math.max(GAIN_FLOOR_DB, 20 * Math.log10(gain));

  return GAIN_TOP + (db / GAIN_FLOOR_DB) * (GAIN_LINE_BOTTOM - GAIN_TOP);
};

const yToFloor = (y) =>
  y > GAIN_LINE_BOTTOM + SILENCE_SLOT / 2
    ? null
    : (GAIN_FLOOR_DB * (y - GAIN_TOP)) / (GAIN_LINE_BOTTOM - GAIN_TOP);

const clampStep = (value, { min, max, step }) =>
  Math.max(min, Math.min(max, Math.round(value / step) * step));

// the floor is a number while dragged, null for silence
const floorNumber = (floorDb) => floorDb ?? SETTINGS.floorDb.min;
const toFloor = (value) => (value < GAIN_FLOOR_DB ? null : value);

const formatValue = (param, value) => {
  if (param === "threshold") return `${value.toFixed(1)} dB`;
  if (param === "floorDb") return value === null ? "silence" : `${value} dB`;
  return `${value} ms`;
};

const textWidth = (text) => text.length * 6.2;

// a label centred on x, kept inside the plot
const centred = (x, text, width) => Math.max(textWidth(text) / 2, Math.min(width - textWidth(text) / 2, x));

const FADES = ["fadeOut", "fadeIn"];

// Which silence to draw, without a region selected: the region nearest the
// playback position, preferring those with voice on both sides
function focusTime(regions, from, duration) {
  const inner = regions.filter((r) => r.start > 0 && r.end < duration);
  const pool = inner.length ? inner : regions;

  let best = null;
  let distance = Infinity;

  for (const r of pool) {
    const d = from < r.start ? r.start - from : from > r.end ? from - r.end : 0;

    if (d < distance) {
      distance = d;
      best = r;
    }
  }

  return best ? (best.start + best.end) / 2 : null;
}

// The take's level as an area, each pixel the loudest hop under it; nothing
// is drawn in the break
function levelArea(analysis, axis, width) {
  const { levels, hopSeconds } = analysis;
  const bottom = LEVEL_Y + LEVEL_H;
  const breakX = axis.cutFrom === null ? Infinity : toX(axis, axis.cutFrom);

  const parts = [];
  let points = [];

  const close = () => {
    if (points.length > 1) {
      const first = points[0][0];
      const last = points[points.length - 1][0];

      parts.push(`M${first},${bottom}L${points.map(([x, y]) => `${x},${y.toFixed(1)}`).join("L")}L${last},${bottom}Z`);
    }

    points = [];
  };

  for (let x = 0; x <= width; x++) {
    if (x > breakX && x < breakX + BREAK_PX) {
      close();
      continue;
    }

    const a = Math.floor(toTime(axis, x) / hopSeconds);
    const b = Math.max(a + 1, Math.ceil(toTime(axis, x + 1) / hopSeconds));
    let level = LEVEL_FLOOR;

    for (let h = Math.max(0, a); h < Math.min(levels.length, b); h++) {
      if (levels[h] > level) level = levels[h];
    }

    points.push([x, levelY(level)]);
  }

  close();

  return parts.join("");
}

function gainCurve(axis, region, params, duration, width) {
  const points = [];

  for (let x = 0; x <= width; x++) {
    points.push(`${x},${gainY(gainAt(region, toTime(axis, x + 0.5), params, duration)).toFixed(1)}`);
  }

  return points;
}

export function GateDiagram() {
  const params = useAtomValue(gateParams);
  const analysis = useAtomValue(levelAnalysis);
  const recording = useAtomValue(currentRecording);
  const regions = useAtomValue(detectedRegions);
  const active = useAtomValue(activeRegion);
  const position = useAtomValue(audioPosition);

  const change = useAtomCallback(useCallback((get, set, update) => changeParams(get, set, update), []));
  const setFades = useAtomCallback(useCallback((get, set, fades) => setActiveFades(get, set, fades), []));
  const auto = useAtomCallback(useCallback((get, set) => autoThreshold(get, set), []));

  const wrapper = useRef(null);
  const [width, setWidth] = useState(0);
  const [drag, setDrag] = useState(null); // { key, anchor, axis }: the view holds still
  const [held, setHeld] = useState(null); // { anchor, position }: kept after a change, until the playback moves

  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));

    observer.observe(wrapper.current);

    return () => observer.disconnect();
  }, []);

  const { threshold, keepAfter, keepBefore, minSilence } = params;
  const duration = recording?.duration ?? 0;
  const plotW = Math.max(0, width - PLOT_X - RIGHT);

  // the selected region is drawn; else a change of setting lets the region go
  // (detection changed): the view stays on its silence until the playback moves
  const activeMiddle = active ? (active.start + active.end) / 2 : null;
  const anchor = drag
    ? drag.anchor
    : !analysis
      ? null
      : active
        ? activeMiddle
        : held && held.position === position && silenceAround(analysis, duration, threshold, held.anchor)
          ? held.anchor
          : focusTime(regions, position, duration);

  // the drawing is the selected region: its fade handles are its own
  const own = Boolean(active) && anchor === activeMiddle;
  const ownStart = own ? active.start : null;
  const ownEnd = own ? active.end : null;

  // a selected region with no silence under it (a click drawn in the voice)
  // is drawn on its own
  const silence = useMemo(() => {
    if (!analysis || anchor === null) return null;

    const found = silenceAround(analysis, duration, threshold, anchor);

    if (found || ownStart === null) return found;

    return { silenceStart: ownStart, silenceEnd: ownEnd, atStart: ownStart <= 0, atEnd: ownEnd >= duration, drawn: true };
  }, [analysis, duration, threshold, anchor, ownStart, ownEnd]);

  const region = own
    ? { start: active.start, end: active.end, ...fadesOf(active) }
    : silence && !silence.drawn
      ? regionOfSilence(silence, duration, params)
      : null;

  // the fades in ms: the selected region's own, else the settings'
  const fadeOutMs = own ? (active.fadeOut ?? params.fadeOut) : params.fadeOut;
  const fadeInMs = own ? (active.fadeIn ?? params.fadeIn) : params.fadeIn;

  const S = silence?.silenceStart;
  const E = silence?.silenceEnd;

  const axis = useMemo(() => {
    if (drag) return drag.axis;
    if (!silence || plotW <= 0) return null;

    const sides = { keepAfter, keepBefore, fadeOut: fadeOutMs, fadeIn: fadeInMs, minSilence };

    return timeAxis(silence, sides, duration, plotW);
  }, [drag, silence, keepAfter, keepBefore, fadeOutMs, fadeInMs, minSilence, duration, plotW]);

  const histogram = useMemo(() => (analysis ? levelHistogram(analysis.levels) : null), [analysis]);

  const area = useMemo(
    () => (analysis && axis ? levelArea(analysis, axis, plotW) : ""),
    [analysis, axis, plotW]
  );

  // dragging and the keyboard

  const isOwn = (param) => own && FADES.includes(param);

  const valueOf = (param) => {
    if (param === "fadeOut") return fadeOutMs;
    if (param === "fadeIn") return fadeInMs;
    if (param === "floorDb") return floorNumber(params.floorDb);
    return params[param];
  };

  const shown = (param) => formatValue(param, param === "floorDb" ? params.floorDb : valueOf(param));

  const set = (param, raw) => {
    const value = param === "floorDb" ? toFloor(clampStep(raw ?? SETTINGS.floorDb.min, SETTINGS.floorDb)) : clampStep(raw, SETTINGS[param]);
    const current = param === "floorDb" ? params.floorDb : valueOf(param);

    if (value === current) return;

    if (isOwn(param)) setFades({ [param]: value });
    else change({ [param]: value });
  };

  const dragTo = (key, e) => {
    const box = e.currentTarget.ownerSVGElement.getBoundingClientRect();
    const x = e.clientX - box.left - PLOT_X;
    const y = e.clientY - box.top;
    const t = axis ? toTime(axis, x) : 0;

    if (key === "threshold") return set("threshold", yToLevel(y));
    if (key === "floorDb") return set("floorDb", yToFloor(y));
    if (!silence) return;
    if (key === "keepAfter") return set("keepAfter", (t - S) * 1000);
    if (key === "keepBefore") return set("keepBefore", (E - t) * 1000);
    if (key === "minSilence") return set("minSilence", (t - S) * 1000);
    if (!region) return;
    if (key === "fadeOut") return set("fadeOut", (t - region.start) * 1000);
    if (key === "fadeIn") return set("fadeIn", (region.end - t) * 1000);
  };

  const press = (e, param, direction) => {
    const { min, max, step } = SETTINGS[param];
    const value = valueOf(param);
    const moves = {
      ArrowUp: step,
      ArrowDown: -step,
      ArrowRight: direction * step,
      ArrowLeft: -direction * step,
      PageUp: 10 * step,
      PageDown: -10 * step,
    };

    let next;

    if (e.key in moves) next = value + moves[e.key];
    else if (e.key === "Home") next = min;
    else if (e.key === "End") next = max;
    else return;

    e.preventDefault();
    if (anchor !== null) setHeld({ anchor, position });
    set(param, next);
  };

  const release = () => {
    if (drag?.anchor != null) setHeld({ anchor: drag.anchor, position });
    setDrag(null);
  };

  // a region's own fade goes back to the settings'
  const reset = (param) => {
    if (param === "threshold") auto();
    else if (isOwn(param)) setFades({ [param]: undefined });
    else change({ [param]: DEFAULT_PARAMS[param] });
  };

  // key: what is dragged; param: the setting it changes; direction: whether
  // the setting grows to the right
  const handle = (key, param, { cursor = "ew-resize", direction = 1 } = {}) => {
    return {
      className: "diagram-handle",
      fill: "transparent",
      role: "slider",
      tabIndex: 0,
      "aria-label": isOwn(param) ? `${SETTINGS[param].label}, this region` : SETTINGS[param].label,
      "aria-valuemin": SETTINGS[param].min,
      "aria-valuemax": SETTINGS[param].max,
      "aria-valuenow": valueOf(param),
      "aria-valuetext": shown(param),
      style: { cursor },
      onPointerDown: (e) => {
        if (e.button !== 0) return;

        e.currentTarget.setPointerCapture(e.pointerId);
        setDrag({ key, anchor, axis });
      },
      onPointerMove: (e) => {
        if (drag?.key === key) dragTo(key, e);
      },
      onPointerUp: release,
      onLostPointerCapture: release,
      onDoubleClick: () => reset(param),
      onKeyDown: (e) => press(e, param, direction),
    };
  };

  const tip = (param) => (
    <title>
      {isOwn(param)
        ? `${SETTINGS[param].label} of the selected region: ${shown(param)}. Double-click: back to the setting for all regions (${params[param]} ms).`
        : `${SETTINGS[param].label}: ${shown(param)}. ${SETTINGS[param].help}`}
    </title>
  );

  // what to draw

  const x = (t) => toX(axis, t);
  const thresholdY = levelY(threshold);
  const maxBin = histogram ? Math.max(1, ...histogram) : 1;
  const binH = LEVEL_H / -LEVEL_VIEW_FLOOR;

  const { fadeOut, fadeIn } = region ? regionFades(region, params, duration) : { fadeOut: 0, fadeIn: 0 };
  const tooShort = silence && !silence.drawn && (E - S) * 1000 < minSilence;

  const inView = axis && position >= axis.from && position <= axis.to;
  const breakX = axis && axis.cutFrom !== null ? x(axis.cutFrom) : null;

  let message = null;

  if (!analysis) message = "Measuring the levels…";
  else if (!silence) message = drag ? "The voice is above the threshold here" : "No silence quieter than the threshold";
  else if (own) message = null;
  else if (tooShort) message = "Shorter than the min silence: left as it is";
  else if (!region) message = "Nothing left once the audio around the voice is kept";

  const captions = [];

  if (axis && silence?.drawn) {
    captions.push([plotW / 2, `the selected region ${toTimecode(S)} – ${toTimecode(E)}, in the voice`]);
  } else if (axis && silence) {
    const stops = silence.atStart ? "the take starts quiet" : `voice stops ${toTimecode(S)}`;
    const back = silence.atEnd ? "the take ends quiet" : `comes back ${toTimecode(E)}`;

    if (breakX !== null) {
      captions.push([breakX / 2, stops], [(breakX + BREAK_PX + plotW) / 2, back]);
    } else {
      captions.push([plotW / 2, `${stops} · ${back}`]);
    }
  }

  const minEnd = axis && silence ? x(S + minSilence / 1000) : 0;
  const minLabel = `min silence ${minSilence} ms${tooShort ? ", longer than this one" : ""}`;
  const minLabelRight = minEnd + 10 + textWidth(minLabel) < plotW;

  const showKeepAfter = axis && silence && !silence.atStart && !silence.drawn;
  const showKeepBefore = axis && silence && !silence.atEnd && !silence.drawn;
  const showFadeOut = axis && region && region.start > 0;
  const showFadeIn = axis && region && region.end < duration;
  const showFloor = axis && region;
  const showMin = axis && silence && !silence.drawn;

  const fadeColor = own ? COLORS.own : COLORS.fadeLine;
  const ownNote = (...params) => (own && params.some((p) => active[p] !== undefined) ? ", this region" : "");

  // the fade labels, made one under a region too short for both
  const fadeTexts = (() => {
    if (!axis || !region) return [];

    const out = showFadeOut
      ? { x: x(region.start), text: `fade out ${fadeOutMs} ms${ownNote("fadeOut")}`, anchor: "start" }
      : null;
    const into = showFadeIn
      ? { x: x(region.end), text: `fade in ${fadeInMs} ms${ownNote("fadeIn")}`, anchor: "end" }
      : null;

    if (out && into && out.x + textWidth(out.text) + 12 > into.x - textWidth(into.text)) {
      const text = `fades ${fadeOutMs} / ${fadeInMs} ms${ownNote("fadeOut", "fadeIn")}`;

      return [{ x: centred((out.x + into.x) / 2, text, plotW), text, anchor: "middle" }];
    }

    return [out, into].filter(Boolean);
  })();

  const keepAfterX = showKeepAfter ? x(S + keepAfter / 1000) : 0;
  const keepBeforeX = showKeepBefore ? x(E - keepBefore / 1000) : 0;
  const fadeOutX = showFloor ? x(region.start + fadeOut) : 0;
  const fadeInX = showFloor ? x(region.end - fadeIn) : 0;
  const floorY = gainY(floorGain(params.floorDb));

  return (
    <div className="gate-diagram" ref={wrapper}>
      {width > 0 ? (
        <svg width={width} height={HEIGHT}>
          <defs>
            <clipPath id="gate-diagram-voice">
              <rect x={-PLOT_X} y={0} width={width} height={thresholdY} />
            </clipPath>
          </defs>

          {/* dB scale, the take's levels */}

          <text className="diagram-text" x={AXIS_W} y={12}>
            the take
          </text>
          {[0, -20, -40, -60, -80].map((db) => (
            <text key={db} className="diagram-tick" x={AXIS_W - 5} y={levelY(db) + 3} textAnchor="end">
              {db}
            </text>
          ))}
          {histogram
            ? Array.from(histogram, (count, i) =>
                count ? (
                  <rect
                    key={i}
                    x={AXIS_W}
                    y={LEVEL_Y + LEVEL_H - (i + 1) * binH}
                    width={Math.sqrt(count / maxBin) * HIST_W}
                    height={binH}
                    fill={LEVEL_VIEW_FLOOR + i + 0.5 < threshold ? COLORS.quiet : COLORS.voice}
                  />
                ) : null
              )
            : null}

          <text className="diagram-tick" x={AXIS_W - 5} y={GAIN_TOP + 3} textAnchor="end">
            0
          </text>
          <text className="diagram-tick" x={AXIS_W - 5} y={GAIN_BOTTOM + 3} textAnchor="end">
            off
          </text>
          <text className="diagram-text" x={AXIS_W} y={GAIN_Y + GAIN_H / 2 + 4}>
            gain
          </text>

          {/* the silence */}

          <g transform={`translate(${PLOT_X}, 0)`}>
            <rect x={0} y={LEVEL_Y} width={plotW} height={LEVEL_H} className="diagram-frame" />
            <rect x={0} y={GAIN_Y} width={plotW} height={GAIN_H} className="diagram-frame" />

            {axis && silence ? (
              region ? (
                <>
                  <rect x={x(S)} y={LEVEL_Y} width={Math.max(0, x(region.start) - x(S))} height={GAIN_Y + GAIN_H - LEVEL_Y} fill={COLORS.keep} />
                  <rect x={x(region.start)} y={LEVEL_Y} width={x(region.end) - x(region.start)} height={GAIN_Y + GAIN_H - LEVEL_Y} fill={COLORS.region} />
                  <rect x={x(region.end)} y={LEVEL_Y} width={Math.max(0, x(E) - x(region.end))} height={GAIN_Y + GAIN_H - LEVEL_Y} fill={COLORS.keep} />
                </>
              ) : (
                <rect x={x(S)} y={LEVEL_Y} width={x(E) - x(S)} height={GAIN_Y + GAIN_H - LEVEL_Y} fill={COLORS.ignored} />
              )
            ) : null}

            <path d={area} fill={COLORS.quiet} />
            <path d={area} fill={COLORS.voice} clipPath="url(#gate-diagram-voice)" />

            {axis ? (
              <polyline
                points={gainCurve(axis, region, params, duration, plotW).join(" ")}
                fill="none"
                stroke={COLORS.ink}
                strokeWidth={1.5}
              />
            ) : null}

            {breakX !== null ? (
              <g className="diagram-break">
                <rect x={breakX + 4} y={LEVEL_Y - 2} width={BREAK_PX - 8} height={LEVEL_H + 4} fill="white" />
                <path d={`M${breakX + 8},${LEVEL_Y + LEVEL_H / 2 + 8}l8,-16M${breakX + 20},${LEVEL_Y + LEVEL_H / 2 + 8}l8,-16`} />
                <text className="diagram-text" x={breakX + BREAK_PX / 2} y={RULER_Y + 12} textAnchor="middle">
                  {`${(E - S).toFixed(1)} s`}
                </text>
              </g>
            ) : null}

            {inView ? <line x1={x(position)} x2={x(position)} y1={LEVEL_Y} y2={GAIN_Y + GAIN_H} stroke="#333" /> : null}

            {captions.map(([cx, text]) => (
              <text key={text} className="diagram-text" x={centred(cx, text, plotW)} y={12} textAnchor="middle">
                {text}
              </text>
            ))}

            {message ? (
              <text className="diagram-message" x={plotW / 2} y={LEVEL_Y + 22} textAnchor="middle">
                {message}
              </text>
            ) : null}

            {/* the audio kept around the voice, the fades and the floor */}

            {showKeepAfter ? (
              <g>
                <line x1={keepAfterX} x2={keepAfterX} y1={LEVEL_Y} y2={LEVEL_Y + LEVEL_H} stroke={COLORS.keepLine} strokeDasharray="3 3" />
                <rect x={keepAfterX - 3} y={LEVEL_Y + LEVEL_H - 14} width={6} height={14} rx={2} fill={COLORS.keepLine} />
                <text className="diagram-text" x={centred((x(S) + keepAfterX) / 2, `keep after ${keepAfter} ms`, plotW)} y={RULER_Y + 12} textAnchor="middle">
                  {`keep after ${keepAfter} ms`}
                </text>
              </g>
            ) : null}

            {showKeepBefore ? (
              <g>
                <line x1={keepBeforeX} x2={keepBeforeX} y1={LEVEL_Y} y2={LEVEL_Y + LEVEL_H} stroke={COLORS.keepLine} strokeDasharray="3 3" />
                <rect x={keepBeforeX - 3} y={LEVEL_Y + LEVEL_H - 14} width={6} height={14} rx={2} fill={COLORS.keepLine} />
                <text className="diagram-text" x={centred((keepBeforeX + x(E)) / 2, `keep before ${keepBefore} ms`, plotW)} y={RULER_Y + 12} textAnchor="middle">
                  {`keep before ${keepBefore} ms`}
                </text>
              </g>
            ) : null}

            {showFadeOut ? (
              <g>
                <line x1={fadeOutX} x2={fadeOutX} y1={GAIN_Y} y2={GAIN_Y + GAIN_H} stroke={fadeColor} strokeWidth={own ? 2 : 1} />
              </g>
            ) : null}

            {showFadeIn ? (
              <g>
                <line x1={fadeInX} x2={fadeInX} y1={GAIN_Y} y2={GAIN_Y + GAIN_H} stroke={fadeColor} strokeWidth={own ? 2 : 1} />
              </g>
            ) : null}

            {fadeTexts.map(({ x: tx, text, anchor }) => (
              <text key={text} className="diagram-text" x={tx} y={RULER_Y + LINE + 12} textAnchor={anchor} style={own ? { fill: COLORS.own } : undefined}>
                {text}
              </text>
            ))}

            {showFloor ? (
              <g>
                <circle cx={(fadeOutX + fadeInX) / 2} cy={floorY} r={4.5} fill={COLORS.ink} />
                <text className="diagram-value" x={(fadeOutX + fadeInX) / 2} y={floorY > GAIN_TOP + 16 ? floorY - 8 : floorY + 15} textAnchor="middle">
                  {formatValue("floorDb", params.floorDb)}
                </text>
              </g>
            ) : null}

            {/* the min silence, against this silence */}

            {showMin ? (
              <g>
                <rect x={x(S)} y={BRACKET_Y - 2} width={x(E) - x(S)} height={4} fill={COLORS.quiet} />
                <path
                  d={`M${x(S)},${BRACKET_Y - 9}v6H${minEnd}v-6`}
                  fill="none"
                  stroke={tooShort ? COLORS.short : COLORS.ink}
                  strokeWidth={1.5}
                />
                <circle cx={minEnd} cy={BRACKET_Y - 3} r={5} fill={tooShort ? COLORS.short : COLORS.ink} />
                <text
                  className="diagram-text"
                  x={minLabelRight ? minEnd + 10 : minEnd - 10}
                  y={BRACKET_Y + 1}
                  textAnchor={minLabelRight ? "start" : "end"}
                  style={tooShort ? { fill: COLORS.short } : undefined}
                >
                  {minLabel}
                </text>
              </g>
            ) : null}
          </g>

          {/* the threshold, across the take's levels and the silence */}

          <line x1={AXIS_W} x2={PLOT_X + plotW} y1={thresholdY} y2={thresholdY} stroke={COLORS.threshold} strokeWidth={2} />
          <text className="diagram-value" x={PLOT_X + plotW - 4} y={thresholdY - 5} textAnchor="end" style={{ fill: COLORS.threshold }}>
            {formatValue("threshold", threshold)}
          </text>

          {/* what can be grabbed, the thin handles over the wide ones */}

          <rect x={AXIS_W} y={thresholdY - 6} width={PLOT_X + plotW - AXIS_W} height={12} {...handle("threshold", "threshold", { cursor: "ns-resize" })}>
            {tip("threshold")}
          </rect>

          <g transform={`translate(${PLOT_X}, 0)`}>
            {showFloor ? (
              <rect x={fadeOutX} y={floorY - 7} width={Math.max(12, fadeInX - fadeOutX)} height={14} {...handle("floorDb", "floorDb", { cursor: "ns-resize" })}>
                {tip("floorDb")}
              </rect>
            ) : null}
            {showMin ? (
              <rect x={minEnd - 9} y={BRACKET_Y - 13} width={18} height={20} {...handle("minSilence", "minSilence")}>
                {tip("minSilence")}
              </rect>
            ) : null}
            {showKeepAfter ? (
              <rect x={keepAfterX - 6} y={LEVEL_Y} width={12} height={LEVEL_H} {...handle("keepAfter", "keepAfter")}>
                {tip("keepAfter")}
              </rect>
            ) : null}
            {showKeepBefore ? (
              <rect x={keepBeforeX - 6} y={LEVEL_Y} width={12} height={LEVEL_H} {...handle("keepBefore", "keepBefore", { direction: -1 })}>
                {tip("keepBefore")}
              </rect>
            ) : null}
            {showFadeOut ? (
              <rect x={fadeOutX - 6} y={GAIN_Y} width={12} height={GAIN_H + 2 * LINE} {...handle("fadeOut", "fadeOut")}>
                {tip("fadeOut")}
              </rect>
            ) : null}
            {showFadeIn ? (
              <rect x={fadeInX - 6} y={GAIN_Y} width={12} height={GAIN_H + 2 * LINE} {...handle("fadeIn", "fadeIn", { direction: -1 })}>
                {tip("fadeIn")}
              </rect>
            ) : null}
          </g>
        </svg>
      ) : null}
    </div>
  );
}
