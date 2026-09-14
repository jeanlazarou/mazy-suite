// The twin document: parse, validate, normalize, serialize.
// Pure — no DOM, no audio. See SPECIFICATION.md "Data Format".

export const KINDS = ['same', 'changed', 'added', 'removed'];

const EPS = 1e-6;

const isRange = (r) =>
  Array.isArray(r) && r.length === 2 && r.every((n) => typeof n === 'number' && Number.isFinite(n));

function parseSide(raw, name, problems) {
  if (!raw || typeof raw !== 'object') {
    problems.push(`sides.${name} is missing`);
    return null;
  }
  if (typeof raw.url !== 'string' || !raw.url) problems.push(`sides.${name}.url is missing`);
  return {
    label: typeof raw.label === 'string' && raw.label ? raw.label : name.toUpperCase(),
    url: raw.url ?? '',
    srt: typeof raw.srt === 'string' && raw.srt ? raw.srt : null,
    album: typeof raw.album === 'string' && raw.album ? raw.album : null,
    track: typeof raw.track === 'string' && raw.track ? raw.track : null,
    ai: raw.ai === true,
  };
}

function parseSegment(raw, index, problems) {
  const where = `segments[${index}]`;
  if (!raw || typeof raw !== 'object') {
    problems.push(`${where} is not an object`);
    return null;
  }
  if (!KINDS.includes(raw.kind)) {
    problems.push(`${where}.kind "${raw.kind}" is not one of ${KINDS.join(', ')}`);
    return null;
  }
  const side = (key) => {
    const r = raw[key];
    if (r === null || r === undefined) return null;
    if (!isRange(r)) {
      problems.push(`${where}.${key} is not a [start, end] pair`);
      return null;
    }
    if (r[1] - r[0] <= EPS) {
      problems.push(`${where}.${key} is empty (${r[0]} → ${r[1]})`);
      return null;
    }
    return [r[0], r[1]];
  };
  let a = side('a');
  let b = side('b');
  if (!a && !b) {
    problems.push(`${where} names no side`);
    return null;
  }
  // The kind and the ranges must agree, so that everything downstream can
  // read one from the other. Where they disagree, the kind wins for the
  // one-sided kinds and the segment goes for the two-sided ones — a `same`
  // that lost a range says nothing about a correspondence.
  if (raw.kind === 'added' && a) {
    problems.push(`${where} is "added" but has a range on A — ignoring that range`);
    a = null;
  }
  if (raw.kind === 'removed' && b) {
    problems.push(`${where} is "removed" but has a range on B — ignoring that range`);
    b = null;
  }
  if ((raw.kind === 'same' || raw.kind === 'changed') && (!a || !b)) {
    problems.push(`${where} is "${raw.kind}" but names only one side — dropped`);
    return null;
  }
  return {
    kind: raw.kind,
    a,
    b,
    label: typeof raw.label === 'string' && raw.label ? raw.label : null,
    note: typeof raw.note === 'string' && raw.note ? raw.note : null,
  };
}

// Segments are ordered by time, and on each side the ranges must not overlap
// or go backwards. Reported rather than repaired: a document that breaks this
// was written by hand, and silently reshuffling it would hide the mistake.
function checkOrder(segments, problems) {
  for (const key of ['a', 'b']) {
    let prev = null;
    let prevIndex = -1;
    segments.forEach((s, i) => {
      const r = s[key];
      if (!r) return;
      if (prev && r[0] < prev[1] - EPS) {
        problems.push(
          `segments[${i}].${key} starts at ${r[0]} before segments[${prevIndex}].${key} ends at ${prev[1]}`,
        );
      }
      prev = r;
      prevIndex = i;
    });
  }
}

