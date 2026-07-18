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
  const result = { title, lyrics: [], timings: [] };

  eachItem(content.split("\n"), (id, text, timing) => {
    const [from, to] = timing.split("-->");

    result.lyrics.push(text);
    result.timings.push([parseTime(from), id]);
    result.timings.push([parseTime(to), null]);
  });

  return result;
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
