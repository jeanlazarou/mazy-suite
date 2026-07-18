import { debounce } from "lodash";
import React, { useEffect, useMemo, useState } from "react";
import Autocomplete from "@mui/material/Autocomplete";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import InputAdornment from "@mui/material/InputAdornment";
import Rating from "@mui/material/Rating";
import TextField from "@mui/material/TextField";

import Fuse from "fuse.js";

import { MenuBar, MenuBarItem, SIcon, SIconGroup } from "./ui";

import { CustomListModal } from "./CustomListModal";
import { createSaveLink } from "./utils";

import "./CustomListBuilder.css";
import { ClearableRating } from "./ClearableRating";

const fuzzySearchList = (playlists) => {
  const allSongs = playlists
    .reduce((acc, list) => {
      list.playlist.playlist.forEach((song) => {
        acc.push({ ...song, album: list });
      });

      return acc;
    }, [])
    .sort((a, b) => a.title.localeCompare(b.title));

  const fuse = new Fuse(allSongs, {
    keys: ["title"],
    threshold: 0.4,
    location: 3,
    distance: 30,
  });

  return [fuse, allSongs];
};

const applyFilter = debounce(
  (fuse, filter) => {
    const accepted = fuse.search(filter).reduce((set, e) => {
      set.add(e.item.id);

      return set;
    }, new Set());

    return (id) => accepted.has(id);
  },
  50,
  { leading: true }
);

function initialSet(defaultList) {
  const set = new Set();

  if (!defaultList) return set;

  defaultList.playlist.forEach((song) => {
    set.add(song.id);
  });

  return set;
}

export function CustomListBuilder({ playlists, open, onDone, defaultList }) {
  const [titleFilter, setTitleFilter] = useState("");
  const [albumFilter, setAlbumFilter] = useState("");
  const [authorFilter, setAuthorFilter] = useState("");
  const [selected, setSelected] = useState(initialSet(defaultList));
  const [renderedItems, setRenderedItems] = useState([]);
  const [requiredStars, setRequiredStars] = useState(null);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(
    defaultList && defaultList.title ? defaultList.title : "Untitled"
  );

  const [fuse, allSongs] = useMemo(() => fuzzySearchList(playlists), [
    playlists,
  ]);

  useEffect(() => {
    const items = allSongs.map((song) => <SongCard key={song.id} song={song} />);

    setRenderedItems(items.slice(0, 15));

    setTimeout(() => setRenderedItems(items), 3000);
  }, [allSongs]);

  const acceptFilter = useMemo(() => {
    if (titleFilter.length > 1) return applyFilter(fuse, titleFilter);

    return () => true;
  }, [titleFilter, fuse]);

  const acceptStars = useMemo(() => {
    return requiredStars === null
      ? () => true
      : (song) => song.rating === requiredStars;
  }, [requiredStars]);

  const acceptAlbum = useMemo(() => {
    return albumFilter.length > 1
      ? (song) => song.album.playlist.title === albumFilter
      : () => true;
  }, [albumFilter]);

  const acceptAuthor = useMemo(() => {
    return authorFilter.length > 1
      ? (song) => song.authors.some((author) => author === authorFilter)
      : () => true;
  }, [authorFilter]);

  const accept = useMemo(
    () => (song) =>
      acceptStars(song) &&
      acceptFilter(song.id) &&
      acceptAuthor(song) &&
      acceptAlbum(song),
    [acceptAlbum, acceptAuthor, acceptFilter, acceptStars]
  );

  const authors = useMemo(() => {
    const authors = new Set();

    allSongs.forEach((song) => {
      song.authors.forEach((author) => {
        if (authors.has(author)) return;

        authors.add(author);
      });
    });

    return [...authors.values()].sort().map((author) => ({
      key: author,
      text: author,
      value: author,
    }));
  }, [allSongs]);

  const albums = useMemo(() => {
    const albums = new Set();

    playlists.forEach((album) => albums.add(album.playlist.title));

    return [...albums.values()].sort().map((title) => ({
      key: title,
      text: title,
      value: title,
    }));
  }, [playlists]);

  const [nbSongs, nbMatchingSongs] = useMemo(
    () => [allSongs.length, allSongs.filter(accept).length],
    [allSongs, accept]
  );

  if (!open) return null;

  const startPlay = () => {
    const [playlist] = createSaveLink("Untitled", allSongs, selected);

    onDone(playlist);
  };

  return (
    <div className="custom-list-builder">
      <SearchBar
        albums={albums}
        authors={authors}
        albumFilter={albumFilter}
        authorFilter={authorFilter}
        setAlbumFilter={setAlbumFilter}
        setAuthorFilter={setAuthorFilter}
        titleFilter={titleFilter}
        setTitleFilter={setTitleFilter}
        requiredStars={requiredStars}
        setRequiredStars={setRequiredStars}
        onSelectAll={() => {
          const newSet = new Set(selected);

          allSongs.forEach((song) => {
            if (accept(song)) newSet.add(song.id);
          });

          setSelected(newSet);
        }}
        onUnselectAll={() => {
          const newSet = new Set(selected);

          allSongs.forEach((song) => {
            if (accept(song)) newSet.delete(song.id);
          });

          setSelected(newSet);
        }}
        nbSongs={nbSongs}
        nbMatchingSongs={nbMatchingSongs}
      />

      <div className="builder-content" style={{ overflow: "scroll" }}>
        <ul className="song-list">
          {allSongs.map((song, i) => {
            return (
              <li
                key={song.id}
                className="song-list-item"
                style={{ display: accept(song) ? "block" : "none" }}
              >
                <span style={{ float: "left" }}>
                  <Checkbox
                    key={song.id}
                    checked={selected.has(song.id)}
                    onClick={() => {
                      const newSet = new Set(selected);

                      if (newSet.has(song.id)) {
                        newSet.delete(song.id);
                      } else {
                        newSet.add(song.id);
                      }

                      setSelected(newSet);
                    }}
                  />
                </span>

                {renderedItems[i]}
              </li>
            );
          })}
        </ul>
      </div>

      <StatusBar
        songs={allSongs}
        selected={selected}
        onClose={() => onDone()}
        onPlay={() => startPlay()}
        onSave={() => setSaving(true)}
      />

      <CustomListModal
        name={name}
        setName={setName}
        open={saving}
        onClose={() => setSaving(false)}
        allSongs={allSongs}
        selected={selected}
      />
    </div>
  );
}

