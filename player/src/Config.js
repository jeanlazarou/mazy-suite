import _ from "lodash";
import React from "react";
import { useEffect, useState } from "react";
import Autocomplete from "@mui/material/Autocomplete";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";

import { SIcon, SLabel } from "./ui";
import { DATA } from "./api";

import "./Config.css";
import { featuresStorage } from "./features";
import { LocalStorage } from "./LocalStorage";

export const preferencesStorage = new LocalStorage("player-options");

export const LOOP_PLAYLIST = "loop-playlist";
export const LOOP_TRACK = "loop-track";
export const NO_LOOP = "no-loop";
export const EDITOR = "editor";

const loopModes = [
  { key: LOOP_PLAYLIST, text: "Playlist", value: LOOP_PLAYLIST },
  { key: LOOP_TRACK, text: "Track", value: LOOP_TRACK },
  { key: NO_LOOP, text: "No", value: NO_LOOP },
];

const cardFormats = [
  { key: "normal", text: "Normal", value: "normal" },
  { key: "small", text: "Small", value: "small" },
];

const featuresDefault = [
  {
    key: "includeRating",
    label: "Tracks rating",
    enabled: false,
  },
  {
    key: "saveEnabled",
    label: "Save playlist",
    enabled: false,
  },
  {
    key: "saveToClipboard",
    label: "Save to clipboard",
    enabled: false,
  },
  {
    key: "includeTour",
    label: "Player tour",
    enabled: false,
  },
  {
    key: "tourStartsOnLoad",
    label: "Tour auto-start",
    enabled: false,
  },
  {
    key: "includeDescription",
    label: "Track descriptions",
    enabled: false,
  },
].sort((a, b) => (a.label > b.label ? 1 : 0));

const preferencesDefault = [
  {
    key: "loopMode",
    label: "Loop mode",
    value: NO_LOOP,
    options: loopModes,
    nullable: false,
  },
  {
    key: "cardFormat",
    label: "Track cards",
    value: "normal",
    options: cardFormats,
    nullable: false,
  },
  {
    key: "lyricsActive",
    label: "Lyrics subtitle",
    value: false,
  },
  {
    key: "defaultPlaylist",
    label: "Default playlist",
    value: null,
    options: [],
    nullable: true,
  },
  {
    key: "snoozeDuration",
    label: "Snooze duration",
    value: 300,
    nullable: true,
    asNumber: true,
  },
  {
    key: "darkMode",
    label: "Dark mode",
    value: false,
  },
].sort((a, b) => (a.label > b.label ? 1 : 0));

const currentPreferences = () => {
  const current = preferencesStorage.restore();

  _.forEach(current, (value, key) => {
    const option = preferencesDefault.find((e) => e.key === key);

    if (option) option.value = value;
  });

  return preferencesDefault;
};

const currentFeatures = () => {
  const current = featuresStorage.restore();

  _.forEach(current, (value, key) => {
    const feature = featuresDefault.find((e) => e.key === key);

    if (feature) feature.enabled = value;
  });

  return featuresDefault;
};

function Checkbox({ checked, onChange }) {
  return checked ? (
    <SIcon
      color="green"
      name="checkmark"
      size="large"
      style={{ cursor: "pointer" }}
      onClick={() => onChange(false)}
    />
  ) : (
    <SIcon
      color="red"
      name="x"
      size="large"
      style={{ cursor: "pointer" }}
      onClick={() => onChange(true)}
    />
  );
}

function OptionSelect({ option, onValue }) {
  const selected =
    option.options.find((e) => e.value === option.value) || null;

  return (
    <Autocomplete
      options={option.options}
      value={selected}
      size="small"
      disableClearable={!option.nullable}
      getOptionLabel={(e) => e.text}
      isOptionEqualToValue={(a, b) => a.value === b.value}
      sx={{ width: 220 }}
      onChange={(_ev, entry) => onValue(entry ? entry.value : null)}
      renderInput={(params) => <TextField {...params} />}
    />
  );
}

export function Config() {
  const [features, setFeatures] = useState(currentFeatures());
  const [preferences, setPreferences] = useState([]);

  useEffect(() => {
    loadAlbums().then((options) => {
      const option = currentPreferences().find(
        (e) => e.key === "defaultPlaylist"
      );

      option.options = options;

      setPreferences(preferencesDefault);
    });
  }, [preferences, setPreferences]);

  return (
    <div className="config-app">
      <h1>Player configuration</h1>

      <div className="config-tables">
        <Table size="small" sx={{ backgroundColor: "white" }}>
          <TableHead>
            <TableRow>
              <TableCell>Feature</TableCell>
              <TableCell>Enable</TableCell>
            </TableRow>
          </TableHead>

          <TableBody>
            {features.map((feature) => {
              return (
                <TableRow key={feature.key}>
                  <TableCell>{feature.label}</TableCell>
                  <TableCell>
                    <Checkbox
                      checked={feature.enabled}
                      onChange={(checked) => {
                        feature.enabled = checked;
                        featuresStorage.save(feature.key, checked);

                        setFeatures([...features]);
                      }}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        <Table size="small" sx={{ backgroundColor: "white" }}>
          <TableHead>
            <TableRow>
              <TableCell>Option</TableCell>
              <TableCell>Value</TableCell>
            </TableRow>
          </TableHead>

          <TableBody>
            {preferences.map((option) => {
              return (
                <TableRow key={option.key}>
                  <TableCell>{option.label}</TableCell>
                  <TableCell>
                    {option.options ? (
                      <OptionSelect
                        option={option}
                        onValue={(value) => {
                          option.value = value;
                          preferencesStorage.save(option.key, value);

                          setPreferences([...preferences]);
                        }}
                      />
                    ) : option.asNumber ? (
                      <TextField
                        type="number"
                        size="small"
                        value={option.value}
                        onChange={(ev) => {
                          option.value = parseInt(ev.target.value);
                          preferencesStorage.save(option.key, option.value);

                          setPreferences([...preferences]);
                        }}
                      />
                    ) : (
                      <Checkbox
                        checked={option.value}
                        onChange={(checked) => {
                          option.value = checked;
                          preferencesStorage.save(option.key, checked);

                          setPreferences([...preferences]);
                        }}
                      />
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        <SLabel color="purple">Ver. {global.version}</SLabel>
      </div>
    </div>
  );
}

function loadAlbums() {
  return fetch(`${DATA}/albums.json`)
    .then((response) => {
      return response.json();
    })
    .then((list) => {
      return list.map((album) => {
        return {
          key: album.name,
          value: album.name,
          text: album.name
            .replace(/[-]/g, " ")
            .replace(/\w\S*/g, (w) => w.replace(/^\w/, (c) => c.toUpperCase())),
        };
      });
    });
}
