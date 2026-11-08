import React, { useLayoutEffect, useRef } from "react";

import "./ColorFill.css";

// Paints a color on a canvas filling its parent (which needs `position:
// relative; isolation: isolate`): Samsung Internet's dark mode recolors all
// CSS and SVG colors, whatever the page declares, but leaves canvases alone.
export function ColorFill({ color, opacity = 1, over }) {
  const canvas = useRef(null);

  useLayoutEffect(() => {
    const context = canvas.current.getContext("2d");

    context.clearRect(0, 0, 4, 4);

    if (over) {
      context.globalAlpha = 1;
      context.fillStyle = over;
      context.fillRect(0, 0, 4, 4);
    }

    context.globalAlpha = opacity;
    context.fillStyle = color;
    context.fillRect(0, 0, 4, 4);
  }, [color, opacity, over]);

  return (
    <canvas
      ref={canvas}
      width={4}
      height={4}
      className="color-fill"
      aria-hidden="true"
    />
  );
}
