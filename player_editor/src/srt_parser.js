//
// SRT file parser
//
// Should accept next formatting, but this implementation does not...
//     Bold	<b>…</b> or {b}…{/b}
//     Italic	<i>…</i> or {i}…{/i}
//     Underline	<u>…</u> or {u}…{/u}
//     Font Color	<font color=“white”>…</font>
//

export function parseLyrics(title, content) {
  const lyricsData = {
    title,
    lyrics: [],
    timings: [],
    savedTimings: new Set(),
  };

  const { data, anomalies } = parseContent(content);

  const total = anomalies.countFrom + anomalies.countTo + anomalies.countId;

  if (total > 0) {
    anomalies.invalid = true;

    return { lyricsData, anomalies };
  }

  validate(data, anomalies);

  data.forEach(({ id, text, from, to }) => {
    lyricsData.lyrics.push(text);

    lyricsData.timings.push([from, id]);
    lyricsData.timings.push([to, null]);

    lyricsData.savedTimings.add(from);
  });

  return { lyricsData, anomalies };
}

function parseContent(content) {
  const data = [];
  const anomalies = {
    invalid: false,
    warning: false,
    countId: 0,
    countFrom: 0,
    countTo: 0,
  };

  eachItem(content.split("\n"), (id, text, timing) => {
    const region = timing.split("-->");

    const from = parseTime(region[0]);
    const to = parseTime(region[1]);

    data.push({
      id,
      from,
      to,
      text,
    });

    if (isNaN(id)) anomalies.countId++;
    if (isNaN(to)) anomalies.countTo++;
    if (isNaN(from)) anomalies.countFrom++;
  });

  return { data, anomalies };
}

function validate(data, anomalies) {
  anomalies.invalidId = [];
  anomalies.invalidTo = [];
  anomalies.invalidFrom = [];
  anomalies.invalidRegion = [];

  data.forEach(({ id, from, to }, i) => {
    if (id !== i + 1) {
      anomalies.invalid = true;
      anomalies.invalidId.push(`Expected ${i + 1} was ${id}`);
    }

    if (i === 0) return;

    if (from <= data[i - 1].from) {
      anomalies.warning = true;
      anomalies.invalidFrom.push(
        `Timing ${id} (${from}) start is before previous`
      );
    }

    if (to <= data[i - 1].to) {
      anomalies.warning = true;
      anomalies.invalidTo.push(`Timing ${id} (${to}) end is before previous`);
    }

    if (from >= to) {
      anomalies.invalid = true;
      anomalies.invalidRegion.push(
        `Timing ${id} invalid range (${from} --> ${to})`
      );
    }
  });
}

function eachItem(items, processor) {
  if (items[0] !== "1") return;

  let i = 0;

  for (;;) {
    const id = items[i++];
    const timing = items[i++];

    if (id === undefined || timing === undefined) return;

    const text = [];

    for (;;) {
      if (items[i] === "") break;
      if (items[i] === undefined) {
        processor(parseInt(id), text.join(" "), timing);

        return;
      }

      text.push(items[i++]);
    }

    i++;

    processor(parseInt(id), text.join(" "), timing);
  }
}

function parseTime(str) {
  const [hours, minutes, seconds] = str.split(":");

  return (
    parseInt(hours) * 3600.0 +
    parseInt(minutes) * 60.0 +
    parseFloat(seconds.replace(",", "."))
  );
}
