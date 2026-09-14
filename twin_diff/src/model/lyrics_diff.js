// The lyrics diff: align the words of two transcripts, mark which words
// changed, and propose segments from the alignment.
//
// It aligns WORDS across the whole song, not lines. Two independent
// transcripts never cut a song into lines the same way — in the demo, the
// original sings "running so fast to unknown direction now" as one line and
// the rework's lyrics have "running so fast" and "to a known direction" as
// two — so pairing line with line fails on exactly the files this tool gets.
// Words are what the two share; lines are an accident of the transcriber.
//
// And it reads a stretch where both sides differ between the same anchors as
// a *replacement*, the way a text diff does. A rework made by uploading a
// recording with no lyrics has the AI transcribe what it thought it heard and
// sing the substitutes over an unchanged melody: "a train in my mind now"
// against "I turn on my mind now" is one line, misheard — `changed`, not a
// line removed and another added.
//
// Pure — no DOM, no audio.

import { orderSegments } from './twin.js';
import { fitsWith } from './edits.js';

export { fitsWith };

// An agreement shorter than this many words, squeezed between two
// disagreements, is a coincidence ("no", "time", "all") rather than an
// anchor: it is folded into the change around it, as a diff's semantic
// clean-up does.
export const ANCHOR_WORDS = 3;

// The lyrics speak at two scales. Word by word, for the inline highlight —
// that is where a mishearing shows. Section by section, for the proposed
// segments: a silence at least this long on either side ends a section, and
// shorter ones (the gaps between sung lines) belong to the section around
// them. What happens inside a long silence — an instrumental break, stretched
// or not — is left unclassified, for the ear to judge rather than the lyrics.
export const SECTION_BREAK = 8;

export function tokens(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9\s]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

// Every word of a transcript, with the moment it is sung. An SRT only times
// whole cues, so a word's moment is estimated inside its cue, in proportion
// to where it sits in the text — enough to place a boundary within a line.
export function wordsOf(cues) {
  const words = [];
  cues.forEach((cue, cueIndex) => {
    const written = String(cue.text).split(/\s+/).filter(Boolean);
    const total = written.reduce((sum, word) => sum + word.length + 1, 0) || 1;
    let before = 0;
    const duration = cue.to - cue.from;
    written.forEach((word, position) => {
      const token = tokens(word).join('');
      const t0 = cue.from + (before / total) * duration;
      before += word.length + 1;
      const t1 = cue.from + (before / total) * duration;
      if (token) words.push({ token, word, t0, t1, cue: cueIndex, position });
    });
  });
  return words;
}

// Skipping this many more sung words on one side than on the other, between
// two matched words, still reads as a change (a misheard line, a line one side
// dropped). Beyond it, the match is reaching past a whole passage only one
// side sings, and has to earn it.
export const SKEW_ALLOWED = 8;
// Per word of skew beyond the allowance, up to a cap. Reaching across a whole
// passage lets a match gain only a word or three over staying put, so a skew
// of a verse (15+ words) has to cost more than that — yet a single match's
// cost must stay small next to what follows, so that after a verse one side
// really dropped, the alignment still picks the song up again.
const SKEW_COST = 0.4;
const SKEW_MAX = 4;

