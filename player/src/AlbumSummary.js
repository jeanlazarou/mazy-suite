import React, { useRef, useState } from "react";
import Popover from "@mui/material/Popover";

import { SIcon } from "./ui";
import { Spacer } from "./Spacer";

import { openPlayer } from "./api";
import { useIsMobile } from "./utils";

export function AlbumSummary({ album, onClose }) {
  const summaryRef = useRef();
  const [bigCoverAnchor, setBigCoverAnchor] = useState(null);

  const isMobileDevice = useIsMobile();

  const { playlist } = album;

  return (
    <>
      <div className="album-summary">
        <h3 className="album-summary-header">
          {playlist.title}

          <SIcon
            className="external-link"
            name="external alternate"
            style={{ cursor: "pointer" }}
            onClick={() => openPlayer(album)}
          />

          <SIcon
            name="window close outline"
            onClick={onClose}
            style={{ fontSize: 20, float: "right", cursor: "pointer" }}
          />
        </h3>

        <div className="album-titles">
          <div>
            <ol>
              {playlist.playlist.map((track) => (
                <li key={track.id}>
                  <p>{track.title}</p>
                </li>
              ))}
            </ol>
          </div>

          <Spacer width={30} />

          <div ref={summaryRef}>
            {isMobileDevice ? (
              <img alt="album cover" src={`${album.image}`} />
            ) : (
              <>
                <img
                  alt="album cover"
                  src={`${album.image}`}
                  style={{ cursor: "pointer" }}
                  onClick={(ev) => setBigCoverAnchor(ev.currentTarget)}
                />
                <Popover
                  open={Boolean(bigCoverAnchor)}
                  anchorEl={bigCoverAnchor}
                  onClose={() => setBigCoverAnchor(null)}
                  anchorOrigin={{ vertical: "center", horizontal: "center" }}
                  transformOrigin={{ vertical: "center", horizontal: "center" }}
                >
                  <img
                    alt="album cover"
                    src={`${album.bigImage}`}
                    className="album-big"
                    onClick={() => setBigCoverAnchor(null)}
                  />
                </Popover>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
