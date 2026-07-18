import { decodeAudioFile } from './context';
import { useStore } from '../store/store';
import type { AlbumTrack } from '../store/store';

const AUDIO_FILE_RE = /\.(wav|mp3|flac|ogg|aiff|aif|m4a)$/i;

let nextTrackId = 1;

/**
 * Decode the given files and add them as tracks (in name order, like the
 * CLI album command). The first loaded track becomes active if none is.
 */
export async function loadAudioFiles(files: File[]): Promise<void> {
  const { setError, setLoading, addTracks } = useStore.getState();

  const audioFiles = files.filter(
    (f) => f.type.startsWith('audio/') || AUDIO_FILE_RE.test(f.name)
  );
  if (audioFiles.length === 0) {
    setError('Please select audio files');
    return;
  }
  audioFiles.sort((a, b) => a.name.localeCompare(b.name));

  setLoading(true);
  try {
    const tracks: AlbumTrack[] = [];
    for (const file of audioFiles) {
      const buffer = await decodeAudioFile(file);
      tracks.push({
        id: `track-${nextTrackId++}`,
        name: file.name,
        buffer,
        info: {
          name: file.name,
          duration: buffer.duration,
          sampleRate: buffer.sampleRate,
          channels: buffer.numberOfChannels,
        },
        analysis: null,
        blocks: null,
      });
    }
    addTracks(tracks);
  } catch (err: any) {
    setError(`Failed to decode: ${err.message}`);
  } finally {
    setLoading(false);
  }
}

/** Open a file picker and load the selection as tracks. */
export function openAudioFilePicker(): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'audio/*,.wav,.mp3,.flac,.ogg,.aiff,.aif';
  input.multiple = true;
  input.onchange = () => {
    if (input.files?.length) loadAudioFiles(Array.from(input.files));
  };
  input.click();
}
