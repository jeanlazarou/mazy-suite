// Drawing the two strips. One canvas the size of the viewport, redrawn for
// the visible window only — so the zoom can be anything without asking the
// browser for a 30 000 px tall bitmap.
//
// Nothing here knows which layout mode is on: it asks the view (model/view.js)
// where each moment of each side is, and draws there. That is what lets the
// 'true' mode be Meld's continuous panes and the 'aligned' mode the stretched
// bands without two renderers.
//
// Waveforms face each other across the gutter: each side's envelope grows
// outwards from its inner edge, which is what makes two shapes comparable at
// a glance (the same reason a population pyramid works).

import { rowsFor } from '../model/peaks.js';

export const GUTTER = 78;

// The waveform is the same neutral colour everywhere, on both sides: two
// shapes can only be compared if nothing but the audio makes them differ.
// The kind is carried by the tint, the ribbon and the label — the way a diff
// viewer tints a hunk without recolouring the code in it.
const WAVE = '#93a7c2';

export const KIND_COLORS = {
  same: { tint: 'rgba(127, 147, 173, 0.06)', mark: '#7f93ad' },
  changed: { tint: 'rgba(224, 164, 60, 0.12)', mark: '#e0a43c' },
  added: { tint: 'rgba(92, 179, 122, 0.12)', mark: '#5cb37a' },
  removed: { tint: 'rgba(209, 99, 106, 0.12)', mark: '#d1636a' },
  unknown: { tint: 'transparent', mark: '#5f6b7d' },
};

const SEPARATOR = 'rgba(255, 255, 255, 0.12)';
const HATCH = 'rgba(255, 255, 255, 0.05)';
const PLAYHEAD = '#f4f6f9';
const PLAYHEAD_SILENT = 'rgba(244, 246, 249, 0.35)';

export function columns(width) {
  const sideWidth = Math.max(40, (width - GUTTER) / 2);
  return {
    a: { outer: 0, inner: sideWidth, width: sideWidth, direction: -1, left: 0 },
    b: { outer: width, inner: width - sideWidth, width: sideWidth, direction: 1, left: width - sideWidth },
    gutter: { left: sideWidth, right: width - sideWidth },
  };
}

function drawHatch(ctx, x, y, w, h) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.strokeStyle = HATCH;
  ctx.lineWidth = 1;
  const step = 9;
  for (let offset = -h; offset < w + h; offset += step) {
    ctx.beginPath();
    ctx.moveTo(x + offset, y);
    ctx.lineTo(x + offset + h, y + h);
    ctx.stroke();
  }
  ctx.restore();
}

// One stretch of one side: `from`/`to` in that side's seconds, drawn over
// `top`..`top + rows` on screen. The RMS is filled and the peak outlined: the
// fill carries the shape, the outline the transients.
function drawWave(ctx, { column, peaks, from, to, top, rows, scale }) {
  if (!peaks || rows <= 0 || to <= from) return;
  const { peak, rms } = rowsFor(peaks, from, to, rows);
  const { inner, width, direction } = column;
  const usable = width - 6;
  const reach = (value, factor) => Math.min(Math.max(value * factor, 0), 1) * usable;

  ctx.strokeStyle = WAVE;
  ctx.globalAlpha = 0.3;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let row = 0; row < rows; row += 1) {
    const x = inner + direction * Math.max(0.6, reach(peak[row], scale.peak));
    ctx.moveTo(inner, top + row + 0.5);
    ctx.lineTo(x, top + row + 0.5);
  }
  ctx.stroke();

  ctx.globalAlpha = 1;
  ctx.fillStyle = WAVE;
  ctx.beginPath();
  ctx.moveTo(inner, top);
  for (let row = 0; row < rows; row += 1) {
    ctx.lineTo(inner + direction * Math.max(0.6, reach(rms[row], scale.rms)), top + row);
  }
  ctx.lineTo(inner, top + rows);
  ctx.closePath();
  ctx.fill();
}

// The ribbon across the gutter, drawn the way Meld draws one: it joins the
// stretch of A to the stretch of B wherever each actually is, so when the two
// differ in length it widens or narrows, when they have drifted apart it
// slants, and when one side has no counterpart it closes to a point.
function drawRibbon(ctx, { cols, a, b, color, faint }) {
  const left = cols.gutter.left;
  const right = cols.gutter.right;
  const bend = (right - left) * 0.5;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(left, a[0]);
  ctx.bezierCurveTo(left + bend, a[0], right - bend, b[0], right, b[0]);
  ctx.lineTo(right, b[1]);
  ctx.bezierCurveTo(right - bend, b[1], left + bend, a[1], left, a[1]);
  ctx.closePath();
  ctx.globalAlpha = faint ? 0.08 : 0.3;
  ctx.fillStyle = color;
  ctx.fill();

  // The two edges, drawn separately so each boundary reads as a line that
  // crosses from one song to the other.
  ctx.globalAlpha = faint ? 0.25 : 0.8;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  for (const [ya, yb] of [[a[0], b[0]], [a[1], b[1]]]) {
    ctx.beginPath();
    ctx.moveTo(left, ya);
    ctx.bezierCurveTo(left + bend, ya, right - bend, yb, right, yb);
    ctx.stroke();
  }
  ctx.restore();
}

