export function toSMPTETimecode(time) {
  const i = Math.floor(time);

  const ms = `${1000 + Math.floor((time - i) * 1000)}`.substring(1);
  const sec = `${100 + (i % 60)}`.substring(1);
  const min = `${100 + Math.floor(i / 60)}`.substring(1);

  return `00:${min}:${sec},${ms}`;
}

export function formatTime(time) {
  const toString = (x) => `${x < 10 ? "0" : ""}${x}`;

  const min = Math.floor(time / 60);

  const remains = time % 60;
  const sec = Math.floor(remains % 60);
  const millis = Math.floor((remains - sec) * 100);

  return `${toString(min)}:${toString(sec)}:${toString(millis)}`;
}

export function isPositionAfterTiming(position, timing) {
  return position * 100 >= Math.floor(timing * 100);
}

const symbols = "123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

export const toMarkers = (timings, savedTimings, withLabels) => {
  const changedColor = "rgba(114, 34, 119, 0.3)"; // Violet for changed
  const savedColor = "rgba(119, 119, 119, 0.3)"; // Gray for saved

  // Convert timing pairs to regions instead of point markers
  const regions = toRegions(timings);
  
  return regions.map((region, i) => {
    const isStartSaved = savedTimings.has(region.start);
    const color = isStartSaved ? savedColor : changedColor;

    return {
      start: region.start,
      end: region.end,
      label: withLabels ? markerLabel(i) : undefined,
      color,
    };
  });
};

export const markerLabel = (i) => {
  return symbols[i % symbols.length];
};

export const toRegions = (timings) => {
  return timings.reduce(
    (acc, timing) => {
      if (timing[1] !== null) {
        acc.previous = timing;

        return acc;
      }

      const start = acc.previous[0];
      const end = timing[0];

      acc.regions.push({
        start,
        end,
      });

      return acc;
    },
    { regions: [], previous: null }
  ).regions;
};

export const updateTiming = (timings, value, i = -1) => {
  let part1;
  let part2 = [];

  if (i >= 0) {
    part1 = groupPairs(timings.slice(0, i));

    part2 = groupPairs(timings.slice(i + 2));
  } else {
    part1 = groupPairs(timings);
  }

  return [
    ...part1,
    ...part2,
    [
      [value.start, -1],
      [value.end, null],
    ],
  ]
    .sort((a, b) => a[0][0] - b[0][0])
    .flatMap((e, i) => [[e[0][0], i + 1], e[1]]);
};

const groupPairs = (timings) => {
  return timings.reduce(
    (acc, timing) => {
      if (timing[1] !== null) {
        acc.previous = timing;
        return acc;
      }

      // Only push a pair if we have a valid previous timing
      if (acc.previous !== null) {
        acc.groups.push([acc.previous, timing]);
      }

      return acc;
    },
    { groups: [], previous: null }
  ).groups;
};

export const mapTimings = (song, callback) => {
  return song.lyrics.reduce(
    (acc, t, i) => {
      if (!song.timings[i * 2]) return acc;

      const start = song.timings[i * 2][0];
      const end = song.timings[i * 2 + 1][0];

      const overlaps = start < acc.end;

      acc.elements.push(callback(t, start, end, overlaps, acc.previous));

      if (!overlaps || acc.end < end) acc.end = end;

      acc.previous = { start, end };

      return acc;
    },
    { elements: [], end: 0, previous: null }
  ).elements;
};

export const hasAnomalies = (song) => {
  return song.lyrics.reduce(
    (acc, t, i) => {
      if (acc.anomalies) return acc;
      if (!song.timings[i * 2]) return acc;

      const start = song.timings[i * 2][0];
      const end = song.timings[i * 2 + 1][0];

      acc.anomalies = start < acc.end;

      if (!acc.anomalies || acc.end < end) acc.end = end;

      acc.previous = { start, end };

      return acc;
    },
    { anomalies: false, end: 0, previous: null }
  ).anomalies;
};

export const timingsQuickFix = (song) => {
  const timings = flattenTimings(song);

  return timings.map((current, i) => {
    const next = timings[i + 1];

    if (!next) return current;

    if (next.start < current.end) {
      current.end = next.start;
    }

    return current;
  });
};

const flattenTimings = (song) => {
  return song.lyrics.reduce((acc, text, i) => {
    if (!song.timings[i * 2]) return acc;

    const start = song.timings[i * 2][0];
    const end = song.timings[i * 2 + 1][0];

    acc.push({ text, start, end });

    return acc;
  }, []);
};

export const shiftTimingsInRange = (song, range, toPosition, duration) => {
  const timings = flattenTimings(song);

  if (timings.length === 0 || range === undefined) return undefined;

  const tillTheEnd = range.end >= Math.floor(duration / 1000)

  let offset = undefined

  const changed = timings.map(timing => {
    if (timing.start >= range.start && (tillTheEnd || timing.end <= range.end)) {
      //if (!offset) offset = timing.start - toPosition;
      if (!offset) {
        offset = toPosition - timing.start;
      }

      return {
        ...timing,
        start: timing.start + offset,
        end: timing.end + offset,
      }
    } else {
      return { ...timing }
    }
  })
    .sort((a, b) => a.start - b.start)
    .reduce((acc, { start, end }, i) => {
      acc.push([start, i + 1]);
      acc.push([end, null]);

      return acc;
    }, []);


  return { ...song, timings: changed };
}