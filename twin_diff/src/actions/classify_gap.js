// Classifying an unclassified gap in one step. The gap already says what it
// can become (gapOptions in model/edits.js):
//
//   music on both sides  → `same` or `changed`
//   music on one side    → what that side has alone (`removed` for A, `added`
//                          for B), or more of a `same`/`changed` it touches —
//                          the extension, when the edges were set too tight
//                          around a correspondence
//
// so a gap needs a keypress or a click, not a drag on each side.

import { useTwinStore } from '../state/store.js';
import { gapOptions, applyGapOption, segmentAt } from '../model/edits.js';
import { applySegments } from './apply_segments.js';
import { selectSegment } from './select_band.js';
import { showToast } from './show_toast.js';

export function describeOption(option) {
  if (!option.extend) return option.kind;
  if (option.extend === 'both') return `${option.kind} — join both`;
  return `${option.kind} — extend ${option.extend === 'before' ? '↑' : '↓'}`;
}

function apply(band, option) {
  const { doc } = useTwinStore.getState();
  const segments = applyGapOption(doc.segments, band, option);
  if (segments === doc.segments) return;
  applySegments(segments);

  const side = band.hasA ? 'a' : 'b';
  const probe = band[side][0] + (band[side][1] - band[side][0]) / 2;
  selectSegment(segmentAt(segments, side, probe), { go: false });

  const label = doc.sides[side].label;
  const message = option.extend
    ? option.extend === 'both'
      ? `joined into one ${option.kind} with the segments on both sides`
      : `the ${option.kind} ${option.extend === 'before' ? 'above' : 'below'} now covers it`
    : band.hasA && band.hasB
      ? `marked ${option.kind}`
      : `marked ${option.kind} — only ${label} has music here`;
  showToast(message);
}

// `request` is an option from the list, or what a key asks for: 'same',
// 'changed', or 'one-sided'. Returns whether the band was a gap at all, so a
// key with another meaning elsewhere can fall back to it.
export function classifyBand(index, request) {
  const { doc, layout } = useTwinStore.getState();
  const band = layout[index];
  if (!doc || band?.kind !== 'unknown') return false;
  const options = gapOptions(doc.segments, band);
  if (!options.length) return true;

  if (typeof request === 'object') {
    apply(band, request);
    return true;
  }

  const twoSided = band.hasA && band.hasB;
  if (request === 'one-sided') {
    if (twoSided) {
      showToast('there is music on both sides of this gap — s for same, c for changed');
    } else {
      apply(band, options[0]);
    }
    return true;
  }

  const option = options.find((o) => o.kind === request);
  if (option) {
    apply(band, option);
  } else {
    const label = doc.sides[band.hasA ? 'a' : 'b'].label;
    showToast(
      `no ${request} segment touches this gap to extend — only ${label} has music here, a or r marks it ${options[0].kind}`,
    );
  }
  return true;
}

export function classifySelected(request) {
  const { selected } = useTwinStore.getState();
  if (selected === null) return false;
  return classifyBand(selected, request);
}
