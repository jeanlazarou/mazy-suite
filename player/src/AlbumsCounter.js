import React, { useState } from "react";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import MenuItem from "@mui/material/MenuItem";
import Popover from "@mui/material/Popover";
import Select from "@mui/material/Select";

import { ClearableRating } from "./ClearableRating";

function Color({ color }) {
  return (
    <div
      style={{
        width: 140,
        height: 20,
        border: "thin solid black",
        backgroundColor: color,
      }}
    />
  );
}

export function AlbumsCounter({ count, colors, filter, onFilter }) {
  const [anchor, setAnchor] = useState(null);

  return (
    <>
      <div className="albums-count" onClick={(ev) => setAnchor(ev.currentTarget)}>
        {`${count} albums`}
      </div>
      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{
          paper: {
            sx: { p: 1.5, display: "flex", flexDirection: "column", gap: 1 },
          },
        }}
      >
        <Select
          size="small"
          displayEmpty
          value={filter.value ?? ""}
          onChange={(ev) => {
            const value = ev.target.value === "" ? null : ev.target.value;

            onFilter(
              value,
              value === null ? undefined : colors[value],
              filter.rating,
              filter.showEmpty
            );
          }}
          renderValue={(v) =>
            v === "" ? <em>Any color</em> : <Color color={colors[v]} />
          }
        >
          <MenuItem value="">
            <em>Any color</em>
          </MenuItem>
          {colors.map((color, i) => (
            <MenuItem key={i} value={i}>
              <Color color={color} />
            </MenuItem>
          ))}
        </Select>
        <ClearableRating
          value={filter.rating}
          onChange={(rating) => onFilter(filter.value, filter.color, rating, filter.showEmpty)}
        />
        <FormControlLabel
          control={
            <Checkbox
              checked={filter.showEmpty}
              onChange={(ev) =>
                onFilter(filter.value, filter.color, filter.rating, ev.target.checked)
              }
            />
          }
          label="Show empty albums"
        />
      </Popover>
    </>
  );
}
