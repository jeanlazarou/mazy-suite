import { useState, useEffect } from "react";

export function usePosition(current, rotation, duration) {
  const [, setRotation] = useState(rotation);
  const [position, setPosition] = useState(0);

  useEffect(() => {
    if (rotation === undefined) return;

    setRotation((prevValue) => {
      if (rotation === prevValue) return prevValue;

      const diff = Math.abs(rotation - prevValue);

      const gap = diff > 10 ? 100 : 10;

      const increment = rotation > prevValue ? gap : -gap;

      setPosition(() => {
        const v = current + increment;

        if (v < 0) return 0;
        if (v > duration) return duration;

        return v;
      });

      return rotation;
    });
  }, [current, duration, rotation]);

  return position;
}
