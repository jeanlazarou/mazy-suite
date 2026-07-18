import { useAtomValue } from "jotai";
import React, { useLayoutEffect, useState } from "react";
import Backdrop from "@mui/material/Backdrop";
import Checkbox from "@mui/material/Checkbox";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import Rating from "@mui/material/Rating";
import Tooltip from "@mui/material/Tooltip";

import { SIcon, SLabel } from "./ui";

import { cardFormat, requestedTrack, currentPlaylist, songsMetadata } from "./atoms";

import { playingTrack } from "./Sequencer";

import {
  formatTime,
  formatTitle,
  isRecent,
  formatSince,
  useIsMobile,
  getTrackImagePath,
} from "./utils";

import { tracks$ } from "./TracksStream";
import { darkMode } from "./DarkModeToggle";

const formatDuration = (duration, asError) => {
  if (!duration) return asError ? "😥" : "-";

  duration = Math.round(duration);

  return formatTime(duration);
};

const COLOR = { color: "#f5ebe4" };

function SoundIcon() {
  return <SIcon name="sound" style={COLOR} />;
}

function PlayingIcon({ track }) {
  const current = useAtomValue(playingTrack);

  const playing = current.url === track.url;

  useLayoutEffect(() => {
    const id = "card-" + track.id;

    const card = document.getElementById(id);

    const label = card.querySelector(".orange");

    if (label === null) return;

    if (label.style.position === "absolute") return;

    const width = 100;
    const height = 30;

    const cardRect = card.getBoundingClientRect();

    const x = (cardRect.width - width) / 2;
    const y = -15;

    label.style.position = "absolute";
    label.style.left = `${x}px`;
    label.style.top = `${y}px`;
    label.style.width = `${width}px`;
    label.style.height = `${height}px`;
  });

  return playing ? (
    <SLabel color="orange" circular basic size="large">
      <SoundIcon /> {formatTime(current.position)}
    </SLabel>
  ) : null;
}

function FeedEvent({ icon, action, relative, date }) {
  return (
    <div className="feed-event">
      <SIcon name={icon} />
      <div>
        {action}
        <div className="feed-summary">
          <span>{relative}</span> <span>/ {date}</span>
        </div>
      </div>
    </div>
  );
}

function Timestamps({ track }) {
  const [date, relative] = formatSince(track.lastModified);

  const creationDate = track.creationDate
    ? formatSince(track.creationDate, { dateOnly: true })
    : undefined;
  const reworkDate = track.reworkDate
    ? formatSince(track.reworkDate, { dateOnly: true })
    : undefined;

  return (
    <div className="card timestamps-card">
      <div className="content">
        <div className="feed">
          {date ? (
            <FeedEvent icon="upload" action="Updated" relative={relative} date={date} />
          ) : null}
          {reworkDate ? (
            <FeedEvent icon="wrench" action="Reworked" relative={reworkDate[1]} date={reworkDate[0]} />
          ) : null}
          {creationDate ? (
            <FeedEvent icon="microphone" action="Created" relative={creationDate[1]} date={creationDate[0]} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function InfoIcon({ isNew, track }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <SIcon
        name={isNew ? "headphones" : "info"}
        className={`label-icon${isNew ? " label-icon-new" : ""}`}
        onClick={(ev) => {
          setOpen(true);
          ev.stopPropagation();
        }}
      />
      <Dialog id="timestamps" open={open} onClose={() => setOpen(false)}>
        <Timestamps track={track} />
      </Dialog>
    </>
  );
}

function AdditionalInfo({ track }) {
  const isMobile = useIsMobile();
  const isNew = isRecent(track);

  return isMobile ? (
    <InfoIcon isNew={isNew} track={track} />
  ) : (
    <Tooltip
      title={<Timestamps track={track} />}
      placement="left"
      slotProps={{
        tooltip: {
          sx: { bgcolor: "transparent", p: 0, maxWidth: "none" },
        },
      }}
    >
      <SIcon
        name={isNew ? "headphones" : "info"}
        className={`label-icon${isNew ? " label-icon-new" : ""}`}
        onClick={(ev) => {
          ev.stopPropagation();
        }}
      />
    </Tooltip>
  );
}

function trackProps(track) {
  const duration =
    track.duration || track.error ? (
      formatDuration(track.duration, track.error)
    ) : (
      <SIcon loading name="spinner" color="purple" />
    );

  return {
    title: track.title ? track.title : formatTitle(track.url),
    duration,

    enabled: track.enabled,
    titleStyle: track.enabled ? undefined : { color: "lightgray", filter: "blur(2px)" },
  };
}

function TrackImage({ track, playlist, metadata }) {
  // Find the track's index in the original playlist
  const trackIndex = playlist.findIndex((t) => t.url === track.url);

  if (trackIndex === -1 || !metadata.trackImage) {
    return null;
  }

  const imagePath = getTrackImagePath(metadata.trackImage, trackIndex);

  if (!imagePath) {
    return null;
  }

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        left: 0,
        height: "100%",
        pointerEvents: "none",
        zIndex: 0,
        overflow: "hidden",
        borderRadius: "16px"
      }}
    >
      <img
        src={imagePath}
        alt=""
        style={{
          position: "absolute",
          right: "8px",
          top: "50%",
          transform: "translateY(-50%)",
          maxHeight: "90%",
          maxWidth: "40%",
          width: "auto",
          objectFit: "contain",
          zIndex: 0
        }}
        onError={(e) => {
          e.target.style.display = "none";
        }}
      />
    </div>
  );
}