// Ordering segments. What the layout needs is that, on each side, the
// segments naming that side come in time order; how an `added` segment (B
// only) sits relative to a `removed` one (A only) does not matter, because
// they share no timeline.
//
// That rules out Array.sort with a pairwise comparator. Comparing on a shared
// side and calling segments with no shared side "equal" is not a consistent
// order — X before Y on B, Y "equal" to Z, says nothing about X and Z — and the
// sort then quietly misplaces segments: a new `added` bridge landed after a
// later `added` one on B's timeline, the layout never saw its gap filled, and
// classifying that gap again duplicated it.
//
// So the order is built from the constraints themselves: a segment must come
// before another when it starts earlier on a side they share; otherwise the
// order the segments were given in stands. A document whose constraints
// contradict each other (a pair before another on A but after it on B) keeps
// its given order for the rest, and checkOrder reports it.
export function orderSegments(segments) {
  const n = segments.length;
  const mustPrecede = (x, y) =>
    (x.a && y.a && x.a[0] < y.a[0]) || (x.b && y.b && x.b[0] < y.b[0]);
  const waitingOn = segments.map((segment, i) =>
    segments.reduce((count, other, j) => count + (j !== i && mustPrecede(other, segment) ? 1 : 0), 0),
  );
  const placed = new Array(n).fill(false);
  const ordered = [];
  while (ordered.length < n) {
    // the first segment, in given order, whose predecessors are all placed
    let next = waitingOn.findIndex((count, i) => !placed[i] && count === 0);
    if (next < 0) next = placed.indexOf(false); // contradictory constraints
    placed[next] = true;
    ordered.push(segments[next]);
    segments.forEach((other, j) => {
      if (!placed[j] && mustPrecede(segments[next], other)) waitingOn[j] -= 1;
    });
  }
  return ordered;
}

// Returns { doc, problems }: doc is always usable (bad segments dropped), and
// problems is what to show the user. An empty segment list is valid — it is
// the unclassified twin every session starts in.
export function parseTwinDoc(raw) {
  const problems = [];
  if (!raw || typeof raw !== 'object') return { doc: null, problems: ['not a JSON object'] };
  if (raw.version !== 1) problems.push(`version ${raw.version} is not supported (expected 1)`);

  const a = parseSide(raw.sides?.a, 'a', problems);
  const b = parseSide(raw.sides?.b, 'b', problems);
  if (!a || !b) return { doc: null, problems };

  const rawSegments = Array.isArray(raw.segments) ? raw.segments : [];
  if (!Array.isArray(raw.segments)) problems.push('segments is missing or not an array');

  const segments = orderSegments(
    rawSegments.map((s, i) => parseSegment(s, i, problems)).filter(Boolean),
  );
  checkOrder(segments, problems);

  return {
    doc: {
      version: 1,
      title: typeof raw.title === 'string' && raw.title ? raw.title : 'Untitled twin',
      sides: { a, b },
      segments,
      seededFrom: raw.seededFrom ?? null,
    },
    problems,
  };
}

export function serializeTwinDoc(doc) {
  const side = (s) => ({
    label: s.label,
    url: s.url,
    ...(s.srt ? { srt: s.srt } : {}),
    ...(s.album ? { album: s.album } : {}),
    ...(s.track ? { track: s.track } : {}),
    ai: s.ai,
  });
  return {
    version: 1,
    title: doc.title,
    sides: { a: side(doc.sides.a), b: side(doc.sides.b) },
    segments: doc.segments.map((s) => ({
      kind: s.kind,
      a: s.a,
      b: s.b,
      ...(s.label ? { label: s.label } : {}),
      ...(s.note ? { note: s.note } : {}),
    })),
    ...(doc.seededFrom ? { seededFrom: doc.seededFrom } : {}),
  };
}

// Where a twin document belongs, per SPECIFICATION.md "Naming and location":
// the folder is side A's album — the earlier rendition, the one a user
// browses from — and the file name carries the song and the two renditions,
// so the same song twinned twice never collides.
// A title or a label becomes one path segment: no separators (so a document
// can never be written outside its folder) and no `..` left over.
const slug = (text) =>
  text
    .replace(/[/\\]/g, '-')
    .replace(/\.{2,}/g, '.')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+/, '')
    .trim();

export function twinFileName(doc) {
  const title = slug(doc.title).replace(/[*+]$/, '').trim();
  return `${title} — ${slug(doc.sides.a.label)} vs ${slug(doc.sides.b.label)}.twin.json`;
}

export function twinPath(doc) {
  return `${slug(doc.sides.a.album ?? '_adhoc')}/${twinFileName(doc)}`;
}

// An ad hoc twin: two audio files, nothing classified yet.
export function adHocTwinDoc({ title, a, b }) {
  const side = (s) => ({
    label: s.label ?? '',
    url: s.url,
    srt: null,
    album: null,
    track: null,
    ai: s.ai === true,
  });
  return {
    version: 1,
    title: title ?? 'Untitled twin',
    sides: { a: side(a), b: side(b) },
    segments: [],
    seededFrom: null,
  };
}
