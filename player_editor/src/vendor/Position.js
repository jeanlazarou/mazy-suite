import React from "react";
import { usePosition } from "./usePosition";

function formatTime(time) {
  const toString = (x) => `${x < 10 ? "0" : ""}${x}`;

  const min = Math.floor(time / 60);

  const remains = time % 60;
  const sec = Math.floor(remains % 60);
  const millis = Math.floor((remains - sec) * 100);

  return `${toString(min)}:${toString(sec)}:${toString(millis)}`;
}

export function Position({ rotation, duration, children }) {
  const position = usePosition(rotation, duration);

  const kids = React.Children.map(children, (child) =>
    React.cloneElement(child, { position })
  );

  return kids ? kids : null;
}

Position.Time = ({ position, style }) => {
  return <div style={style}>{formatTime(position / 1000)}</div>;
};
