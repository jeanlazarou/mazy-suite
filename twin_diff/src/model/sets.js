// Sets: the twins of `twins.json` that share a `set` name, in index order —
// several reworks of one song, or the songs of one reworked album, walked
// through one after the other the way a diff viewer steps through files.
//
// Pure — no DOM.

// Where a twin sits in its set: { set, index, count, previous, next }, the
// neighbours being index entries (or null at the ends). Null when the twin is
// not in the index or belongs to no set — there is nothing to step through.
export function placeInSet(twins, file) {
  const entry = twins.find((twin) => twin.file === file);
  if (!entry || !entry.set) return null;
  const members = twins.filter((twin) => twin.set === entry.set);
  const index = members.findIndex((twin) => twin.file === file);
  return {
    set: entry.set,
    index,
    count: members.length,
    previous: members[index - 1] ?? null,
    next: members[index + 1] ?? null,
  };
}
