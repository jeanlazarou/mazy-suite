import React from "react";
import { useAtom, useAtomValue } from "jotai";

import "./SortableCard.css";

import { SIcon, SLabel } from "./ui";

import { BasicTrackCard } from "./BasicTrackCard";

import { viewingReorder } from "./atoms";
import { futureOrder, futureOrderChanged } from "./sort_atoms";

export function SortableCard({ track, color }) {
  const showIndex = useAtomValue(viewingReorder);
  const startedChanging = useAtomValue(futureOrderChanged);

  const [data, setFutureOrder] = useAtom(futureOrder(track.url));

  if (!showIndex) return <BasicTrackCard track={track} color={color} />;

  const { changed, index, futureIndex } = data;

  const url = track.url;

  return (
    <BasicTrackCard track={track} color={color} disabled>
      <div className="track-order-badges">
        <SLabel
          color={startedChanging ? "green" : "blue"}
          className="track-index"
          onClick={() => setFutureOrder(url)}
        >
          {index + 1}
        </SLabel>
        {startedChanging ? (
          <SLabel
            color={changed ? "olive" : undefined}
            className="track-next-index"
          >
            <SIcon name="long arrow alternate right" />
            {futureIndex + 1}
          </SLabel>
        ) : null}
      </div>
    </BasicTrackCard>
  );
}
