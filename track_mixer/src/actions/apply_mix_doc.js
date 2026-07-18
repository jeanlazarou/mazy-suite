import { useMixStore, MASTER_ID, withLane } from '../state/store';
import { slugify } from '../model/mixdoc';
import { GROUP_COLORS } from './create_group';
import { uid } from './ids';

// Shared by open_files and open_suite_song: apply a parsed mix document
// onto the currently loaded tracks (matched by file name, then name slug).

const toPoints = (envelope) => envelope.map(([t, v]) => ({ id: uid('pt'), t, v }));
const toRegions = (regions) => regions.map((r) => ({ id: uid('rgn'), ...r }));
const titleCase = (slug) => slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const matchTrack = (tracks, stem) =>
  tracks.find((t) => t.fileName && t.fileName === stem.file) ??
  tracks.find((t) => slugify(t.name) === stem.id);

export function applyMixDoc(doc) {
  const groupIdBySlug = new Map();
  useMixStore.setState({
    groups: doc.groups.map((g, i) => {
      const id = uid('grp');
      groupIdBySlug.set(g.id, id);
      return {
        id,
        name: titleCase(g.id),
        color: GROUP_COLORS[i % GROUP_COLORS.length],
        isGroup: true,
        env: toPoints(g.envelope),
        regions: [],
      };
    }),
    collapsedGroups: {},
  });
  const s = useMixStore.getState();
  for (const stem of doc.stems) {
    const track = matchTrack(s.tracks, stem);
    const entry = doc.tracks[stem.id];
    if (!track || !entry) continue;
    useMixStore.setState((st) => withLane(st, track.id, (t) => ({
      ...t,
      env: toPoints(entry.envelope),
      regions: toRegions(entry.regions),
      pan: toPoints(entry.pan ?? []),
      mute: entry.mute,
      eq: entry.eq,
      group: stem.group ? groupIdBySlug.get(stem.group) ?? null : null,
    })));
  }
  useMixStore.setState((st) => withLane(st, MASTER_ID, (m) => ({
    ...m,
    env: toPoints(doc.master.envelope),
  })));
}