function SongCard({ song }) {
  return (
    <>
      <span style={{ float: "right" }}>
        <Rating max={5} size="small" value={song.rating || 0} readOnly />
      </span>
      <img
        src={song.album.image}
        alt=""
        style={{
          width: 42,
          height: 42,
          borderRadius: "50%",
          objectFit: "cover",
          verticalAlign: "middle",
          margin: "0 10px",
        }}
      />
      <span style={{ display: "inline-block", verticalAlign: "middle" }}>
        <strong style={{ display: "block" }}>{song.title}</strong>
        {song.authors.join(", ")}
        <div style={{ opacity: 0.6 }}>{song.album.playlist.title}</div>
      </span>
    </>
  );
}

function StatusBar({ selected, onClose, onPlay, onSave }) {
  return (
    <MenuBar>
      <MenuBarItem>
        <div>
          {selected.size === 0
            ? ""
            : selected.size === 1
            ? `${selected.size} song`
            : `${selected.size} songs`}
        </div>
      </MenuBarItem>
      <MenuBarItem position="right">
        <div style={{ display: "flex", gap: 8 }}>
          <Button
            variant="contained"
            color="primary"
            startIcon={<SIcon name="x" />}
            onClick={onClose}
          >
            Close
          </Button>
          <Button
            variant="contained"
            color="success"
            startIcon={<SIcon name="save" />}
            onClick={onSave}
          >
            Save
          </Button>
          <Button
            variant="contained"
            color="error"
            startIcon={<SIcon name="play" />}
            onClick={onPlay}
          >
            Play
          </Button>
        </div>
      </MenuBarItem>
    </MenuBar>
  );
}

function SearchBar({
  albums,
  authors,
  albumFilter,
  authorFilter,
  setAlbumFilter,
  setAuthorFilter,
  titleFilter,
  setTitleFilter,
  requiredStars,
  setRequiredStars,
  onSelectAll,
  onUnselectAll,
  nbSongs,
  nbMatchingSongs,
}) {
  const [allChecked, setAllChecked] = useState(false);

  const hasFilter =
    requiredStars !== null ||
    authorFilter !== "" ||
    titleFilter !== "" ||
    albumFilter !== "";

  useEffect(() => {
    if (!hasFilter) setAllChecked(false);
  }, [hasFilter]);

  return (
    <MenuBar>
      <MenuBarItem>
        <Checkbox
          disabled={!hasFilter}
          checked={hasFilter ? allChecked : false}
          onChange={
            hasFilter
              ? (ev) => {
                  setAllChecked(ev.target.checked);
                  ev.target.checked ? onSelectAll() : onUnselectAll();
                }
              : undefined
          }
        />
      </MenuBarItem>

      <MenuBarItem
        onClick={() => {
          setTitleFilter("");
          setAlbumFilter("");
          setAuthorFilter("");
          setRequiredStars(null);
        }}
        disabled={!hasFilter}
      >
        {hasFilter ? (
          <SIconGroup>
            <SIcon name="filter" color="blue" />
            <SIcon
              name="remove"
              color="blue"
              style={{
                position: "absolute",
                right: "-0.3em",
                bottom: "-0.3em",
                fontSize: "0.6em",
              }}
            />
          </SIconGroup>
        ) : (
          <SIcon name="filter" />
        )}
      </MenuBarItem>

      <MenuBarItem>
        <Autocomplete
          options={albums.map((a) => a.value)}
          value={albumFilter || null}
          size="small"
          sx={{ width: 220 }}
          onChange={(_ev, value) => setAlbumFilter(value ?? "")}
          renderInput={(params) => (
            <TextField {...params} placeholder="Search album..." />
          )}
        />
      </MenuBarItem>
      <MenuBarItem>
        <TextField
          size="small"
          value={titleFilter}
          placeholder="Search song..."
          onChange={(ev) => setTitleFilter(ev.target.value)}
          slotProps={{
            input: {
              endAdornment: (
                <InputAdornment position="end">
                  <SIcon
                    name="x"
                    style={{ cursor: "pointer" }}
                    onClick={() => setTitleFilter("")}
                  />
                </InputAdornment>
              ),
            },
          }}
        />
      </MenuBarItem>
      <MenuBarItem>
        <ClearableRating
          value={requiredStars}
          onChange={setRequiredStars}
          style={{ width: 160 }}
        />
      </MenuBarItem>
      <MenuBarItem>
        <Autocomplete
          options={authors.map((a) => a.value)}
          value={authorFilter || null}
          size="small"
          sx={{ width: 220 }}
          onChange={(_ev, value) => setAuthorFilter(value ?? "")}
          renderInput={(params) => (
            <TextField {...params} placeholder="Search author..." />
          )}
        />
      </MenuBarItem>

      <MenuBarItem position="right">
        <div>{hasFilter ? `${nbMatchingSongs} / ${nbSongs}` : null}</div>
      </MenuBarItem>
    </MenuBar>
  );
}
