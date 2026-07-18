import { MICRO_FADE, FADE_SHAPES, REGION_MODES } from './envelope';

// The mix document (mix.json) — non-destructive, references audio by file
// name. Pure data transforms only: no store, no DOM, no audio imports.
// Internal envelope points {id,t,v} ↔ document [[t, v]] pairs.

const round = (x) => Math.round(x * 10000) / 10000;
const clamp01 = (x) => Math.max(0, Math.min(1, x));

export function slugify(name) {
  return (
    String(name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'track'
  );
}

function serializeLane(lane) {
  return {
    envelope: lane.env.map((p) => [round(p.t), round(clamp01(p.v))]),
    regions: lane.regions.map((r) => ({
      start: round(r.start),
      end: round(r.end),
      fade: round(r.fade),
      shape: FADE_SHAPES.includes(r.shape) ? r.shape : 'linear',
      mode: REGION_MODES.includes(r.mode) ? r.mode : 'mute',
      ...(r.enabled === false ? { enabled: false } : {}),
    })),
  };
}

const uniqueSlug = (name, used) => {
  let id = slugify(name);
  while (used.has(id)) id = `${id}-2`;
  used.add(id);
  return id;
};

export function serializeMix({ tracks, groups = [], master, song = null, markersSource = null }) {
  const groupSlugs = new Map(); // internal group id -> doc slug
  const usedGroupIds = new Set();
  const groupDocs = {};
  for (const g of groups) {
    const slug = uniqueSlug(g.name, usedGroupIds);
    groupSlugs.set(g.id, slug);
    groupDocs[slug] = { envelope: serializeLane(g).envelope };
  }

  const used = new Set();
  const stems = [];
  const trackDocs = {};
  for (const t of tracks) {
    const id = uniqueSlug(t.name, used);
    const stem = { id, file: t.fileName ?? null };
    if (t.group && groupSlugs.has(t.group)) stem.group = groupSlugs.get(t.group);
    stems.push(stem);
    trackDocs[id] = {
      ...serializeLane(t),
      eq: { low: t.eq?.low ?? 0, mid: t.eq?.mid ?? 0, high: t.eq?.high ?? 0 },
      ...(t.pan?.length
        ? { pan: t.pan.map((p) => [round(p.t), round(Math.max(-1, Math.min(1, p.v)))]) }
        : {}),
      mute: !!t.mute,
    };
  }
  return {
    version: 1,
    ...(song ? { song: { album: song.album, title: song.title } } : {}),
    stems,
    tracks: trackDocs,
    groups: groupDocs,
    master: { envelope: serializeLane(master).envelope },
    ...(markersSource ? { markers: { source: markersSource } } : {}),
  };
}

const num = (x) => {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
};

function parseLane(entry) {
  const envelope = (Array.isArray(entry?.envelope) ? entry.envelope : [])
    .filter((p) => Array.isArray(p) && p.length >= 2)
    .map(([t, v]) => [Math.max(0, num(t)), clamp01(num(v))])
    .sort((a, b) => a[0] - b[0]);
  const regions = (Array.isArray(entry?.regions) ? entry.regions : [])
    .map((r) => ({
      start: Math.max(0, num(r?.start)),
      end: Math.max(0, num(r?.end)),
      fade: r?.fade === undefined ? MICRO_FADE : Math.max(0, num(r.fade)),
      shape: FADE_SHAPES.includes(r?.shape) ? r.shape : 'linear',
      mode: REGION_MODES.includes(r?.mode) ? r.mode : 'mute',
      enabled: r?.enabled !== false,
    }))
    .filter((r) => r.end > r.start);
  return { envelope, regions };
}

const parsePan = (pan) => (Array.isArray(pan) ? pan : [])
  .filter((p) => Array.isArray(p) && p.length >= 2)
  .map(([t, v]) => [Math.max(0, num(t)), Math.max(-1, Math.min(1, num(v)))])
  .sort((a, b) => a[0] - b[0]);

const clampDb = (x) => Math.max(-12, Math.min(12, num(x)));

const parseEq = (eq) => ({
  low: clampDb(eq?.low ?? 0),
  mid: clampDb(eq?.mid ?? 0),
  high: clampDb(eq?.high ?? 0),
});

// Validate + normalize a parsed mix.json into plain data the open flow can
// apply. Unknown stems/fields are preserved in spirit by being ignored, not
// rejected (a doc written by a later milestone still opens).
export function parseMixDoc(doc) {
  if (!doc || typeof doc !== 'object') throw new Error('Not a mix document');
  if (doc.version !== 1) throw new Error(`Unsupported mix document version: ${doc.version}`);
  const groupsDoc = doc.groups && typeof doc.groups === 'object' ? doc.groups : {};
  const groups = Object.entries(groupsDoc).map(([id, entry]) => ({
    id,
    envelope: parseLane(entry).envelope,
  }));
  const stems = (Array.isArray(doc.stems) ? doc.stems : [])
    .filter((s) => s && typeof s.id === 'string')
    .map((s) => ({
      id: s.id,
      file: typeof s.file === 'string' ? s.file : null,
      group: typeof s.group === 'string' && groupsDoc[s.group] ? s.group : null,
    }));
  const tracks = {};
  for (const stem of stems) {
    const entry = doc.tracks?.[stem.id];
    tracks[stem.id] = {
      ...parseLane(entry),
      eq: parseEq(entry?.eq),
      pan: parsePan(entry?.pan),
      mute: !!entry?.mute,
    };
  }
  const song = doc.song && typeof doc.song === 'object' && typeof doc.song.title === 'string'
    ? { album: typeof doc.song.album === 'string' ? doc.song.album : null, title: doc.song.title }
    : null;
  const markersSource = typeof doc.markers?.source === 'string' ? doc.markers.source : null;
  return { stems, tracks, groups, master: parseLane(doc.master), song, markersSource };
}
