import { describe, it, expect } from 'vitest';
import { parseSrt } from '../src/model/srt.js';
import {
  tokens,
  wordsOf,
  alignWords,
  wordHunks,
  lyricSections,
  proposeSegments,
  cueWordMarks,
  fitsWith,
  seedInto,
  SECTION_BREAK,
} from '../src/model/lyrics_diff.js';
import { parseTwinDoc } from '../src/model/twin.js';

// Invented lyrics, like the suite's other fixtures — real ones are personal
// data and stay out of the repository.
const srt = (cues) =>
  cues
    .map(([from, to, text], i) => {
      const t = (s) => {
        const ms = Math.round(s * 1000);
        const p = (n, w = 2) => String(n).padStart(w, '0');
        return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
      };
      return `${i + 1}\n${t(from)} --> ${t(to)}\n${text}\n`;
    })
    .join('\n');

const cue = (from, to, text) => ({ from, to, text });
const validDocument = (segments) =>
  parseTwinDoc({ version: 1, title: 'fixture', sides: { a: { url: 'a' }, b: { url: 'b' } }, segments })
    .problems;

describe('parseSrt', () => {
  it('reads cues with their range and text', () => {
    const { cues, problems } = parseSrt(srt([[1.5, 3.25, 'went out on paper boats'], [4, 6, 'and the tide came']]));
    expect(problems).toEqual([]);
    expect(cues).toEqual([cue(1.5, 3.25, 'went out on paper boats'), cue(4, 6, 'and the tide came')]);
  });

  it('joins a cue written over several lines', () => {
    expect(parseSrt('1\n00:00:01,000 --> 00:00:02,000\nfirst half\nsecond half\n').cues[0].text).toBe(
      'first half second half',
    );
  });

  it('reads Windows line endings and strips formatting tags', () => {
    expect(parseSrt('1\r\n00:00:01,000 --> 00:00:02,000\r\n<i>quiet</i> line\r\n').cues[0].text).toBe('quiet line');
  });

  it('skips and names a cue it cannot read, keeping the rest', () => {
    const { cues, problems } = parseSrt(
      '1\n00:00:01,000 --> nonsense\nbroken\n\n2\n00:00:03,000 --> 00:00:04,000\nfine\n',
    );
    expect(cues.map((c) => c.text)).toEqual(['fine']);
    expect(problems[0]).toMatch(/unreadable timing/);
  });

  it('reports cues that overlap', () => {
    expect(parseSrt(srt([[1, 5, 'one'], [4, 6, 'two']])).problems[0]).toMatch(/overlaps/);
  });
});

describe('tokens and wordsOf', () => {
  it('ignores case, punctuation and apostrophes', () => {
    expect(tokens("Don't  STOP, now!")).toEqual(['dont', 'stop', 'now']);
  });

  it('places each word inside its cue, in proportion to where it sits in the text', () => {
    const words = wordsOf([cue(10, 20, 'aaaa bbbb')]);
    expect(words.map((w) => w.token)).toEqual(['aaaa', 'bbbb']);
    expect(words[0].t0).toBe(10);
    expect(words[1].t0).toBeCloseTo(15, 6);
    expect(words[1].t1).toBeCloseTo(20, 6);
  });

  it('remembers which cue and position each word came from', () => {
    const words = wordsOf([cue(0, 1, 'one two'), cue(2, 3, 'three')]);
    expect(words.map((w) => [w.cue, w.position])).toEqual([[0, 0], [0, 1], [1, 0]]);
  });
});

describe('alignWords and wordHunks', () => {
  const A = wordsOf([cue(0, 5, 'went out on paper boats')]);
  const B = wordsOf([cue(0, 5, "went out on people's boats")]);

  it('aligns the shared words and marks the rest', () => {
    const ops = alignWords(A, B);
    // the order of a delete and an insert within one replacement means nothing
    expect(ops.filter((op) => op.op === 'equal').map((op) => [op.a, op.b])).toEqual([[0, 0], [1, 1], [2, 2], [4, 4]]);
    expect(ops.filter((op) => op.op === 'delete').map((op) => op.a)).toEqual([3]);
    expect(ops.filter((op) => op.op === 'insert').map((op) => op.b)).toEqual([3]);
  });

  it('reads a word replaced on both sides as a change, not a removal and an addition', () => {
    expect(wordHunks(A, B).map((h) => h.kind)).toEqual(['same', 'changed', 'same']);
  });

  it('folds a coincidental agreement between two changes into the change', () => {
    const X = wordsOf([cue(0, 5, 'red fish no blue fish')]);
    const Y = wordsOf([cue(0, 5, 'green bird no yellow bird')]);
    // "no" is shared, but one word between two disagreements is no anchor
    expect(wordHunks(X, Y).map((h) => h.kind)).toEqual(['changed']);
  });
});