// The alignment of two word lists, as operations:
// { op: 'equal', a, b } | { op: 'delete', a } | { op: 'insert', b }.
//
// A longest common subsequence, with one correction. Plain LCS counts words
// and nothing else, so when a verse is sung twice on one side and once on the
// other it will happily pair a word of the one copy with the first repeat and
// the rest with the second — one word more, and a correspondence reaching
// across a whole verse. (The demo's no-lyrics rework did exactly that: its
// "try and run time place / try and hang on time" matched "time" in the
// original's first refrain and "on time" onward in its second.) So each match
// is weighed by how lopsided the skip that reached it was: skipping about as
// many words on both sides is a change and costs nothing; skipping many sung
// words on one side only costs, up to more than the match is worth. A break
// one side merely stretched skips no words, so it costs nothing either.
export function alignWords(wordsA, wordsB) {
  const n = wordsA.length;
  const m = wordsB.length;
  const width = m + 1;
  const score = new Float64Array((n + 1) * width);
  const choice = new Uint8Array((n + 1) * width); // 0 skip A, 1 skip B, 2 match
  const lastA = new Int32Array((n + 1) * width).fill(-1); // last matched word on the best path
  const lastB = new Int32Array((n + 1) * width).fill(-1);
  const at = (i, j) => i * width + j;

  for (let i = 0; i <= n; i += 1) {
    for (let j = 0; j <= m; j += 1) {
      if (i === 0 && j === 0) continue;
      const k = at(i, j);
      let best = -Infinity;
      if (i > 0) {
        const from = at(i - 1, j);
        best = score[from];
        choice[k] = 0;
        lastA[k] = lastA[from];
        lastB[k] = lastB[from];
      }
      if (j > 0 && score[at(i, j - 1)] > best) {
        const from = at(i, j - 1);
        best = score[from];
        choice[k] = 1;
        lastA[k] = lastA[from];
        lastB[k] = lastB[from];
      }
      if (i > 0 && j > 0 && wordsA[i - 1].token === wordsB[j - 1].token) {
        const from = at(i - 1, j - 1);
        const skippedA = i - 1 - (lastA[from] + 1);
        const skippedB = j - 1 - (lastB[from] + 1);
        const skew = Math.abs(skippedA - skippedB);
        const weight = 1 - Math.min(SKEW_MAX, Math.max(0, skew - SKEW_ALLOWED) * SKEW_COST);
        if (score[from] + weight >= best) {
          best = score[from] + weight;
          choice[k] = 2;
          lastA[k] = i - 1;
          lastB[k] = j - 1;
        }
      }
      score[k] = best;
    }
  }

  const ops = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const c = i === 0 ? 1 : j === 0 ? 0 : choice[at(i, j)];
    if (c === 2) {
      ops.push({ op: 'equal', a: i - 1, b: j - 1 });
      i -= 1;
      j -= 1;
    } else if (c === 0) {
      ops.push({ op: 'delete', a: i - 1 });
      i -= 1;
    } else {
      ops.push({ op: 'insert', b: j - 1 });
      j -= 1;
    }
  }
  return ops.reverse();
}

// Hunks, as a text diff has them: runs of agreement (`same`) and the
// disagreements between them (`changed` when both sides have words there,
// `removed` / `added` when only one does). Each hunk lists the word indexes
// it holds on each side.
export function wordHunks(wordsA, wordsB, ops = alignWords(wordsA, wordsB)) {
  const raw = [];
  for (const op of ops) {
    const equal = op.op === 'equal';
    let hunk = raw[raw.length - 1];
    if (!hunk || hunk.equal !== equal) {
      hunk = { equal, a: [], b: [] };
      raw.push(hunk);
    }
    if (op.a !== undefined) hunk.a.push(op.a);
    if (op.b !== undefined) hunk.b.push(op.b);
  }

  // Fold coincidental agreements into the change around them.
  const folded = [];
  raw.forEach((hunk, index) => {
    const between = index > 0 && index < raw.length - 1;
    const coincidence = hunk.equal && between && hunk.a.length < ANCHOR_WORDS;
    const current = coincidence ? { ...hunk, equal: false } : hunk;
    const last = folded[folded.length - 1];
    if (last && !last.equal && !current.equal) {
      last.a.push(...current.a);
      last.b.push(...current.b);
    } else {
      folded.push({ equal: current.equal, a: [...current.a], b: [...current.b] });
    }
  });

  return folded.map((hunk) => ({
    kind: hunk.equal ? 'same' : hunk.a.length && hunk.b.length ? 'changed' : hunk.a.length ? 'removed' : 'added',
    a: hunk.a,
    b: hunk.b,
  }));
}

const spanOf = (words, indexes) =>
  indexes.length ? [words[indexes[0]].t0, words[indexes[indexes.length - 1]].t1] : null;

