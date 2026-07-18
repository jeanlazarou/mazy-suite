import { atom, useAtom, useAtomValue } from "jotai";
import React, { useMemo, useState } from "react";
import Rating from "@mui/material/Rating";

import { SIcon, SIconGroup, SLabel } from "./ui";
import { bestForegroundColor, loadCustomPlaylist, useIsMobile } from "./utils";

import { AlbumsCounter } from "./AlbumsCounter";
import { AlbumSummary } from "./AlbumSummary";
import { Popup } from "./Popup";
import { AlbumsMenu } from "./AlbumsMenu";
import { VersionCard } from "./VersionCard";
import { MenuItem } from "./MenuItem";
import { AlbumTiles } from "./AlbumTiles";

const albumViewOptions = atom({ showDetail: false });

function AlbumDetail({ nbSongs, rating }) {
  const options = useAtomValue(albumViewOptions);

  return (
    options.showDetail && (
      <>
        <div
          style={{
            position: "absolute",
            bottom: 2,
            right: 2,
          }}
        >
          <Rating value={rating || 0} max={5} size="small" readOnly />
        </div>
        <div
          style={{
            position: "absolute",
            bottom: 66,
            right: 4,
          }}
        >
          <SLabel size="mini">{nbSongs}</SLabel>
        </div>
      </>
    )
  );
}

function Tag({ color }) {
  return (
    <div
      style={{
        backgroundColor: color,
        width: 13,
        height: 13,
        borderRadius: "50%",
        position: "absolute",
        bottom: 5,
        right: 5,
      }}
    />
  );
}

function AlbumCard({ data, rating, index, onClick }) {
  const color = data.displayColor
    ? data.displayColor
    : data.color
      ? data.color
      : "white";

  const colors = {
    backgroundColor: color,
    color: bestForegroundColor(data.color),
  };

  return (
    <div className="card" style={colors} onClick={() => onClick(index)}>
      <div className="image">
        <img src={data.image} alt="" style={{ width: "100%", display: "block" }} />
      </div>
      <div className="content">
        <div className="header" style={colors}>
          {data.playlist.title}
          <AlbumDetail
            rating={rating}
            nbSongs={data.playlist.playlist.length}
          />
        </div>
        <div className="meta" style={colors}>{data.period.human}</div>
        <Tag color={data.color} />
      </div>
    </div>
  );
}

function AllAlbums({ list, onClick, ratings }) {
  const isMobileDevice = useIsMobile();

  if (isMobileDevice) return <AlbumTiles list={list} onClick={onClick} />

  return list.map((playlist, i) => (
    <AlbumCard
      index={i}
      key={playlist.id}
      data={playlist}
      onClick={onClick}
      album={playlist}
      rating={ratings[playlist.id]}
    />
  ))

}

function accept(albumRatings, album, filter) {
  const sizeAccepted = filter.showEmpty || album.playlist.playlist.length > 0;
  
  const colorAccepted =
    !filter.color ||
    (album.color ? album.color === filter.color : filter.color === "white");

  const ratingAccepted =
    !filter.rating || albumRatings[album.id] === filter.rating;

  return colorAccepted && ratingAccepted && sizeAccepted;
}

function albumRating(albums) {
  const ratings = {};

  albums.forEach((album) => {
    const ratedSongs = album.playlist.playlist.filter((song) => song.rating);

    const albumRating = ratedSongs.reduce((rating, song) => {
      return (rating ? rating : 0) + song.rating;
    }, undefined);

    ratings[album.id] = albumRating
      ? Math.round(albumRating / ratedSongs.length)
      : undefined;
  });

  return ratings;
}

export function AlbumsList({
  availableColors,
  sortedList,
  onCreate,
  onLoad,
  onPlay,
}) {
  const [currentAlbum, setCurrentAlbum] = useState();
  const [showingSummary, showSummary] = useState(false);
  const [albumRatings, setAlbumRatings] = useState({});
  const [filter, setFilter] = useState({
    color: undefined,
    value: null,
    rating: null,
    showEmpty: false,
  });

  const [options, setOptions] = useAtom(albumViewOptions);

  const onClick = (index) => {
    showSummary(true);
    setCurrentAlbum(index);
  };

  const onClose = (_index) => {
    showSummary(false);
  };

  const filtered = sortedList.filter((album) =>
    accept(albumRatings, album, filter)
  );

  useMemo(() => {
    setAlbumRatings(albumRating(sortedList));
  }, [sortedList]);

  return (
    <>
      <AlbumsCounter
        filter={filter}
        count={filtered.length}
        colors={availableColors}
        onFilter={(value, color, rating, showEmpty) => setFilter({ value, color, rating, showEmpty })}
      />

      <AlbumsMenu>
        <AlbumsMenu.Menu>
          <MenuItem
            icon={
              <SIconGroup>
                <SIcon name="sliders horizontal" />
                <SIcon
                  name="add"
                  style={{
                    position: "absolute",
                    right: "-0.3em",
                    bottom: "-0.3em",
                    fontSize: "0.6em",
                  }}
                />
              </SIconGroup>
            }
            label="Create List"
            onClick={() => onCreate()}
          />
          <MenuItem
            icon="upload"
            name="load-list"
            label="Load List"
            onClick={() => document.querySelector("#load-custom-file").click()}
          />
          <MenuItem
            icon="play"
            name="play-list"
            label="Play List"
            onClick={() => document.querySelector("#play-custom-file").click()}
          />
          <MenuItem
            active={options.showDetail}
            label="Details"
            onClick={() => setOptions({ showDetail: !options.showDetail })}
            icon="ellipsis horizontal"
          />
          <VersionCard />
        </AlbumsMenu.Menu>
        <AlbumsMenu.Content>
          <div className="toc albums">
            <AllAlbums list={filtered} onClick={onClick} ratings={albumRatings} />
          </div>
        </AlbumsMenu.Content>
      </AlbumsMenu>

      <Popup open={showingSummary} onClose={onClose}>
        <AlbumSummary album={filtered[currentAlbum]} onClose={onClose} />
      </Popup>

      <input
        id={"load-custom-file"}
        type="file"
        style={{ display: "none" }}
        onChange={(ev) => loadCustomPlaylist(ev, onLoad)}
      />
      <input
        id={"play-custom-file"}
        type="file"
        style={{ display: "none" }}
        onChange={(ev) => loadCustomPlaylist(ev, onPlay)}
      />
    </>
  );
}
