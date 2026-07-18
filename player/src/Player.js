import React, { useLayoutEffect } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import Backdrop from "@mui/material/Backdrop";
import CircularProgress from "@mui/material/CircularProgress";

import { useIsMobile } from "./utils";

import { currentPlaylist, currentTitle, viewingDescription } from "./atoms";
import { playingTrack, usePlaybackState } from "./Sequencer";
import { requestedTrack, snoozeModal, viewingVolumes } from "./atoms";

import { options$ } from "./OptionsStream";
import { commands$ } from "./CommandsStream";
import { tracks$, RATE, SELECT, TOGGLE } from "./TracksStream";
import { SAVE, SHUFFLE, UNDO, REDO, TOGGLE_VOLUMES } from "./CommandsStream";

import { shuffle } from "./shuffle";

import { Info } from "./Info";
import { Saver } from "./Saver";
import { Snooze } from "./Snooze";
import { Toolbar } from "./Toolbar";
import { Playlist } from "./Playlist";
import { Sequencer } from "./Sequencer";
import { PlayerTour } from "./PlayerTour";
import { FilterModal } from "./FilterModal";
import { OptionsStore } from "./OptionsStore";
import { ReorderModal } from "./ReorderModal";
import { AudioSequencer } from "./AudioSequencer";
import { DarkModeToggle } from "./DarkModeToggle";
import { LyricsSubtitle } from "./LyricsSubtitle";
import { DescriptionModal } from "./DescriptionModal";
import { MediaSessionHandler } from "./MediaSessionHandler";

import { MobileToolbar, mobileHeight } from "./MobileToolbar";
import { historyPush, historyRedo, historyUndo } from "./HistoryMachine";
import { MobileTransportModal } from "./MobileTransportModal";

const playerCommands$ = commands$.stream.filter(({ action }) =>
    [UNDO, REDO, SAVE, SHUFFLE, TOGGLE_VOLUMES].includes(action)
);


export function Player() {
  const title = useAtomValue(currentTitle);
  const current = useAtomValue(playingTrack);
  const requestTrack = useSetAtom(requestedTrack);
  const [playlist, setPlaylist] = useAtom(currentPlaylist);
  const [volumesOpen, setViewVolumes] = useAtom(viewingVolumes);

  const isMobileDevice = useIsMobile();

  const push = useSetAtom(historyPush);
  const redo = useSetAtom(historyRedo);
  const undo = useSetAtom(historyUndo);

  useLayoutEffect(() => {
    const subscription = playerCommands$.subscribe(({ action }) => {
      switch (action) {
        case SHUFFLE: {
          push(playlist);

          const list = shuffle(playlist);

          setPlaylist(list);

          break;
        }
        case UNDO:
          undo();
          break;
        case REDO:
          redo();
          break;
        case TOGGLE_VOLUMES:
          setViewVolumes(!volumesOpen);
          break;
        default: {
          const data = playlist.map((track) => {
            const item = track.enabled ? {} : { enabled: false };

            return {
              url: track.url,
              title: track.title,
              rating: track.rating,
              authors: track.authors,
              volume: parseInt(track.volume),
              ...item,
            };
          });

          Saver.save({ title, playlist: data });
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [
    playlist,
    setPlaylist,
    title,
    volumesOpen,
    setViewVolumes,
    push,
    redo,
    undo,
  ]);

  useLayoutEffect(() => {
    const update = (track, updated) => {
      push(playlist);

      const list = playlist.map((e) => {
        return e.url === track.url ? updated : e;
      });

      setPlaylist(list);
    };

    const subscription = tracks$.stream.subscribe(({ action, track, data }) => {
      switch (action) {
        case SELECT:
          if (track.enabled) {
            if (track.url !== current.url && !track.error) {
              requestTrack(track.url);
            }

            Sequencer.select(track);
          }
          break;
        case TOGGLE:
          update(track, { ...track, enabled: !track.enabled });
          break;
        case RATE: {
          const { rating } = data;
          update(track, { ...track, rating });
          break;
        }
        default:
      }
    });

    return () => subscription.unsubscribe();
  }, [playlist, setPlaylist, current, requestTrack, push]);

  useLayoutEffect(() => {
    const subscription = options$.stream.subscribe((values) => {
      OptionsStore.save(values);
    });

    return () => subscription.unsubscribe();
  }, []);

  return isMobileDevice ? <MobileView /> : <DesktopView />
}

function DesktopView() {
  const [playlist, setPlaylist] = useAtom(currentPlaylist);
  const [snooze, toggleSnooze] = useAtom(snoozeModal);
  const push = useSetAtom(historyPush);

  const playbackState = usePlaybackState();

  // Space toggles play/pause, unless the user is typing in a form field
  useLayoutEffect(() => {
    const onKeyDown = (e) => {
      if (e.code !== "Space") return;

      const tag = e.target.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        e.target.isContentEditable
      )
        return;

      e.preventDefault();

      if (playbackState === "idle" || playbackState === "paused") {
        commands$.play();
      } else {
        commands$.pause();
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
  }, [playbackState]);

  return (
    <>
      <Toolbar>
        <Info />
      </Toolbar>

      <DarkModeToggle />

      <div>
        <List />
      </div>

      <LyricsSubtitle />
      <ReorderModal
        onSave={(list) => {
          push(playlist);

          setPlaylist(list);
        }}
      />
      <DescriptionModal />
      <PlayerTour />
      <FilterModal />
      {snooze ? <Snooze onStop={() => toggleSnooze(!snooze)} /> : null}
    </>
  );
}

function MobileView() {
  const [snooze, toggleSnooze] = useAtom(snoozeModal);

  usePlaybackState();

  const descriptionOpen = useAtomValue(viewingDescription);

  const styles = {
    overflow: "auto",
    height: mobileHeight,
    display: descriptionOpen ? "none" : undefined
  }

  return <>
    <div style={styles}>
      <List />
    </div>
    <LyricsSubtitle />

    <FilterModal />
    <DescriptionModal />
    <MobileTransportModal />

    <MobileToolbar />

    {snooze ? <Snooze onStop={() => toggleSnooze(!snooze)} /> : null}
  </>
}

function List() {
  const [playlist, setPlaylist] = useAtom(currentPlaylist);
  const push = useSetAtom(historyPush);

  const isLoading = playlist.length === 0;

  return <div className="playlist">
    <Backdrop
      open={isLoading}
      sx={{ backgroundColor: "rgba(255,255,255,.8)", zIndex: 1000, flexDirection: "column", gap: 2 }}
    >
      <CircularProgress size={48} />
      <div>Loading</div>
    </Backdrop>

    <React.Suspense fallback={null}>
      <AudioSequencer />
      <MediaSessionHandler />
    </React.Suspense>

    <Playlist
      onReorder={(list) => {
        push(playlist);

        setPlaylist(list);
      }}
    />
  </div>

}