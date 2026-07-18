import { parseLyrics } from "./srt_parser";

const DATA = "../data"

function loadAlbum({ name, color, image }) {
  const ext = image ? image : "jpg";

  return loadPlaylist(`${DATA}/${name}.json`).then((playlist) => ({
    id: name,
    color,
    image: `${DATA}/${name}.${ext}`,
    bigImage: `${DATA}/${name}-500.${ext}`,
    playlist,
  }));
}

export function loadAlbums() {
  return fetch(`${DATA}/albums.json`)
    .then((response) => {
      return response.json();
    })
    .then((result) => {
      const loaders = result.map((e) => loadAlbum(e));
      return Promise.all(loaders);
    })
    .then((lists) => {
      return isDevelopment() ? addTestAlbum(lists) : lists;
    });
}

export function loadPlaylist(url) {
  return fetch(url)
    .then((response) => {
      return response.json();
    })
    .then((result) => convertList(result));
}

export function convertList({ title, period, playlist }) {
  return {
    title,
    period,
    playlist: playlist.map((e) => {
      return {
        rating: 0,
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

export async function loadLyrics(title) {
  if (isDevelopment() && title === "Metronome") return testLyrics();

  const url = `${DATA}/lyrics/${title.replace(/[+*]/, "")}.srt`;

  return await fetch(url)
    .then((response) => {
      return response.text();
    })
    .then((text) => {
      return text ? parseLyrics(title, text) : undefined;
    });
}

export function isDevelopment() {
  return import.meta.env.MODE !== "production" ? true : false;
}

function addTestAlbum(lists) {
  return [...lists, testAlbum];
}

function testLyrics() {
  const timings = testSubtitles.timings;

  const fullTimings = [];

  timings.forEach((e, i) => {
    fullTimings.push(e);

    if (timings[i + 1]) {
      fullTimings.push([e[0] + (timings[i + 1][0] - e[0]) / 2, null]);
    } else {
      fullTimings.push([e[0] + 0.5, null]);
    }
  });

  testSubtitles.timings = fullTimings;

  return testSubtitles;
}

const testAlbum = {
  id: "test-album",
  color: "#ff0000",
  image: "./test-album.jpg",
  bigImage: "./test-album-500.jpg",
  playlist: {
    title: "Test Album",
    period: { from: "2021-11-01", to: "2021-11-07" },
    playlist: [
      {
        title: "Metronome",
        authors: ["Test"],
        enabled: true,
        url: "/music/Metronome.ogg",
        volume: 100,
      },
    ],
  },
};

const testSubtitles = {
  lyrics: [
    "1/1",
    "1/2",
    "1/3",
    "1/4",
    "2/1",
    "2/2",
    "2/3",
    "2/4",
    "3/1",
    "3/2",
    "3/3",
    "3/4",
    "4/1",
    "4/2",
    "4/3",
    "4/4",
    "5/1",
    "5/2",
    "5/3",
    "5/4",
    "6/1",
    "6/2",
    "6/3",
    "6/4",
    "7/1",
    "7/2",
    "7/3",
    "7/4",
  ],
  timings: [
    [0.0, 0],
    [1.47, 1],
    [2.97, 2],
    [4.4, 3],
    [5.95, 4],
    [7.49, 5],
    [8.92, 6],
    [10.46, 7],
    [11.97, 8],
    [13.43, 9],
    [14.98, 10],
    [16.44, 11],
    [17.92, 12],
    [19.46, 13],
    [20.96, 14],
    [22.39, 15],
    [23.89, 16],
    [25.48, 17],
    [26.87, 18],
    [28.33, 19],
    [29.89, 20],
    [31.42, 21],
    [32.89, 22],
    [34.47, 23],
    [35.86, 24],
    [37.45, 25],
    [38.96, 26],
    [40.39, 27],
  ],
};