function TrackRating({ track, enabled }) {
  return (
    <Rating
      max={5}
      value={track.rating || 0}
      size="small"
      style={{ float: "right" }}
      disabled={!enabled}
      onChange={(_e, rating) => tracks$.rate(track, rating ?? 0)}
    />
  );
}

function CardHeader({ track }) {
  const isDarkMode = useAtomValue(darkMode);
  const { enabled, title, duration, titleStyle } = trackProps(track);

  return global.features.includeRating ? (
    <div className="content" style={{ position: "relative", zIndex: 1 }}>
      <div className={`header ${isDarkMode ? "card-header-dark-mode" : ""}`}>
        <span className="track-title" style={titleStyle}>
          {title}
        </span>
        <TrackRating track={track} enabled={enabled} />
      </div>
      <PlayingIcon track={track} />
      <span style={{ float: "right" }}> {duration}</span>
    </div>
  ) : (
    <div className="content" style={{ position: "relative", zIndex: 1 }}>
      <div className={`header ${isDarkMode ? "card-header-dark-mode" : ""}`}>
        <span className="track-title" style={titleStyle}>
          {title}
        </span>
        <span style={{ float: "right" }}>{duration}</span>
      </div>
      <PlayingIcon track={track} />
    </div>
  );
}

function SmallCard({ track }) {
  const { title, duration, titleStyle } = trackProps(track);

  const meta = track.authors.join(", ");

  const toggle = () => tracks$.toggle(track);

  return (
    <Tooltip title={meta} enterDelay={500}>
      <div className="content" style={{ display: "flex", alignItems: "center" }}>
        <Checkbox
          size="small"
          checked={track.enabled}
          onChange={toggle}
          onClick={(ev) => ev.stopPropagation()}
        />
        <span style={{ flexGrow: 2, paddingLeft: 5, ...titleStyle }}>
          {title}
        </span>
        <span>{duration}</span>
        <PlayingIcon track={track} />
      </div>
    </Tooltip>
  );
}

export function BasicTrackCard({ track, color, children, disabled }) {
  const isDarkMode = useAtomValue(darkMode);
  const requestedUrl = useAtomValue(requestedTrack);
  const format = useAtomValue(cardFormat);
  const current = useAtomValue(playingTrack);
  const playlist = useAtomValue(currentPlaylist);
  const metadata = useAtomValue(songsMetadata);

  const meta = track.authors.join(", ");

  const select = () => tracks$.select(track);
  const toggle = () => tracks$.toggle(track);

  const id = "card-" + track.id;

  const active = track.url === requestedUrl;
  const isPlaying = current.url === track.url && current.position > 0;

  // Build dynamic class names
  const cardClasses = [
    "card",
    color || "",
    isDarkMode ? "card-dark-mode" : "",
    isPlaying ? "playing-track" : ""
  ].filter(Boolean).join(" ");

  return (
    <div
      onClick={disabled ? undefined : select}
      id={id}
      className={cardClasses}
      style={{
        opacity: active ? 0.6 : 1,
        transition: "opacity 0.3s ease",
        position: "relative"
      }}
    >
      <Backdrop
        open={active}
        sx={{
          position: "absolute",
          zIndex: 3,
          backgroundColor: "rgba(255,255,255,.7)",
        }}
      >
        <CircularProgress />
      </Backdrop>

      {format !== "small" && (
        <TrackImage
          track={track}
          playlist={playlist}
          metadata={metadata}
        />
      )}

      {children}

      {format === "small" ? (
        <SmallCard track={track} checked={track.enabled} />
      ) : (
        <>
          <CardHeader track={track} />

          <div className="content" style={{ position: "relative", zIndex: 1 }}>
            <div className="meta">
              <div className="authors-names" title={meta}>{meta}</div>
              <Checkbox
                size="small"
                style={{ float: "right" }}
                checked={track.enabled}
                onChange={toggle}
                onClick={(ev) => ev.stopPropagation()}
                className="track-enable-toggle"
              />
              <AdditionalInfo track={track} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
