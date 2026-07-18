import { sortedIndexBy } from "lodash";
import React, { useEffect, useState } from "react";
import { atom, useAtomValue } from "jotai";
import { atomFamily } from "jotai/utils";

import { loadLyrics } from "./api";
import { lyricsActive } from "./atoms";
import { playingTrack } from "./Sequencer";
import { isPositionAfterTiming } from "./utils";

const emptySong = (title) => {
  return {
    title: title,
    timings: [],
    lyrics: [],
  };
};

export const songsLyrics = atomFamily((title) =>
  atom(async () => {
    if (!title) return emptySong(title);

    const lyrics = await loadLyrics(title);

    return lyrics ? lyrics : emptySong(title);
  })
);

export function LyricVerse({ title }) {
  const song = useAtomValue(songsLyrics(title));
  const current = useAtomValue(playingTrack);

  const [verse, setVerse] = useState("-");

  useEffect(() => {
    const positionChange = ({ detail: { position } }) => {
      const i = sortedIndexBy(song.timings, [position], (e) => e[0]);

      let timing = song.timings[i];

      if (timing && timing[1] !== null) {
        if (isPositionAfterTiming(position, timing[0])) {
          setVerse(timing[1] ? song.lyrics[timing[1] - 1] : "-");

          return;
        }
      } else {
        timing = song.timings[i - 1];

        if (timing && timing[1] !== null) {
          if (isPositionAfterTiming(position, timing[0])) {
            setVerse(timing[1] ? song.lyrics[timing[1] - 1] : "-");

            return;
          }
        }
      }

      setVerse("-");
    };

    document.addEventListener("sequencer:position", positionChange);

    return () => {
      document.removeEventListener("sequencer:position", positionChange);
    };
  }, [current.title, current.url, song]);

  return (
    <p style={verse === "-" ? { color: "#1b1c1d" } : { textAlign: "center" }}>
      {verse}
    </p>
  );
}

export function LyricsSubtitle() {
  const showLyrics = useAtomValue(lyricsActive);
  const current = useAtomValue(playingTrack);

  return showLyrics ? (
    <div className="lyrics">
      <div className="message">
        <React.Suspense fallback={null}>
          <LyricVerse title={current.title} />
        </React.Suspense>
      </div>
    </div>
  ) : null;
}
