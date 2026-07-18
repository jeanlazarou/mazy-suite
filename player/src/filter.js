function accept(filter, track) {
  let keep = filter.enabledTracksOnly ? track.enabled : true;

  if (keep && typeof filter.minRating === "number") {
    keep = track.rating >= filter.minRating;
  }

  if (keep && filter.excludeTitles && filter.excludeTitles.length > 0) {
    keep = !filter.excludeTitles.includes(track.id);
  }

  if (keep && filter.authorsMatcher && filter.authorsMatcher.length > 0) {
    keep = track.authors.some((author) =>
      filter.authorsMatcher.includes(author)
    );
  }

  return keep;
}

export const factoryFilter = () => {
  return {
    enabledTracksOnly: false,
    excludeTitles: [],
    authorsMatcher: [],
    minRating: null,
  };
};

export function selectedTrackIds(tracks, filter) {
  return new Set(tracks.filter((t) => accept(filter, t)).map((t) => t.id));
}

export function applyFilter(tracks, filter) {
  return tracks.filter((t) => accept(filter, t));
}