describe('alignWords with a verse only one side repeats', () => {
  // The shape that went wrong on the demo: A sings the refrain twice, B once,
  // right after the verse both share — and B's refrain is misheard in a way
  // that shares a word with A's refrain twice over ("the" / "hold the line").
  // Plain LCS gains one word by pairing B's first "line" with A's first
  // refrain and everything after with A's second, skipping a whole sung
  // refrain on A while B skips almost nothing.
  const refrain = 'we never let the morning go astray so we kept on walking down the road';
  const cuesA = [
    cue(0, 4, 'we walked along the river'),
    cue(6, 9, 'hold the line and tell me'),
    cue(10, 14, refrain),
    cue(40, 43, 'hold the line and tell me'),
    cue(44, 48, refrain),
  ];
  const cuesB = [
    cue(0, 4, 'we walked along the river'),
    cue(6, 8, 'old line tonight'),
    cue(8, 10, 'and fold the line and tell me'),
    cue(11, 15, refrain),
  ];
  const A = wordsOf(cuesA);
  const B = wordsOf(cuesB);

  it('pairs the refrain with its nearest copy, not a later one', () => {
    const refrainPairs = alignWords(A, B)
      .filter((op) => op.op === 'equal' && B[op.b].cue === 3)
      .map((op) => A[op.a].cue);
    expect(new Set(refrainPairs)).toEqual(new Set([2]));
  });

  it('proposes the second copy as removed, not a crossing correspondence', () => {
    expect(proposeSegments(cuesA, cuesB).map((s) => [s.kind, s.a, s.b])).toEqual([
      ['changed', [0, 14], [0, 15]],
      ['removed', [40, 48], null],
    ]);
  });

  it('still pairs a section across a break one side stretched — no sung word is skipped there', () => {
    const stretched = proposeSegments(
      [cue(0, 4, 'we walked along the river'), cue(30, 34, 'hold the line and tell me')],
      [cue(0, 4, 'we walked along the river'), cue(70, 74, 'hold the line and tell me')],
    );
    expect(stretched.map((s) => [s.kind, s.a, s.b])).toEqual([
      ['same', [0, 4], [0, 4]],
      ['same', [30, 34], [70, 74]],
    ]);
  });
});

describe('cueWordMarks', () => {
  it('marks the misheard words inside each cue', () => {
    const marks = cueWordMarks([cue(0, 5, 'went out on paper boats')], [cue(0, 5, "went out on people's boats")]);
    expect(marks.a[0].filter((w) => !w.same).map((w) => w.word)).toEqual(['paper']);
    expect(marks.b[0].filter((w) => !w.same).map((w) => w.word)).toEqual(["people's"]);
  });

  it('does not care how the two transcripts cut the song into cues', () => {
    // A writes two lines; B runs them into one cue
    const marks = cueWordMarks(
      [cue(0, 3, 'nobody waits for summer'), cue(3, 6, 'no map no lantern')],
      [cue(0, 6, 'nobody waits for summer no map no lantern')],
    );
    expect(marks.a.flat().every((w) => w.same)).toBe(true);
    expect(marks.b[0].every((w) => w.same)).toBe(true);
  });

  it('keeps each word as written, punctuation included', () => {
    const marks = cueWordMarks([cue(0, 1, 'Hello, world')], [cue(0, 1, 'hello world')]);
    expect(marks.a[0].map((w) => w.word)).toEqual(['Hello,', 'world']);
  });
});

