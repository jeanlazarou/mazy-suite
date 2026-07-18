import { atom } from "jotai";
import { atomFamily } from "jotai/utils";

export const futureOrderChanged = atom(false);

export const futureOrderData = atom({ current: 0, indexes: {}, original: [] });

export const currentOrder = atom(null, (get, set, playlist) => {
  set(futureOrderData, {
    current: 0,
    original: [...playlist],
    indexes: listToIndexes(playlist),
  });
});

export const futureOrder = atomFamily((url) =>
  atom(
    (get) => {
      const data = get(futureOrderData);

      return data.indexes[url];
    },
    (get, set) => {
      const previous = get(futureOrderData);
      const current = previous.current;

      if (current > previous.original.length) return;

      set(futureOrderChanged, true);

      const prevIndex = previous.indexes[url];

      const updated = {
        index: prevIndex.index,
        futureIndex: current,
        changed: true,
      };

      const indexes = assignFutureIndexes(
        previous.original,
        previous.indexes,
        url,
        updated
      );

      set(futureOrderData, {
        current: current + 1,
        original: previous.original,
        indexes,
      });
    }
  )
);

const listToIndexes = (playlist) => {
  return playlist.reduce((acc, e, i) => {
    acc[e.url] = { index: i, futureIndex: i, changed: false };
    return acc;
  }, {});
};

function assignFutureIndexes(original, byUrl, updatedUrl, updated) {
  const orderedList = Object.keys(byUrl).reduce((acc, url) => {
    if (url === updatedUrl) {
      acc[updated.futureIndex] = updated;

      return acc;
    }

    const e = byUrl[url];

    if (e.changed) acc[e.futureIndex] = e;

    return acc;
  }, []);

  return original.reduce((indexes, track) => {
    const copy = track.url === updatedUrl ? updated : { ...byUrl[track.url] };

    if (!copy.changed) {
      const free = orderedList.findIndex((e) => e === undefined);

      if (free < 0) {
        copy.futureIndex = orderedList.length;
        orderedList.push(copy);
      } else {
        orderedList[free] = copy;
        copy.futureIndex = free;
      }
    }

    indexes[track.url] = copy;

    return indexes;
  }, {});
}

export function reorder(playlist, indexes) {
  const byUrl = playlist.reduce((acc, track) => {
    acc[track.url] = track;
    return acc;
  }, {});

  const orderedList = Object.keys(indexes).reduce((acc, url) => {
    acc[indexes[url].futureIndex] = byUrl[url];
    return acc;
  }, []);

  return orderedList;
}
