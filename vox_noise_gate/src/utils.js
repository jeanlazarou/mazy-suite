export function toTimecode(time) {
  const i = Math.floor(time);

  const ms = `${1000 + Math.floor((time - i) * 1000)}`.substring(1);
  const sec = `${100 + (i % 60)}`.substring(1);
  const min = `${100 + Math.floor(i / 60)}`.substring(1);

  return `${min}:${sec}.${ms}`;
}

export function formatTime(time) {
  const toString = (x) => `${x < 10 ? "0" : ""}${x}`;

  const min = Math.floor(time / 60);

  const remains = time % 60;
  const sec = Math.floor(remains % 60);
  const millis = Math.floor((remains - sec) * 100);

  return `${toString(min)}:${toString(sec)}:${toString(millis)}`;
}

// 75.4 -> "1:15", 4.2 -> "4.2 s"
export function formatDuration(seconds) {
  if (seconds < 10) return `${seconds.toFixed(1)} s`;

  const total = Math.round(seconds);

  return `${Math.floor(total / 60)}:${`${100 + (total % 60)}`.substring(1)}`;
}

export function baseName(fileName) {
  return fileName.replace(/\.[^.]+$/, "");
}

// lets a "Reading…" message paint before a long computation blocks the page
export const nextFrame = () =>
  new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
