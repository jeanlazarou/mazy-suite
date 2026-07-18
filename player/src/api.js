import { Remarkable } from "remarkable";

import { parseLyrics } from "./srt_parser";
import { ALBUMS_FILE } from "./features";

export const DATA = global.features.isolatedPlayer ? "./data" : "../data"

export function listAddress(name) {
  return name ? `${DATA}/${name}.json` : null;
}

function loadAlbum({ name, color, image, displayColor }) {
  const ext = image ? image : "jpg";

  return loadPlaylist(`${DATA}/${name}.json`).then((playlist) => ({
    id: name,
    color,
    displayColor,
    image: `${DATA}/${name}.${ext}`,
    bigImage: `${DATA}/${name}-500.${ext}`,
    playlist,
  }));
}

export function loadAlbums() {
  return fetch(ALBUMS_FILE ? ALBUMS_FILE : `${DATA}/albums.json`)
    .then((response) => {
      return response.json();
    })
    .then((result) => {
      const loaders = result.map((e) => loadAlbum(e));
      return Promise.all(loaders);
    })
    .then((lists) => {
      return lists;
    });
}

export function loadPlaylist(url) {
  return fetch(url)
    .then((response) => {
      return response.json();
    })
    .then((result) => convertList(result));
}

export function convertList({ title, period, playlist, htmlDescription, trackImage, sets }) {
  if (!period) period = { from: new Date() };
  if (!period.to) period.to = period.from;

  return {
    title,
    period,
    htmlDescription,
    trackImage,
    sets,
    playlist: playlist.map((e) => {
      return {
        enabled: true,
        error: false,
        infoLoaded: false,
        id: e.url.replace("/", "-"),
        ...e,
        url: encodeURI(e.url),
        volume: parseInt(e.volume),
      };
    }),
  };
}

export function asReadyList({ title, playlist }) {
  return {
    title,
    playlist: playlist.map((e) => {
      return {
        enabled: true,
        error: false,
        ...e,
        volume: parseInt(e.volume),
      };
    }),
  };
}

function imageLinks(md) {
  var defaultRender = md.renderer.rules.image;

  md.renderer.rules.image = function (tokens, idx) {
    tokens[idx].src = `${DATA}/${tokens[idx].src}`;
    return defaultRender.apply(null, arguments);
  };
}

function linksOpen(md) {
  var defaultRender = md.renderer.rules.link_open;

  md.renderer.rules.link_open = function (_tokens, _idx, options) {
    if (!options.linkTarget) options.linkTarget = "_blank";
    return defaultRender.apply(null, arguments);
  };
}

export async function loadPlaylistDescription(listURL, { playlist, htmlDescription }) {
  const byTitle = playlist.reduce((acc, song) => {
    const c = song.creationDate;
    const a = `${song.authors.join(", ")}`;
    const ac = c ? `${a} - ${c}` : a;

    acc[song.title] = { a, c, ac };

    return acc;
  }, {});

  const baseUrl = listURL
    ? listURL.endsWith("json")
      ? listURL.replace(/\.json$/, "")
      : listURL.replace(/\.(md|html)$/, "")
    : `${DATA}/playlist`;

  const htmlUrl = `${baseUrl}.html`;
  const mdUrl = `${baseUrl}.md`;

  // Use HTML if explicitly specified in the playlist definition
  if (htmlDescription) {
    try {
      const htmlResponse = await fetch(htmlUrl);
      if (htmlResponse.ok) {
        const htmlContent = await htmlResponse.text();
        return { content: htmlContent, isHtml: true };
      }
    } catch (error) {
      console.warn(`HTML description specified but file not found: ${htmlUrl}`);
    }
  }

  // Use markdown (default)
  return fetch(mdUrl)
    .then((response) => {
      if (response.ok) return response.text();

      return "No description";
    })
    .then((content) => {
      const md = preProcessDescription(content, byTitle);

      var renderer = new Remarkable({html: true}).use(imageLinks).use(linksOpen);

      const description = renderer.render(md);

      return { content: description, isHtml: false };
    })
    .catch(() => {
      return { content: "No description", isHtml: false };
    });
}

export function openPlayer(data, newPage = true) {
  const url = `${window.location.href}?list=${data.id}`;

  if (newPage) {
    window.open(url, "_blank");
  } else {
    document.location.href = url;
  }
}

export async function loadLyrics(songTitle) {
  const url = `${DATA}/lyrics/${songTitle.replace(/[+*]/, "")}.srt`;

  return await fetch(url)
    .then((response) => {
      return response.text();
    })
    .then((text) => {
      return text ? parseLyrics(songTitle, text) : undefined;
    });
}

function preProcessDescription(content, byTitle) {
  let current = null;
  let styles = [];
  let consumingStyles = false;

  const processed = content
    .split("\n")
    .map((line) => {
      const startOfStyles = line.match(/<style>/);
      consumingStyles = consumingStyles || startOfStyles;

      if (startOfStyles) return "";

      if (consumingStyles) {
        const match = line.match(/<\/style>/);

        if (match) {
          consumingStyles = false;
          return "";
        }

        styles.push(line);

        return "";
      }

      let match = line.match(/\$T:(.*)/);

      if (match) {
        const title = match[1].replace("\\*", "*");

        current = byTitle[title];

        return line.replace(/\$T:/, "");
      }

      match = line.match(/\$AC/);

      if (match) {
        const value = current ? current.ac : "";

        return line.replace(/\$AC/, value);
      }

      return line;
    })
    .join("\n");

  setStyles(styles.join("\n"));

  return processed;
}

function setStyles(styles) {
  const styleSheet = document.createElement("style");

  styleSheet.innerText = styles;

  document.head.appendChild(styleSheet);
}
