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
  return flattenTimings(song).reduce(
    (acc, { text, start, end }) => {
      const overlaps = start < acc.end;

      acc.elements.push(callback(text, start, end, overlaps, acc.previous));

      if (!overlaps || acc.end < end) acc.end = end;

      acc.previous = { start, end };

      return acc;
    },
    { elements: [], end: 0, previous: null }
  ).elements;
};

export const hasAnomalies = (song) => {
  return flattenTimings(song).reduce(
    (acc, { start, end }) => {
      if (acc.anomalies) return acc;

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

// Every region, with the line of the same rank as text (undefined past the last line)
const flattenTimings = (song) => {
  return toRegions(song.timings).map(({ start, end }, i) => ({
    text: song.lyrics[i],
    start,
    end,
  }));
};

// Pairs the regions, in time order, with the lyrics lines and leaves out what
// cannot go in an SRT file: regions without a line, regions whose line is empty
// (with that line) and lines without a region (empty ones are not reported)
export const toSrtEntries = (song) => {
  const regions = toRegions(song.timings).sort((a, b) => a.start - b.start);

  const result = {
    entries: [],
    regionsWithoutLine: [],
    regionsWithEmptyLine: [],
    linesWithoutRegion: [],
  };

  regions.forEach((region, i) => {
    const text = song.lyrics[i];

    if (text === undefined) {
      result.regionsWithoutLine.push(region);
    } else if (text.trim() === "") {
      result.regionsWithEmptyLine.push(region);
    } else {
      result.entries.push({ ...region, text });
    }
  });

  song.lyrics.slice(regions.length).forEach((text) => {
    if (text.trim() !== "") result.linesWithoutRegion.push(text);
  });

  return result;
};

export const hasSrtProblems = (srt) => {
  return (
    srt.regionsWithoutLine.length > 0 ||
    srt.regionsWithEmptyLine.length > 0 ||
    srt.linesWithoutRegion.length > 0
  );
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