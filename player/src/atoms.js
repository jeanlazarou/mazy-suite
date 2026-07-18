import _ from "lodash";
import { atom } from "jotai";

import * as api from "./api";

import { Sequencer } from "./Sequencer";

import { initialLoopMode, OptionsStore } from "./OptionsStore";

import defaultPlaylist from "./data/playlist.json";

import { trackTitle } from "./utils";
import { applyFilter, factoryFilter } from "./filter";
import { loadAlbumsCache } from "./cache";

export const playlist = atom([]);

const playlistFilterAtom = atom(factoryFilter());

export const playlistFilter = atom(
  (get) => get(playlistFilterAtom),
  (get, set, newFilter) => {
    set(playlistFilterAtom, newFilter);

    const playlist = get(currentPlaylist);
    const selected = applyFilter(playlist, newFilter);

    Sequencer.listUpdated(selected);
  }
);

export const playlistFilterActive = atom((get) => {
  const filter = get(playlistFilter);

  return !_.isEqual(filter, factoryFilter());
});

export const currentTitle = atom("");

export const titleOptions = atom([]);

export const customPlaylist = atom({ title: "", playlist: [] });

export const currentPlaylist = atom(
  (get) => get(playlist),
  (get, set, newList) => {
    const filter = get(playlistFilter);
    const selected = applyFilter(newList, filter);

    Sequencer.listUpdated(selected);

    const titles = extractTitles(newList);
    set(titleOptions, titles);

    set(playlist, newList);
  }
);

export const sortedPlaylist = atom((get) => {
  const list = get(currentPlaylist);

  return [...list]
    .filter((track) => !track.error)
    .sort((a, b) => a.title.localeCompare(b.title));
});

function extractTitles(list) {
  return list
    .map((t) => {
      const title = trackTitle(t);

      return {
        key: t.id,
        text: title,
        value: t.id,
      };
    })
    .sort((a, b) => a.text.localeCompare(b.text));
}

const albumsCache = atom(async () => {
  return await loadAlbumsCache()
})

export const currentPlaylistUrl = atom(null);

export const playlistLoader = atom(async (get) => {
  const audiCache = await get(albumsCache);

  let definition;

  let description = { content: "", isHtml: false };

  const url = get(currentPlaylistUrl);

  if (url === "custom:") {
    definition = get(customPlaylist);
  } else if (url) {
    definition = await api.loadPlaylist(url);

    description = await api.loadPlaylistDescription(url, definition);
  } else {
    definition = api.convertList(defaultPlaylist);
  }

  const { title, playlist, trackImage } = definition;

  if (title) document.title = title;

  return { title, playlist, description, trackImage, audiCache };
});

export const requestedTrack = atom(null);

export const songsMetadata = atom({ description: { content: "", isHtml: false }, trackImage: null });

export const viewingDescription = atom(false);

export const showTimeline = atom(false);

export const viewingMobileTransport = atom(false);

export const lyricsActive = atom(OptionsStore.restore().lyricsActive);

export const cardFormat = atom(OptionsStore.restore().cardFormat);

export const snoozeModal = atom(false);

export const screenMode = atom("normal");

export const playbackMode = atom(initialLoopMode());

export const draggableTracks = atom(false);

export const viewingReorder = atom(false);

export const viewingVolumes = atom(false);

export const loadingStatus = atom({
  key: "loadingStatus",
  default: {
    isRetrying: false,
    retryingUrl: null,
    retryAttempt: 0,
    retryDelay: 0,
  },
});

export const showSetsModal = atom(false);

// null = no sets defined; array = sets from playlist JSON
export const playlistSets = atom(null);
