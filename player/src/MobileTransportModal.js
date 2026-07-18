import React, { useEffect, useLayoutEffect, useState } from "react";
import { useAtom, useAtomValue } from "jotai";

import { commands$ } from "./CommandsStream";
import {
  FILTER,
  REORDER,
  SHOW_PLAYLIST,
  SHOW_DESCRIPTION,
  SHOW_MOBILE_TRANSPORT,
  TOGGLE_VOLUMES,
} from "./CommandsStream";

import { PlayerModal } from "./PlayerModal";
import { mobileHeight } from "./MobileToolbar";

import { viewingMobileTransport, loadingStatus } from "./atoms";

import { formatTime } from "./utils";
import { playingTrack, usePlaybackState } from "./Sequencer";

import "./MobileTransportModal.css"

const mobileTransportCommands$ = commands$.stream.filter(({ action }) =>
    [FILTER, REORDER, SHOW_DESCRIPTION, SHOW_PLAYLIST, SHOW_MOBILE_TRANSPORT, TOGGLE_VOLUMES].includes(action)
);

function TrackInfo({ track }) {
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const retryStatus = useAtomValue(loadingStatus);

  useEffect(() => {
    const newPosition = ({ detail: { duration, position } }) => {
      setDuration(Math.round(duration));
      setPosition(Math.round(position));
    }

    document.addEventListener("sequencer:position", newPosition);

    return () => document.removeEventListener("sequencer:position", newPosition);
  }, [])

  return <><div className="mobile-song-title">
    <span>{track.title ? track.title : "\u00a0"}</span>
    {retryStatus.isRetrying && (
      <div style={{
        fontSize: "0.75rem",
        color: "#f97316",
        marginTop: "4px",
        display: "flex",
        alignItems: "center",
        gap: "6px"
      }}>
        <span style={{
          display: "inline-block",
          width: "12px",
          height: "12px",
          border: "2px solid #f97316",
          borderTopColor: "transparent",
          borderRadius: "50%",
          animation: "spin 0.8s linear infinite"
        }}></span>
        <span>Retrying connection (attempt {retryStatus.retryAttempt}/3)...</span>
      </div>
    )}
  </div>

    <div className="mobile-song-progress">
      <>
        <input type="range" id="song-percentage-played" style={{ backgroundSize: "73.1% 100%" }}
          min={0} max={duration} step=".1" value={position} onChange={(ev) => commands$.jump(ev.target.value)} />

        <div style={{ marginTop: 5 }}>
          <span className="mobile-play-position">{formatTime(position)}</span>
          <span className="mobile-total-time">{formatTime(duration)}</span>
        </div>
      </>
    </div>
  </>
}

function Content() {
  const track = useAtomValue(playingTrack)

  const playbackState = usePlaybackState();

  const playing = playbackState === "playing";

  const playAction =
    playbackState === "idle" || playbackState === "paused"
      ? () => commands$.play()
      : () => commands$.pause();

  return <div
    id="mobile-transport"
    style={{
      padding: 20,
      minHeight: "100%",
      marginBottom: "3rem",
      height: "100%",
      animation: "fade-in-up 800ms cubic-bezier(0.19, 1, 0.22, 1) forwards",
    }}
  >
    <div className="mobile-transport-container">

      <TrackInfo track={track} />

      <div className="mobile-transport">
        <div className="mobile-prev-button" onClick={() => commands$.playPrevious()}>
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M26 7C26 5.76393 24.5889 5.05836 23.6 5.8L11.6 14.8C10.8 15.4 10.8 16.6 11.6 17.2L23.6 26.2C24.5889 26.9416 26 26.2361 26 25V7Z" fill="#94A3B8" stroke="#94A3B8" strokeWidth="2" strokeLinejoin="round"></path>
            <path d="M6 5L6 27" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"></path>
          </svg>
        </div>

        <div className="mobile-play-button" onClick={playAction}>
          {playing
            ? <svg id="pause-icon" width="24" height="36" viewBox="0 0 24 36" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="6" height="36" rx="3" ></rect>
              <rect x="18" width="6" height="36" rx="3" ></rect>
            </svg>
            : <svg id="play-icon" width="31" height="37" viewBox="0 0 31 37" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path fillRule="evenodd" clipRule="evenodd" d="M29.6901 16.6608L4.00209 0.747111C2.12875 -0.476923 0.599998 0.421814 0.599998 2.75545V33.643C0.599998 35.9728 2.12747 36.8805 4.00209 35.6514L29.6901 19.7402C29.6901 19.7402 30.6043 19.0973 30.6043 18.2012C30.6043 17.3024 29.6901 16.6608 29.6901 16.6608Z" ></path>
            </svg>
          }
        </div>

        <div className="mobile-next-button" onClick={() => commands$.playNext()}>
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M6 7C6 5.76393 7.41115 5.05836 8.4 5.8L20.4 14.8C21.2 15.4 21.2 16.6 20.4 17.2L8.4 26.2C7.41115 26.9416 6 26.2361 6 25V7Z" fill="#94A3B8" stroke="#94A3B8" strokeWidth="2" strokeLinejoin="round"></path>
            <path d="M26 5L26 27" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"></path>
          </svg>
        </div>
      </div>

    </div>
  </div>
}


export function MobileTransportModal() {
  const [open, setOpen] = useAtom(viewingMobileTransport);

  useLayoutEffect(() => {
    const subscription = mobileTransportCommands$.subscribe(({ action }) => {
      if (action === SHOW_MOBILE_TRANSPORT) {
        setOpen(!open);
      } else {
        setOpen(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [open, setOpen]);

  const styles = {
    top: 0,
    overflow: "hidden",
    height: mobileHeight,
  }

  return (
    <PlayerModal open={open} toolbar={false} visibleHeight="100%" style={styles} clip>
      <Content />
    </PlayerModal>
  );
}
