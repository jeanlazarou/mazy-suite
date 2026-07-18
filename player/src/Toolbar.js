import React, { useEffect, useState } from "react";
import { useAtomValue, useAtom, useSetAtom } from "jotai";
import Button from "@mui/material/Button";
import ButtonGroup from "@mui/material/ButtonGroup";
import Dialog from "@mui/material/Dialog";
import Fade from "@mui/material/Fade";
import Popover from "@mui/material/Popover";

import { MenuBar, MenuBarItem, SIcon } from "./ui";

import { cardFormat, draggableTracks, showSetsModal, playlistSets } from "./atoms";
import { snoozeModal } from "./atoms";
import { playlistFilterActive } from "./atoms";

import { Transport } from "./Transport";
import { ShowLyricsToggle } from "./ShowLyricsToggle";
import { DescriptionButton } from "./DescriptionButton";

import { options$ } from "./OptionsStream";
import { commands$ } from "./CommandsStream";

import { historyState } from "./HistoryMachine";
import { VersionCard } from "./VersionCard";
import { useIsMobile } from "./utils";
import { LoopMenuItem } from "./LoopMenuItem";
import { TimelineButton } from "./TimelineButton";

function CardFormatOption() {
  const [format, setFormat] = useAtom(cardFormat);
  const active = format === "small";

  const changeFormat = () => {
    const newFormat = active ? "normal" : "small";

    options$.cardFormat(newFormat);

    setFormat(newFormat);
  };

  return (
    <MenuBarItem onClick={changeFormat} active={active}>
      <SIcon name="window minimize" />
      <br />
      Small Cards
    </MenuBarItem>
  );
}

function SnoozeOption() {
  const [isOpen, setOpen] = useAtom(snoozeModal);

  const toggleModal = () => {
    setOpen(!isOpen);
  };

  return (
    <MenuBarItem onClick={toggleModal} active={isOpen}>
      <SIcon name="hourglass start" />
      <br />
      Snooze
    </MenuBarItem>
  );
}

// variant="toolbar" → MenuBarItem wrapping a small icon (desktop)
// variant="tab-bar" → bare big SIcon (mobile)
export function SetsButton({ variant = "tab-bar" }) {
  const sets = useAtomValue(playlistSets);
  const setShowSets = useSetAtom(showSetsModal);
  const [blinking, setBlinking] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setBlinking(false), 4000);
    return () => clearTimeout(t);
  }, []);

  if (!sets) return null;

  const blinkClass = blinking ? " sets-btn--blink" : "";

  if (variant === "toolbar") {
    return (
      <MenuBarItem
        className={`sets-btn${blinkClass}`}
        onClick={() => setShowSets(true)}
        style={{ paddingTop: 15, paddingLeft: 16 }}
      >
        <SIcon name="adjust" style={{ fontSize: 17 }} />
      </MenuBarItem>
    );
  }

  return (
    <SIcon
      name="adjust"
      size="big"
      className={`sets-btn${blinkClass}`}
      onClick={() => setShowSets(true)}
      style={{ cursor: "pointer" }}
    />
  );
}

function MobileSortItem() {
  return (
    <MenuBarItem onClick={() => commands$.reorder()}>
      <SIcon name="sort" />
      <br />
      Sort
    </MenuBarItem>
  );
}

function DesktopSortItem() {
  const [anchor, setAnchor] = useState(null);
  const [draggableCards, setDraggableCards] = useAtom(draggableTracks);

  const enableDragging = () => {
    setDraggableCards(!draggableCards);
    setAnchor(null);
  };
  const reorder = () => {
    commands$.reorder();
    setAnchor(null);
  };

  return draggableCards ? (
    <MenuBarItem onClick={() => setDraggableCards(false)}>
      <SIcon name="sort" color={draggableCards ? "blue" : undefined} />
    </MenuBarItem>
  ) : (
    <>
      <MenuBarItem onClick={(ev) => setAnchor(ev.currentTarget)}>
        <SIcon name="sort" />
      </MenuBarItem>
      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        transformOrigin={{ vertical: "top", horizontal: "center" }}
        slotProps={{ paper: { sx: { p: 1 } } }}
      >
        <ButtonGroup variant="contained">
          <Button color="info" onClick={reorder}>
            Assign Indexes
          </Button>
          <Button color="primary" onClick={enableDragging}>
            Drag Tracks
          </Button>
        </ButtonGroup>
      </Popover>
    </>
  );
}

