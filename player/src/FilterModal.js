import React, { useEffect, useLayoutEffect, useState } from "react";
import { useAtomValue, useAtom } from "jotai";
import Button from "@mui/material/Button";

import { commands$, FILTER } from "./CommandsStream";

import { applyFilter } from "./filter";
import { formatTime } from "./utils";

import { trackTitle, useIsMobile } from "./utils";
import { factoryFilter, selectedTrackIds } from "./filter";

import { currentPlaylist, playlistFilter, titleOptions } from "./atoms";

import { PlayerModal } from "./PlayerModal";
import { mobileHeight } from "./MobileToolbar";

const filterCommands$ = commands$.stream.filter(({ action }) => [FILTER].includes(action)
);

function Duration({ filter, playlist }) {
  const totalDuration = () => {
    const duration = applyFilter(playlist, filter)
      .filter((track) => track.duration)
      .reduce((totalTime, track) => totalTime + Math.round(track.duration), 0);

    const totalTime = Math.round(duration);

    return formatTime(totalTime);
  };

  return <div className="filter-duration">{totalDuration()}</div>;
}

function SmallCard({ track, selected, onClick }) {
  const title = trackTitle(track);

  return (
    <div
      key={track.id}
      title={title}
      onClick={onClick}
      className={`small-card ${selected ? "selected" : "unselected"}`}
    >
      <div>{title}</div>
    </div>
  );
}

function List({ filter, onClick }) {
  const playlist = useAtomValue(currentPlaylist);
  const [currentFilter, setCurrentFilter] = useState(filter);
  const [selected, setSelected] = useState(() =>
    selectedTrackIds(playlist, filter)
  );

  useEffect(() => {
    if (filter !== currentFilter) {
      setCurrentFilter(filter);
      setSelected(selectedTrackIds(playlist, filter));
    }
  }, [setCurrentFilter, currentFilter, filter, playlist]);

  return (
    <div>
      <Duration filter={currentFilter} playlist={playlist} />
      <div>
        {playlist.map((track) => (
          <SmallCard
            key={track.id}
            track={track}
            onClick={() => onClick(track)}
            selected={selected.has(track.id)}
          />
        ))}
      </div>
    </div>
  );
}

function FilterForm({ filter, onChange }) {
  const titles = useAtomValue(titleOptions);

  const resetFilter = () => {
    onChange(factoryFilter());
  };

  const noneFilter = () => {
    const newFilter = {
      ...factoryFilter(),
      excludeTitles: titles.map((t) => t.value),
    };

    onChange(newFilter);
  };

  return (
    <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 8 }}>
      <Button
        variant="contained"
        color="error"
        sx={{ textTransform: "none" }}
        onClick={noneFilter}
      >
        None
      </Button>

      <Button
        variant="contained"
        color="primary"
        sx={{ textTransform: "none" }}
        onClick={resetFilter}
      >
        Reset filter
      </Button>
    </div>
  );
}

export function FilterModal() {
  const isMobileDevice = useIsMobile();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useAtom(playlistFilter);
  const [currentFilter, setCurrentFilter] = useState(filter);

  useEffect(() => {
    if (!open) {
      setCurrentFilter(filter);
    }
  }, [filter, open]);

  useLayoutEffect(() => {
    const subscription = filterCommands$.subscribe(({ action }) => {
      setOpen(action === FILTER);
    });

    return () => subscription.unsubscribe();
  }, []);

  const save = () => {
    setFilter(currentFilter);

    setOpen(false);
  };

  const cancel = () => {
    setOpen(false);
  };

  const toggleTrack = (track) => {
    const newFilter = { ...currentFilter };

    if (newFilter.excludeTitles.includes(track.id)) {
      newFilter.excludeTitles = newFilter.excludeTitles.filter(
        (id) => id !== track.id
      );
    } else {
      newFilter.excludeTitles = [...newFilter.excludeTitles, track.id];
    }

    setCurrentFilter(newFilter);
  };

  if (!open) return null;

  const styles = isMobileDevice
    ? {
      top: 0,
      height: mobileHeight,
      overflow: "auto"
    }
    : undefined;

  return (
    <PlayerModal open={open} color="white" visibleHeight style={styles}>
      <PlayerModal.Save onClick={save} />
      <PlayerModal.Cancel onClick={cancel} />

      {isMobileDevice ? (
        <div className="mobile-filter-panel">
          <List
            filter={currentFilter}
            onClick={(track) => toggleTrack(track)}
          />
          <FilterForm filter={currentFilter} onChange={setCurrentFilter} />
        </div>
      ) : (
        <div className="filter-panel">
          <List
            filter={currentFilter}
            onClick={(track) => toggleTrack(track)}
          />
          <FilterForm filter={currentFilter} onChange={setCurrentFilter} />
        </div>
      )}
    </PlayerModal>
  );
}
