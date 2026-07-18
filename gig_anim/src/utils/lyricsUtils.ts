import { Lyric } from "../types";

export const parseSRT = (srtContent: string): Lyric[] => {
  const lines = srtContent.trim().split("\n\n");
  return lines.map((line) => {
    const [, times, text] = line.split("\n");
    const [start, end] = times.split(" --> ").map(timeToSeconds);
    return { start, end, text };
  });
};

const timeToSeconds = (time: string): number => {
  const [hours, minutes, seconds] = time.split(":");
  return (
    parseFloat(hours) * 3600 + parseFloat(minutes) * 60 + parseFloat(seconds)
  );
};
