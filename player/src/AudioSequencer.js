import { useEffect, useState } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";

import { currentPlaylist, currentTitle } from "./atoms";
import { playlistLoader, songsMetadata } from "./atoms";

import { Sequencer } from "./Sequencer";
import { PlayerStore } from "./PlayerStore";
import { useSequencerReady } from "./Sequencer";

import { historyPush } from "./HistoryMachine";

import { audioDataStore } from "./AudioDataStore";

let loadingList;

const finder = (list, url) => {
  const track = list.find((track) => track.url === url);

  if (!track || track.infoLoaded) return null;

  return track;
};

const updater = (playlistSetter, url, duration, error) => {
  const track = finder(loadingList, url);

  if (!track) return;

  const find = async () => {
    const entry = await audioDataStore.getMetadata(url);

    const data = entry ? entry : {};

    const updated = {
      ...track,
      infoLoaded: true,
      duration,
      error,
      isNew: data.isNew,
      lastModified: data.lastModified,
    };

    const newList = loadingList.map((e) =>
      e.url === updated.url ? updated : e
    );

    loadingList = newList;

    playlistSetter(newList);
  };

  find();
};

export function AudioSequencer() {
  const [store, setStore] = useState();

  const isReady = useSequencerReady();
  const push = useSetAtom(historyPush);
  const [, setTitle] = useAtom(currentTitle);
  const [playlist, setPlaylist] = useAtom(currentPlaylist);
  const [, setPlaylistMetadata] = useAtom(songsMetadata);

  const { title, description, trackImage, playlist: initialPlaylist, audiCache } = useAtomValue(
    playlistLoader
  );

  useEffect(() => {
    Sequencer.create(initialPlaylist, audiCache);

    setTitle(title);
    setPlaylist(initialPlaylist);
    setPlaylistMetadata({ description, trackImage });

    loadingList = initialPlaylist;

    return () => Sequencer.dispose();
  }, [
    initialPlaylist,
    setPlaylist,
    title,
    setTitle,
    description,
    trackImage,
    setPlaylistMetadata,
    audiCache,
  ]);

  useEffect(() => {
    const loaded = ({ detail: { url, duration } }) => {
      updater(setPlaylist, url, duration, false);
    };
    const failed = ({ detail: { url } }) => {
      updater(setPlaylist, url, 0, true);
    };

    document.addEventListener("sequencer:loaded", loaded);
    document.addEventListener("sequencer:load-error", failed);

    return () => {
      document.removeEventListener("sequencer:loaded", loaded);
      document.removeEventListener("sequencer:load-error", failed);
    };
  }, [setPlaylist]);

  useEffect(() => {
    if (!isReady) return;
    if (!playlist.every((track) => track.infoLoaded)) return;

    if (!store) {
      const store = new PlayerStore();

      setStore(store);

      const { playlist: stored, unknown } = store.restore({
        title,
        playlist,
      });

      if (!unknown) {
        setPlaylist(stored);
        push(playlist);
      }
    } else {
      store.save({ title, playlist });
    }
  }, [isReady, push, playlist, store, title, setPlaylist]);

  return null;
}
