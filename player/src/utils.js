import { DateTime } from "luxon";
import { useMediaQuery } from "react-responsive";

import { convertList, DATA } from "./api";

export function isPositionAfterTiming(position, timing) {
  return position * 100 >= Math.floor(timing * 100);
}

export function useIsMobile() {
  return useMediaQuery({
    query: "(max-device-width: 1224px)",
  });
}

export function formatSince(strDate, options = { dateOnly: false }) {
  if (!strDate) return [undefined, undefined];

  let d = DateTime.fromHTTP(strDate);

  if (!d.isValid) d = DateTime.fromJSDate(new Date(strDate));

  const time = options.dateOnly
    ? ""
    : " " +
    d.toISOTime({
      suppressMilliseconds: true,
      includeOffset: false,
    });

  return [`${d.toISODate()} ${time}`, d.setLocale("en").toRelative()];
}

export function isRecent(track) {
  const diff = Math.round(
    Math.abs(DateTime.fromHTTP(track.lastModified).diffNow("days").days)
  );

  return track.lastModified && (track.isNew || diff < 2);
}

export function formatTime(time) {
  const toS = (x) => `${x < 10 ? "0" : ""}${x}`;

  const hour = Math.floor(time / 3600);
  const min = Math.floor((time - hour * 3600) / 60);
  const sec = time % 60;

  return hour === 0
    ? `${toS(min)}:${toS(sec)}`
    : `${toS(hour)}:${toS(min)}:${toS(sec)}`;
}

export const formatTitle = (url) => {
  const name = url.match(/\/(.*)\.mp3$/i);

  if (!name) return url;

  const match = name[1].match(/^\d+_(.*)/);

  return match ? match[1] : name[1];
};

export function trackTitle(track) {
  return track.title ? track.title : formatTitle(track.url);
}

/**
 * Calculate the track image path based on the trackImage template and track index.
 * The template should contain "01" which will be replaced with the track number (01, 02, 03, etc.)
 *
 * @param {string} trackImageTemplate - The template path (e.g., "default/colors-01.jpg")
 * @param {number} trackIndex - The zero-based index of the track in the playlist
 * @returns {string|null} The full path to the track image, or null if no template or "01" not found
 */
export function getTrackImagePath(trackImageTemplate, trackIndex) {
  if (!trackImageTemplate || !trackImageTemplate.includes("01")) {
    return null;
  }

  // Track index is 0-based, but we want 01, 02, 03, etc.
  const trackNumber = String(trackIndex + 1).padStart(2, "0");
  const imagePath = trackImageTemplate.replace("01", trackNumber);

  return `${DATA}/${imagePath}`;
}

const OggSignature = [0x4f, 0x67, 0x67, 0x53];
const MP3Signature1 = [0xff, 0xfb];
const MP3Signature2 = [0x49, 0x44, 0x33];
const MP3Signature3 = [0xff, 0xf3];
const MP3Signature4 = [0xff, 0xf2];

const isOgg = (a) =>
  a[0] === OggSignature[0] &&
  a[1] === OggSignature[1] &&
  a[2] === OggSignature[2] &&
  a[3] === OggSignature[3];

const isMP3 = (a) =>
  (a[0] === MP3Signature2[0] &&
    a[1] === MP3Signature2[1] &&
    a[2] === MP3Signature2[2]) ||
  (a[0] === MP3Signature1[0] && a[1] === MP3Signature1[1]) ||
  (a[0] === MP3Signature3[0] && a[1] === MP3Signature3[1]) ||
  (a[0] === MP3Signature4[0] && a[1] === MP3Signature4[1])
  ;

export const isAudioData = (data) => isMP3(data) || isOgg(data);

// From: https://stackoverflow.com/a/47355187
export function standardizeColor(colorString) {
  var ctx = document.createElement("canvas").getContext("2d");

  ctx.fillStyle = colorString;

  const color = ctx.fillStyle;

  const r = parseInt(color.slice(1, 3));
  const g = parseInt(color.slice(3, 5));
  const b = parseInt(color.slice(5));

  return [r, g, b];
}

// Based on: http://www.levibotelho.com/development/calculate-the-best-text-colour-for-a-given-background/
export function bestForegroundColor(colorString) {
  if (!colorString) return undefined;

  const [red, green, blue] = standardizeColor(colorString);

  const luminosity = Math.sqrt(
    Math.pow(red, 2) * 0.299 +
    Math.pow(green, 2) * 0.587 +
    Math.pow(blue, 2) * 0.114
  );

  return luminosity > 186 ? "black" : "white";
}

export function sortTimings(timings) {
  return [...timings].sort((t1, t2) => {
    const comp = t1[0] - t2[0];
    return comp === 0 ? t1.version - t2.version : comp;
  });
}

export function cleanupTimings(timings) {
  return sortTimings(timings).reduce(
    (acc, t) => {
      if (t.version || t.version === 0) delete t.version;

      if (t[0] === acc.previous) {
        acc.data[acc.data.length - 1] = t;
      } else {
        acc.data.push(t);
      }

      acc.previous = t[0];

      return acc;
    },
    { data: [], previous: -1 }
  ).data;
}

export function createSaveLink(name, allSongs, selected) {
  const playlist = { title: name, playlist: [] };

  allSongs.forEach((song) => {
    if (selected.has(song.id)) {
      playlist.playlist.push({
        id: song.id,
        url: song.url,
        title: song.title,
        rating: song.rating,
        authors: song.authors,
        volume: song.volume,
      });
    }
  });

  const a = document.createElement("a");
  const file = new Blob([JSON.stringify(playlist)], {
    type: "application/json",
  });

  a.href = URL.createObjectURL(file);
  a.download = name;

  return [playlist, a];
}

export function isJSONFile(file) {
  return file.type === "application/json" || /\.json$/im.test(file.name);
}

export async function loadCustomPlaylist(event, onLoaded) {
  async function readFile(file) {
    return new Promise((success, failure) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        const content = e.target.result;

        try {
          var data = JSON.parse(content);

          if (data.playlist) {
            success(convertList(data));
          } else {
            failure("Invalid file, no playlist found");
          }
        } catch (error) {
          const message =
            "Error reading file: " + file.name + "\n\nInvalid JSON file";

          failure(message);
        }
      };

      reader.readAsText(file);
    });
  }

  const file = event.target.files[0];

  if (isJSONFile(file)) {
    try {
      const playlist = await readFile(file);

      onLoaded(playlist);
    } catch (error) {
      alert(error);
    }
  } else {
    alert("File type is not supported");
  }
}
