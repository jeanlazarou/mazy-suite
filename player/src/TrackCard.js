import { useAtomValue } from "jotai";
import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { viewingVolumes } from "./atoms";
import { draggableTracks } from "./atoms";

import { VolumeCard } from "./VolumeCard";
import { SortableCard } from "./SortableCard";

function CardWrapper({ track }) {
  const showVolumes = useAtomValue(viewingVolumes);
  const draggable = useAtomValue(draggableTracks);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: track.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const isDragged = attributes["aria-pressed"];

  return draggable ? (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={isDragged ? "dragged-card" : "draggable-card"}
    >
      {showVolumes ? (
        <VolumeCard track={track} />
      ) : (
        <SortableCard track={track} color="blue" />
      )}
    </div>
  ) : (
    <>
      {showVolumes ? (
        <VolumeCard track={track} />
      ) : (
        <SortableCard track={track} />
      )}
    </>
  );
}

export { CardWrapper as TrackCard };