const visible = ([top, bottom], height) => bottom >= 0 && top <= height;

export function drawTwin(canvas, params) {
  const { view, layout, peaks, viewHeight, width, selected, playheads, clock, scale } = params;
  const dpr = window.devicePixelRatio || 1;
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(viewHeight * dpr)) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(viewHeight * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, viewHeight);

  const cols = columns(width);
  const aligned = view.mode === 'aligned';

  layout.forEach((band, index) => {
    const colors = KIND_COLORS[band.kind] ?? KIND_COLORS.unknown;
    const slot = aligned ? view.extent(band) : null;
    const extents = {
      a: aligned ? slot : view.extent(band, 'a'),
      b: aligned ? slot : view.extent(band, 'b'),
    };
    if (!visible(extents.a, viewHeight) && !visible(extents.b, viewHeight)) return;

    for (const side of ['a', 'b']) {
      const column = cols[side];
      const [top, bottom] = extents[side];
      const clippedTop = Math.max(top, 0);
      const clippedBottom = Math.min(bottom, viewHeight);
      const has = side === 'a' ? band.hasA : band.hasB;
      const range = side === 'a' ? band.a : band.b;
      const duration = side === 'a' ? band.durA : band.durB;

      if (clippedBottom > clippedTop) {
        if (colors.tint !== 'transparent') {
          ctx.fillStyle = colors.tint;
          ctx.fillRect(column.left, clippedTop, column.width, clippedBottom - clippedTop);
        }
        if (index === selected) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
          ctx.fillRect(column.left, clippedTop, column.width, clippedBottom - clippedTop);
        }
      }

      // No counterpart: in the aligned layout the empty slot is hatched,
      // like a diff's blank lines; in the true layout there is no slot at
      // all, and the ribbon closing to a point says it.
      if (!has || duration <= 0) {
        if (aligned && clippedBottom > clippedTop) {
          drawHatch(ctx, column.left, clippedTop, column.width, clippedBottom - clippedTop);
        }
        continue;
      }

      if (clippedBottom <= clippedTop || bottom - top <= 0) continue;
      const fraction = (y) => (y - top) / (bottom - top);
      drawWave(ctx, {
        column,
        peaks: peaks[side],
        from: range[0] + fraction(clippedTop) * duration,
        to: range[0] + fraction(clippedBottom) * duration,
        top: clippedTop,
        rows: Math.max(1, Math.round(clippedBottom - clippedTop)),
        scale: scale ?? { rms: 1, peak: 1 },
      });
    }

    // Separators at each side's own boundary.
    for (const side of ['a', 'b']) {
      const y = Math.round(extents[side][0]) + 0.5;
      if (y < 0 || y > viewHeight) continue;
      const column = cols[side];
      ctx.strokeStyle = SEPARATOR;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(column.left, y);
      ctx.lineTo(column.left + column.width, y);
      ctx.stroke();
    }

    drawRibbon(ctx, {
      cols,
      a: extents.a,
      b: extents.b,
      color: colors.mark,
      faint: band.kind === 'unknown',
    });
  });

  // A stretch taken but not yet paired, and the one under the pointer right
  // now: drawn as an outline, because it is not a decision yet.
  for (const overlay of params.overlays ?? []) {
    const column = cols[overlay.side];
    ctx.strokeStyle = overlay.pending ? '#f4f6f9' : 'rgba(244, 246, 249, 0.6)';
    ctx.fillStyle = 'rgba(244, 246, 249, 0.07)';
    ctx.lineWidth = overlay.pending ? 2 : 1;
    ctx.setLineDash(overlay.pending ? [] : [5, 4]);
    ctx.fillRect(column.left, overlay.top, column.width, overlay.height);
    ctx.strokeRect(column.left + 0.5, overlay.top + 0.5, column.width - 1, Math.max(1, overlay.height - 1));
    ctx.setLineDash([]);
  }

  for (const side of ['a', 'b']) {
    const y = playheads[side];
    if (y < 0 || y > viewHeight) continue;
    const column = cols[side];
    ctx.strokeStyle = side === clock ? PLAYHEAD : PLAYHEAD_SILENT;
    ctx.lineWidth = side === clock ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(column.left, Math.round(y) + 0.5);
    ctx.lineTo(column.left + column.width, Math.round(y) + 0.5);
    ctx.stroke();
  }
}