function Commands() {
  const history = useAtomValue(historyState);
  const filterActive = useAtomValue(playlistFilterActive);

  return (
    <>
      <DesktopSortItem />

      <MenuBarItem onClick={() => commands$.shuffle()}>
        <SIcon name="shuffle" />
      </MenuBarItem>

      <MenuBarItem />

      <MenuBarItem
        disabled={!history.hasPast}
        onClick={() => commands$.undo()}
      >
        <SIcon name="undo" />
      </MenuBarItem>
      <MenuBarItem
        disabled={!history.hasFuture}
        onClick={() => commands$.redo()}
      >
        <SIcon name="redo" />
      </MenuBarItem>

      <MenuBarItem />

      <MenuBarItem onClick={() => commands$.filter()}>
        <SIcon name="filter" color={filterActive ? "red" : undefined} />
      </MenuBarItem>

      <ShowLyricsToggle />

      {global.features.saveEnabled ? (
        <>
          <MenuBarItem />

          <MenuBarItem onClick={() => commands$.save()}>
            <SIcon name="save" />
          </MenuBarItem>
        </>
      ) : null}
    </>
  );
}

const isFullscreen = () => document.fullscreenElement !== null;

export function PlayerSubMenu({ open, onClose }) {
  const isMobileDevice = useIsMobile();
  const history = useAtomValue(historyState);
  const filterActive = useAtomValue(playlistFilterActive);

  const toggleScreenMode = () => {
    if (isFullscreen()) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen();
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      onClick={onClose}
      slots={{ transition: Fade }}
      slotProps={{
        transition: { timeout: 500 },
        paper: {
          className: "player-menu-paper",
          sx: { position: "fixed", top: 40, m: 0, maxWidth: "none" },
        },
      }}
    >
      <div className="player-menu">
        {/* row 1 */}
        <MenuBarItem
          disabled={!history.hasPast}
          onClick={() => commands$.undo()}
        >
          <SIcon name="undo" />
          <br />
          Undo
        </MenuBarItem>
        <MenuBarItem
          disabled={!history.hasFuture}
          onClick={() => commands$.redo()}
        >
          <SIcon name="redo" />
          <br />
          Redo
        </MenuBarItem>

        {global.features.saveEnabled ? (
          <MenuBarItem onClick={() => commands$.save()}>
            <SIcon name="save" />
            <br />
            Save
          </MenuBarItem>
        ) : (
          <MenuBarItem />
        )}

        {/* row 2 */}
        <MenuBarItem onClick={() => commands$.filter()}>
          <SIcon name="filter" color={filterActive ? "red" : undefined} />
          <br />
          Filter
        </MenuBarItem>

        <MobileSortItem />

        <MenuBarItem onClick={() => commands$.shuffle()}>
          <SIcon name="shuffle" />
          <br />
          Shuffle
        </MenuBarItem>

        {/* row 3 */}
        <ShowLyricsToggle showLabel={true} />
        <CardFormatOption />

        <MenuBarItem onClick={() => toggleScreenMode()} active={isFullscreen()}>
          <SIcon name={isFullscreen() ? "compress" : "expand"} />
          <br />
          Full screen
        </MenuBarItem>

        {/* row 4 */}
        <TimelineButton />

        {isMobileDevice
          ? <LoopMenuItem />
          : global.features.includeDescription
            ? <DescriptionButton showLabel={true} />
            : null
        }

        <SnoozeOption />

        <VersionCard />
      </div>
    </Dialog>
  );
}

function DesktopToolbar(props) {
  const [menuShown, setMenuShown] = useState(false);
  const [volumesShown, setVolumesShown] = useState(false);

  return (
    <MenuBar>
      <MenuBarItem
        onClick={() => {
          setMenuShown(true);
        }}
      >
        <SIcon name="bars" />
      </MenuBarItem>

      <PlayerSubMenu open={menuShown} onClose={() => setMenuShown(false)} />

      {global.features.includeTour ? (
        <MenuBarItem
          onClick={() => {
            commands$.startTour();
          }}
        >
          <SIcon name="help" />
        </MenuBarItem>
      ) : null}

      {global.features.includeDescription ? (
        <DescriptionButton {...props} />
      ) : null}

      <SetsButton variant="toolbar" />

      <MenuBarItem />

      <Commands {...props} />

      <MenuBarItem />

      <MenuBarItem
        onClick={() => {
          setVolumesShown(!volumesShown);

          commands$.toggleVolumes();
        }}
      >
        <SIcon name="volume up" color={volumesShown ? "blue" : undefined} />
      </MenuBarItem>

      <Transport {...props} />

      <MenuBarItem position="right">{props.children}</MenuBarItem>
    </MenuBar>
  );
}

export { DesktopToolbar as Toolbar };
