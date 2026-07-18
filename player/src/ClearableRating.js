import React from "react";
import Rating from "@mui/material/Rating";

import { SIcon } from "./ui";

export function ClearableRating({ onChange, value, style }) {
  return (
    <div
      style={{
        padding: 10,
        borderRadius: ".285rem",
        border: "1px solid rgba(34,36,38,.15)",
        display: "flex",
        alignItems: "center",
        gap: 8,
        ...style,
      }}
    >
      <Rating
        max={5}
        size="small"
        value={value || 0}
        onChange={(_ev, rating) => onChange(rating)}
      />
      <SIcon
        name="x"
        style={{ cursor: "pointer" }}
        onClick={() => onChange(null)}
      />
    </div>
  );
}
