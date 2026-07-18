import { useState } from "react";
import Collapse from "@mui/material/Collapse";
import Tooltip from "@mui/material/Tooltip";
import MusicNoteIcon from "@mui/icons-material/MusicNote";

function AlbumTitle({ title, image, onClick }) {
  return (
    <h3 className="album-title" onClick={onClick}>
      <Tooltip
        enterDelay={1000}
        placement="right"
        title={<img src={image} alt="" width={200} />}
      >
        <img src={image} alt="" width="10%" />
      </Tooltip>
      <div>{title}</div>
    </h3>
  );
}

function TrackTitle({ track, onClick }) {
  return (
    <li className="track-title">
      <MusicNoteIcon fontSize="inherit" />
      <span onClick={onClick}>{track.title}</span>
    </li>
  );
}

function Album({ album, active, onClick, onSelectTrack }) {
  return (
    <>
      <AlbumTitle
        title={album.playlist.title}
        image={album.image}
        onClick={onClick}
      />

      <Collapse in={active}>
        <ol>
          {album.playlist.playlist.map((track) => {
            return (
              <TrackTitle
                key={track.id}
                track={track}
                onClick={() => onSelectTrack(track)}
              />
            );
          })}
        </ol>
      </Collapse>
    </>
  );
}

export function AlbumsList({ albums, onSelectTrack }) {
  const [index, setIndex] = useState(-1);

  return (
    <div>
      {albums.map((album, i) => (
        <Album
          key={album.id}
          album={album}
          active={index === i}
          onSelectTrack={onSelectTrack}
          onClick={() => (index === i ? setIndex(-1) : setIndex(i))}
        />
      ))}
    </div>
  );
}
