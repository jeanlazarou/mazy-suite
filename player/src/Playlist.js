import React from "react";
import { useAtomValue } from "jotai";
import { DndContext, closestCenter } from "@dnd-kit/core";
import { arrayMove, SortableContext } from "@dnd-kit/sortable";

import "./Playlist.css";

import { currentPlaylist, playlistFilter } from "./atoms";

import { TrackCard } from "./TrackCard";

import { applyFilter } from "./filter";

function handleDragEnd(event, items, notifyChange) {
  const { active, over } = event;

  if (active.id !== over.id) {
    const oldIndex = items.findIndex((e) => e.id === active.id);
    const newIndex = items.findIndex((e) => e.id === over.id);

    notifyChange(arrayMove(items, oldIndex, newIndex));
  }
}

function Playlist({ onReorder }) {
  const playlist = useAtomValue(currentPlaylist);
  const filter = useAtomValue(playlistFilter);
  const selected = applyFilter(playlist, filter);

  return (
    <DndContext
      collisionDetection={closestCenter}
      onDragEnd={(e) => handleDragEnd(e, selected, onReorder)}
      handle
    >
      <div id="tracks" className="cards tracks-container">
        <SortableContext items={selected}>
          {selected.map((e) => (
            <TrackCard key={e.url} id={e.id} track={e} />
          ))}
        </SortableContext>
      </div>
    </DndContext>
  );
}

export { Playlist };
