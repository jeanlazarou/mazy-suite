import { useCallback, useMemo, useRef, useState } from 'react';
import { useAnimationFrame } from 'framer-motion';
import { AnimationType, Lyric, Track } from '../types';
import { useExternalCommands } from '../context/ExternalCommandsContext';
import { shuffleArray } from '../utils/arrayUtils';

// The animations that show the lines either in time with the song or at random
export const CAN_FOLLOW_SONG: AnimationType[] = ['blinds', 'filings', 'grid', 'scatter', 'spiral', 'spotlight'];

// Unset, only spotlight follows the song: it always did, the others didn't
export const followsSong = (track: Track) => CAN_FOLLOW_SONG.includes(track.animationType)
  && (track.followSong ?? track.animationType === 'spotlight');

const GAP = 0.8; // s between two lines shown at random
const READY = 24; // random lines planned after the one in focus

// The line in focus: the one being sung, else the next to come, else the last
export const lineInFocus = (lines: Lyric[], position: number): number => {
  const singing = lines.findIndex(line => line.start <= position && position < line.end);
  if (singing !== -1) return singing;
  const upcoming = lines.findIndex(line => line.start > position);
  return upcoming !== -1 ? upcoming : lines.length - 1;
};

// How much of the line has been sung, from 0 to 1
export const sungPart = (line: Lyric | undefined, position: number) => {
  if (!line) return 0;
  if (line.end <= line.start) return position >= line.end ? 1 : 0;
  return Math.min(1, Math.max(0, (position - line.start) / (line.end - line.start)));
};

// Every different line once, in random order, each for as long as it's sung
const planRound = (distinct: Lyric[], after: Lyric | undefined, from: number): Lyric[] => {
  const round = shuffleArray(distinct);
  if (round.length > 1 && round[0].text === after?.text) {
    [round[0], round[round.length - 1]] = [round[round.length - 1], round[0]];
  }
  let start = after ? after.end + GAP : from;
  return round.map(line => {
    const length = Math.min(7, Math.max(2.5, line.end - line.start));
    const planned = { text: line.text, start, end: start + length };
    start = planned.end + GAP;
    return planned;
  });
};

export interface SongTimeline {
  song: Lyric[]; // the song's lines, in order
  lines: Lyric[]; // the lines as shown: the song's, or more random ones as needed
  focus: number; // in lines, -1 while there are none
  position: () => number; // s, on the lines' times
}

// Following the song, its lines at their times: where the linked prompter is
// in the song, else since the animation shows. Otherwise the lines at random,
// without end.
export const useSongTimeline = (lyrics: Lyric[], follow: boolean, lead = 0): SongTimeline => {
  const { prompterClock } = useExternalCommands();
  const startedAt = useRef(performance.now());
  const song = useMemo(() => lyrics
    .filter(line => line.text.trim())
    .sort((a, b) => a.start - b.start), [lyrics]);
  const distinct = useMemo(() => song
    .filter((line, i) => song.findIndex(other => other.text === line.text) === i), [song]);
  const [planned, setPlanned] = useState<Lyric[]>([]);
  const [focus, setFocus] = useState(-1);
  const lines = follow ? song : planned;

  const position = useCallback(() => {
    const now = performance.now();
    const clock = follow ? prompterClock.current : null;
    return lead + (clock
      ? clock.position + (clock.playing ? (now - clock.receivedAt) / 1000 : 0)
      : (now - startedAt.current) / 1000);
  }, [follow, lead, prompterClock]);

  useAnimationFrame(() => {
    if (song.length === 0) return;
    const at = position();
    const shown = lineInFocus(lines, at);
    if (!follow && lines.length - shown < READY) {
      setPlanned(previous => {
        let next = previous;
        while (next.length - shown < READY) next = [...next, ...planRound(distinct, next[next.length - 1], at)];
        return next;
      });
    }
    setFocus(shown);
  });

  return { song, lines, focus, position };
};