// Side A: the recording. Side B: the rework — a misheard word in verse 1, a
// verse 2 cut into cues differently, a longer break before the last chorus,
// and a tag at the end that only the recording has.
const cuesA = [
  cue(10, 13, 'went out on paper boats'),
  cue(14, 17, 'and the tide came in'),
  cue(40, 43, 'nobody waits for summer'),
  cue(44, 47, 'no map no lantern'),
  cue(70, 73, 'all alone on the pier'),
  cue(100, 102, 'hush now hush now'),
];
const cuesB = [
  cue(12, 15, "went out on people's boats"),
  cue(16, 19, 'and the tide came in'),
  cue(42, 48, 'nobody waits for summer no map no lantern'),
  cue(90, 93, 'all alone on the pier'),
];

describe('lyricSections and proposeSegments', () => {
  const proposed = proposeSegments(cuesA, cuesB);

  it('proposes one segment per sung section', () => {
    expect(proposed.map((s) => s.kind)).toEqual(['changed', 'same', 'same', 'removed']);
  });

  it('calls a section with a misheard word changed', () => {
    expect(proposed[0]).toMatchObject({ kind: 'changed', a: [10, 17], b: [12, 19] });
  });

  it('calls a section the same even when the two transcripts cut it into cues differently', () => {
    expect(proposed[1]).toMatchObject({ kind: 'same', a: [40, 47], b: [42, 48] });
  });

  it('pairs a section across a break the rework stretched', () => {
    expect(proposed[2]).toMatchObject({ kind: 'same', a: [70, 73], b: [90, 93] });
  });

  it('gives a section only one side sings to that side alone', () => {
    expect(proposed[3]).toMatchObject({ kind: 'removed', a: [100, 102], b: null });
  });

  it('leaves the breaks between sections unclassified', () => {
    for (let k = 0; k < proposed.length - 1; k += 1) {
      const gap = proposed[k + 1].a[0] - proposed[k].a[1];
      expect(gap).toBeGreaterThanOrEqual(SECTION_BREAK);
    }
  });

  it('absorbs the silences between lines of a section', () => {
    // one second between "paper boats" and "and the tide" stays inside
    expect(proposed[0].a).toEqual([10, 17]);
  });

  it('keeps an unmatched last word with its own section, not the one after the other side’s break', () => {
    // A's last word differs ("againx"), and B repeats the verse after a long
    // break: the stray word belongs to A's verse, and B's repeat is B's alone.
    const verse = 'hold the line and tell me we never let the morning go';
    const sections = proposeSegments(
      [cue(0, 6, `${verse} astrayx`)],
      [cue(0, 6, `${verse} astray`), cue(50, 56, `${verse} astray`)],
    );
    expect(sections.map((s) => [s.kind, s.a, s.b])).toEqual([
      ['changed', [0, 6], [0, 6]],
      ['added', null, [50, 56]],
    ]);
  });

  it('makes one cut for one break, even when the sides fall silent at different words', () => {
    const sections = lyricSections(
      wordsOf([cue(0, 2, 'we sang'), cue(20, 23, 'nobody is waiting here')]),
      wordsOf([cue(0, 2, 'we sang'), cue(40, 43, "nobody's waiting here")]),
    );
    expect(sections.map((s) => s.kind)).toEqual(['same', 'changed']);
  });

  it('produces a document the parser accepts without a single complaint', () => {
    expect(validDocument(proposed)).toEqual([]);
  });
});

describe('seedInto', () => {
  const proposed = proposeSegments(cuesA, cuesB);

  it('seeds an empty document with every proposal', () => {
    const { segments, added, skipped } = seedInto([], proposed);
    expect(segments).toHaveLength(proposed.length);
    expect([added, skipped]).toEqual([proposed.length, 0]);
  });

  it('keeps what the user marked and drops the proposals that contradict it', () => {
    const userMarked = [{ kind: 'removed', a: [9, 16], b: null, label: 'mine', note: null }];
    const { segments, skipped } = seedInto(userMarked, proposed);
    expect(segments).toContainEqual(userMarked[0]);
    expect(skipped).toBeGreaterThan(0);
    expect(validDocument(segments)).toEqual([]);
  });

  it('refuses a pair that would sit before a segment on one side and after it on the other', () => {
    const existing = { kind: 'same', a: [20, 30], b: [20, 30] };
    expect(fitsWith({ kind: 'same', a: [10, 15], b: [35, 40] }, existing)).toBe(false);
    expect(fitsWith({ kind: 'same', a: [10, 15], b: [10, 15] }, existing)).toBe(true);
  });
});