// The alignment cut into sections wherever either side falls silent for
// SECTION_BREAK or longer. The cut is made in the alignment itself, at one
// point for both sides, so the sections stay in the same order on both
// timelines — which is what makes them valid segments.
export function lyricSections(wordsA, wordsB, ops = alignWords(wordsA, wordsB)) {
  const sections = [];
  let current = null;
  let lastA = null;
  let lastB = null;
  for (const op of ops) {
    const silentA =
      op.a !== undefined && lastA !== null && wordsA[op.a].t0 - wordsA[lastA].t1 >= SECTION_BREAK;
    const silentB =
      op.b !== undefined && lastB !== null && wordsB[op.b].t0 - wordsB[lastB].t1 >= SECTION_BREAK;
    // One break in the singing is one cut, even when the two sides fall
    // silent at slightly different points of the alignment. A silence on a
    // side only cuts a section that already holds words on that side: B going
    // quiet when the section has no B words yet is the same break, seen late.
    const cut = (silentA && current?.a.length > 0) || (silentB && current?.b.length > 0);
    if (!current || cut) {
      current = { a: [], b: [] };
      sections.push(current);
    }
    if (op.a !== undefined) {
      current.a.push(op.a);
      lastA = op.a;
    }
    if (op.b !== undefined) {
      current.b.push(op.b);
      lastB = op.b;
    }
  }

  // A cut is made at one point of the alignment for both sides, but inside a
  // run of unmatched words the order of one side's words against the other's
  // means nothing. So an unmatched word sung right after the previous section
  // on its own side — its last word before the other side's long break, say —
  // can land after the cut. By its own timeline it belongs before: move it
  // back, as long as its side has not fallen silent in between.
  const words = { a: wordsA, b: wordsB };
  for (let k = 1; k < sections.length; k += 1) {
    for (const side of ['a', 'b']) {
      const previous = sections[k - 1][side];
      const current = sections[k][side];
      while (
        previous.length &&
        current.length &&
        words[side][current[0]].t0 - words[side][previous[previous.length - 1]].t1 < SECTION_BREAK
      ) {
        previous.push(current.shift());
      }
    }
  }

  const matched = { a: new Set(), b: new Set() };
  for (const op of ops) {
    if (op.op === 'equal') {
      matched.a.add(op.a);
      matched.b.add(op.b);
    }
  }
  return sections
    .filter((section) => section.a.length || section.b.length)
    .map((section) => {
      const differs =
        section.a.some((index) => !matched.a.has(index)) || section.b.some((index) => !matched.b.has(index));
      return {
        kind:
          section.a.length && section.b.length
            ? differs
              ? 'changed'
              : 'same'
            : section.a.length
              ? 'removed'
              : 'added',
        a: section.a,
        b: section.b,
      };
    });
}

// Segments proposed by the lyrics alone: one per sung section — `same` when
// every word agrees, `changed` when any differs (the words themselves are
// shown inline), `removed` / `added` when only one side sings there.
export function proposeSegments(cuesA, cuesB) {
  const wordsA = wordsOf(cuesA);
  const wordsB = wordsOf(cuesB);
  // sections come out of the alignment already in order on both sides
  const segments = lyricSections(wordsA, wordsB).map((section) => ({
    kind: section.kind,
    a: spanOf(wordsA, section.a),
    b: spanOf(wordsB, section.b),
    label: null,
    note: null,
  }));
  absorbShortSilences(segments, 'a');
  absorbShortSilences(segments, 'b');
  return segments;
}

function absorbShortSilences(segments, side) {
  const onSide = segments.filter((segment) => segment[side]);
  for (let k = 0; k < onSide.length - 1; k += 1) {
    const current = onSide[k][side];
    const next = onSide[k + 1][side];
    const gap = next[0] - current[1];
    if (gap > 0 && gap < SECTION_BREAK) onSide[k][side] = [current[0], next[0]];
  }
}

// For drawing the lyrics: every cue's words, each marked as found on the
// other side or not — the inline highlight a text diff draws inside a
// changed line.
export function cueWordMarks(cuesA, cuesB) {
  const wordsA = wordsOf(cuesA);
  const wordsB = wordsOf(cuesB);
  const hunks = wordHunks(wordsA, wordsB);
  const sameA = new Set();
  const sameB = new Set();
  for (const hunk of hunks) {
    if (hunk.kind !== 'same') continue;
    hunk.a.forEach((index) => sameA.add(index));
    hunk.b.forEach((index) => sameB.add(index));
  }
  const marks = (cues, words, same) => {
    const byCue = cues.map((cue) =>
      String(cue.text)
        .split(/\s+/)
        .filter(Boolean)
        .map((word) => ({ word, same: true })),
    );
    words.forEach((word, index) => {
      byCue[word.cue][word.position].same = same.has(index);
    });
    return byCue;
  };
  return { a: marks(cuesA, wordsA, sameA), b: marks(cuesB, wordsB, sameB) };
}

// Seeding a document that already has segments keeps every one of them —
// what the user marked is knowledge, the lyrics are a guess — and adds only
// the proposals that fit around them.
export function seedInto(existing, proposed) {
  const accepted = [];
  for (const proposal of proposed) {
    const fits = [...existing, ...accepted].every((segment) => fitsWith(proposal, segment));
    if (fits) accepted.push(proposal);
  }
  return {
    segments: orderSegments([...existing, ...accepted]),
    added: accepted.length,
    skipped: proposed.length - accepted.length,
  };
}
