import { useEffect, useState } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";

import { currentPlaylistUrl, showSetsModal, playlistSets, playlistFilter } from "./atoms";
import { factoryFilter } from "./filter";
import { LocalStorage } from "./LocalStorage";
import { SetSelector } from "./SetSelector";
import { Player } from "./Player";

const selectionStorage = new LocalStorage("set-selection");

// Track IDs are built by convertList as url.replace("/", "-")
const makeId = (url) => url.replace("/", "-");

function buildExcludeIds(index, data) {
  if (index === "all") return [];
  const range = data.sets[parseInt(index)].range;
  return data.playlist
    .filter((_, i) => i < range[0] || i > range[1])
    .map((t) => makeId(t.url));
}

export function SetsGate() {
  const playlistUrl = useAtomValue(currentPlaylistUrl);
  const [showModal, setShowModal] = useAtom(showSetsModal);
  const setSets = useSetAtom(playlistSets);
  const [, setFilter] = useAtom(playlistFilter);

  const [albumUrl, setAlbumUrl] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(
    () => selectionStorage.restore().index
  );
  const [fullData, setFullData] = useState(null);

  const [playerReady, setPlayerReady] = useState(
    () => selectionStorage.restore().index === "all"
  );

  useEffect(() => {
    if (!playlistUrl || playlistUrl === "custom:") return;
    setAlbumUrl(playlistUrl);
    fetch(playlistUrl)
      .then((r) => r.json())
      .then((data) => {
        setFullData(data);
        setSets(data.sets ?? null);
      });
  }, [playlistUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!fullData) return;
    if (!fullData.sets) { setPlayerReady(true); return; }
    if (currentIndex === undefined) return; // first visit — wait for gate
    setFilter({ ...factoryFilter(), excludeTitles: buildExcludeIds(currentIndex, fullData) });
    setPlayerReady(true);
  }, [fullData]); // eslint-disable-line react-hooks/exhaustive-deps

  const onSelect = (index) => {
    selectionStorage.save("index", index);
    setCurrentIndex(index);
    setFilter({ ...factoryFilter(), excludeTitles: buildExcludeIds(index, fullData) });
    setShowModal(false);
    setPlayerReady(true);
  };

  const coverUrl = albumUrl ? albumUrl.replace(/\.json$/, ".jpg") : null;
  const sets = fullData?.sets;

  if (!playerReady) {
    return (
      <SetSelector
        mode="gate"
        sets={sets}
        coverUrl={coverUrl}
        canSelect={fullData !== null}
        onSelect={onSelect}
      />
    );
  }

  return (
    <>
      <Player />
      {showModal && sets && (
        <SetSelector
          mode="modal"
          sets={sets}
          coverUrl={coverUrl}
          activeIndex={currentIndex}
          canSelect={true}
          onSelect={onSelect}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}
