import { LyricLine } from '../types';

export function parseSRT(srtContent: string): LyricLine[] {
  const lines = srtContent.trim().split('\n\n');
  const lyrics: LyricLine[] = [];

  for (const block of lines) {
    const blockLines = block.trim().split('\n');
    if (blockLines.length >= 3) {
      const id = parseInt(blockLines[0]);
      const timeMatch = blockLines[1].match(/(\d{2}):(\d{2}):(\d{2}),(\d{3}) --> (\d{2}):(\d{2}):(\d{2}),(\d{3})/);
      
      if (timeMatch) {
        const startTime = parseTimeToSeconds(timeMatch[1], timeMatch[2], timeMatch[3], timeMatch[4]);
        const endTime = parseTimeToSeconds(timeMatch[5], timeMatch[6], timeMatch[7], timeMatch[8]);
        const text = blockLines.slice(2).join(' ');
        
        lyrics.push({
          id,
          startTime,
          endTime,
          text
        });
      }
    }
  }

  return lyrics;
}

function parseTimeToSeconds(hours: string, minutes: string, seconds: string, milliseconds: string): number {
  return parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseInt(seconds) + parseInt(milliseconds) / 1000;
}

export function getLyricFileName(title: string): string {
  // Remove * and + characters from the end of the title
  return title.replace(/[*+]+$/, '');
}