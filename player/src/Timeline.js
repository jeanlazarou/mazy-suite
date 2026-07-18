import React, { useEffect, useMemo, useRef } from "react";
import { currentPlaylist } from "./atoms";
import { playingTrack } from "./Sequencer";
import { useAtomValue } from "jotai";

import "./Timeline.css";

export const Timeline = () => {
  const trackId = useRef(null);
  const playlist = useAtomValue(currentPlaylist);
  const currentTrack = useAtomValue(playingTrack);

  const sortedTracks = useMemo(() => {
    return [...playlist].sort(
      (a, b) => new Date(a.creationDate) - new Date(b.creationDate)
    );
  }, [playlist]);

  useEffect(() => {
    if (trackId.current !== currentTrack?.url) {
      const doneTrack = document.querySelector(".timeline-track.playing");
      if (doneTrack) {
        doneTrack.classList.remove("playing");
      }

      const index = sortedTracks.findIndex((t) => t.url === currentTrack?.url);
      const newTrack = document.querySelector(
        `.timeline-track[data-index='${index}']`
      );

      if (newTrack) {
        newTrack.classList.add("playing");
      }

      trackId.current = currentTrack?.url;
    }
  }, [sortedTracks, currentTrack?.url]);

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  if (!playlist || playlist.length === 0) {
    return <div className="no-tracks">No tracks available</div>;
  }

  return (
    <div className="timeline-container">
      <div className="timeline-line"></div>
      {sortedTracks.map((track, index) => (
        <div
          key={track.url}
          className={`timeline-track ${index % 2 === 1 ? "right" : "left"} ${
            track.url === currentTrack?.url ? "playing" : ""
          }`}
          data-index={index}
        >
          <div className="timeline-dot"></div>
          <div className="timeline-content">
            <div className="track-title">{track.title}</div>
            <div className="track-artists">{track.authors.join(", ")}</div>
            <div className="track-date">{formatDate(track.creationDate)}</div>
          </div>
        </div>
      ))}
    </div>
  );
};
