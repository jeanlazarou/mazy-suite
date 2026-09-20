import React, { useMemo } from "react";
import { currentPlaylist } from "./atoms";
import { playingTrack } from "./Sequencer";
import { useAtomValue } from "jotai";

import "./Timeline.css";

function formatDate(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return null;

  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function yearOf(value) {
  const year = new Date(value).getFullYear();

  return Number.isNaN(year) ? null : year;
}

export const Timeline = () => {
  const playlist = useAtomValue(currentPlaylist);
  const currentTrack = useAtomValue(playingTrack);

  // oldest first, and marked wherever the year changes so the rail can carry
  // the years as headings rather than repeating them on every track
  const rows = useMemo(() => {
    const sorted = [...playlist].sort(
      (a, b) => new Date(a.creationDate) - new Date(b.creationDate)
    );

    let previous = null;

    return sorted.map((track) => {
      const year = yearOf(track.creationDate);
      const startsYear = year !== null && year !== previous;

      previous = year ?? previous;

      return { track, year, startsYear };
    });
  }, [playlist]);

  if (rows.length === 0) {
    return <p className="timeline-empty">No tracks available</p>;
  }

  return (
    <ol className="timeline">
      {rows.map(({ track, year, startsYear }) => (
        <React.Fragment key={track.url}>
          {startsYear ? (
            <li className="timeline-year">
              <span>{year}</span>
            </li>
          ) : null}

          <li
            className={`timeline-entry${
              track.url === currentTrack?.url ? " playing" : ""
            }`}
          >
            <p className="timeline-title">{track.title}</p>
            <p className="timeline-meta">
              {formatDate(track.creationDate) ? (
                <span className="timeline-date">
                  {formatDate(track.creationDate)}
                </span>
              ) : null}
              <span className="timeline-authors">
                {track.authors.join(", ")}
              </span>
            </p>
          </li>
        </React.Fragment>
      ))}
    </ol>
  );
};
